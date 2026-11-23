#!/usr/bin/env python3
"""Builds the shape of Vael: one heightfield for the whole valley, with roads and a reach map.

    python3 tools/world/make_world.py [--preview DIR]

Writes assets/world/height.bin (heights), roads.bin (where the roads run) and reach.bin (how each
spot can be reached: 1 on foot, 2 with a jump, 3 with the double jump, 0 not at all), and checks
that every waystone, shrine, camp and grove can be reached on foot from its region's entrance.
The game loads these files; it does not generate terrain itself. Places come from src/data.js (via
points.mjs), so moving a camp there and running this again reshapes the ground around it.

How the land is made:
  1. Gradient noise, bent by domain warping so nothing lines up, for rolling ground.
  2. Ridged multifractal noise for mountain crests: rugged peaks, smoother valleys.
  3. Each region gets its own character: meadow knolls, the Emberridge volcano, the Mirrormere
     wetland, Stormreach's stepped highland and Gloamwood's ravines.
  4. Hydraulic erosion: tens of thousands of raindrops run downhill, carving gullies and valleys.
  5. After erosion: sheer cliffs along the ranges between regions (so only the passes join them),
     ledges and stairs cut into the land, and the volcano's crater with its lava lake.
  6. Flat ground for every place in data.js, then roads routed between them (A* search that
     avoids steep climbs) and carved in with a gentle grade.
"""
import argparse, heapq, json, math, os, subprocess, tempfile, time
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'world')
SIZE, HALF, N = 640, 320, 512          # 1.25 world units per cell
NV, CELL = N + 1, SIZE / N
xs = -HALF + np.arange(NV) * CELL
X, Z = np.meshgrid(xs, xs)               # H[j, i] is at x = xs[i], z = xs[j], as in the game
R = np.hypot(X, Z); AX, AZ = np.abs(X), np.abs(Z)

# movement limits, matching the game (src/combat.js moveXZ and src/player.js jump)
WALK = 0.85 * CELL                       # a rise per cell you can walk up
JUMP, DOUBLE = 2.15, 3.6                 # rises you can clear with a jump, and with the double jump


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- noise
_G = np.random.default_rng(20261122).uniform(0, 2 * math.pi, 4096)
GX, GY = np.cos(_G), np.sin(_G)

def _idx(ix, iy, seed):
    h = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263 + seed * 1442695041) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return (h ^ (h >> 16)) & 4095

def perlin(x, y, seed=0):
    xi, yi = np.floor(x), np.floor(y); xf, yf = x - xi, y - yi
    def g(ix, iy, dx, dy): k = _idx(ix, iy, seed); return GX[k] * dx + GY[k] * dy
    u = xf * xf * xf * (xf * (xf * 6 - 15) + 10); v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
    a = g(xi, yi, xf, yf); a = a + (g(xi + 1, yi, xf - 1, yf) - a) * u
    b = g(xi, yi + 1, xf, yf - 1); b = b + (g(xi + 1, yi + 1, xf - 1, yf - 1) - b) * u
    return (a + (b - a) * v) * 1.4

def fbm(x, y, o=5, seed=0):
    s, a, f, n = 0, 1.0, 1.0, 0
    for i in range(o): s = s + a * perlin(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2
    return s / n

def ridged(x, y, o=6, seed=0):
    s, w, a, f, n = 0, 1.0, 1.0, 1.0, 0
    for i in range(o):
        sig = (1 - np.abs(perlin(x * f, y * f, seed + i * 31))) ** 2 * w
        w = np.clip(sig * 1.6, 0, 1); s = s + sig * a; n += a; a *= 0.5; f *= 2.05
    return s / n

def terrace(h, step, sharp):
    k = h / step; i = np.floor(k); f = k - i
    return (i + smooth(0.5 - sharp, 0.5 + sharp, f)) * step


# ---------------------------------------------------------------- where each region is
def lines(wx, wz):
    """The wandering lines between regions: the meadow's ring and the two diagonals. Near the passes
    the ring is pinned to the true circle, so each pass gate stays where data.js puts it."""
    pw = np.where(AX > AZ, smooth(0, 45, AZ), smooth(0, 45, AX))
    Xr, Zr = X + wx * 130 * pw, Z + wz * 130 * pw
    Xd, Zd = X + wx * 110, Z + wz * 110
    return np.hypot(Xr, Zr), Xd, Zd

def labels(wx, wz):
    """Which region each spot belongs to: 0 meadow, 1 ember, 2 gloam, 3 tide, 4 storm."""
    Rw, Xd, Zd = lines(wx, wz); ad, bd = np.abs(Xd), np.abs(Zd)
    return np.where(Rw < 126, 0, np.where(ad > bd, np.where(Xd > 0, 1, 2), np.where(Zd > 0, 3, 4))).astype(np.uint8)

NAMES = ['meadow', 'ember', 'gloam', 'tide', 'storm']

# ---------------------------------------------------------------- the land, before erosion
LB = None   # the label map, set once the warp is known
RANGES = np.zeros_like(X)   # how far into a mountain range each spot is (0 to 1)

def regions():
    return LB == 1, LB == 2, LB == 3, LB == 4

def warp():
    px, pz = X / 100.0, Z / 100.0
    wx = fbm(px + 3.1, pz + 7.7, 4, 101) * 0.35; wz = fbm(px - 5.2, pz + 1.3, 4, 202) * 0.35
    return px + wx, pz + wz, wx, wz

def base(P):
    global LB
    qx, qz, wx, wz = warp(); LB = labels(wx, wz)
    hills = fbm(qx * 1.6, qz * 1.6, 5, 1); crest = ridged(qx * 1.25, qz * 1.25, 6, 2)
    Rw, Xd, Zd = lines(wx, wz); AXw, AZw = np.abs(Xd), np.abs(Zd)
    # the mountain ranges stand along the region lines: wide massifs whose flanks curve in like real
    # ones (steep near the top, easing out at the foot), opening at the four passes
    passg = np.where(AX > AZ, smooth(12, 34, AZ), smooth(12, 34, AX))
    prof = lambda d, W: (1 - smooth(0, W, d)) ** 1.6
    spur = 1 + 0.35 * fbm(qx * 3.1, qz * 3.1, 4, 41)           # wider here, narrower there
    V = P['volcano']; rv = np.hypot(X - V['x'], Z - V['z'])
    ring = prof(np.abs(Rw - 126) / spur, 46) * passg
    diag = prof(np.abs(AXw - AZw) * 0.7071 / spur, 44) * smooth(108, 132, R)
    edge = prof(np.maximum(0, 296 - np.maximum(AX, AZ)), 50) * smooth(V['base'] * 0.75, V['base'] * 1.15, rv)
    ranges = np.clip(np.maximum(np.maximum(ring, diag), edge), 0, 1)
    RANGES[...] = ranges
    w = smooth(112, 138, Rw); ember, gloam, tide, storm = regions()   # meadow to region, along the wandering ring
    meadow = np.maximum(0.8, 2.6 + hills * 3.2)
    cone = 4 + (V['top'] - 4) * np.clip((V['base'] - rv) / (V['base'] - V['rim']), 0, 1) ** 1.6
    emb = np.maximum(3.5 + hills * 3, cone + (crest - 0.5) * 6 * np.clip((V['base'] - rv) / 60, 0, 1))
    td = 0.3 + hills * 3.2 + np.clip(ridged(qx * 3, qz * 3, 4, 13) - 0.7, 0, 1) * 30
    # the mere itself: a wide, shallow lake with a wandering shore (places in it become islands)
    mere = np.hypot((X + wx * 90 - 15) / 1.25, Z + wz * 90 - 232)
    td = td - smooth(78, 40, mere) * (td + 1.6)
    stm = 10 + hills * 8 + np.clip(crest - 0.3, 0, 1) * 22
    glm = 4 + hills * 6 - (1 - np.abs(perlin(qx * 2.6, qz * 2.6, 23))) ** 8 * 7
    outer = np.where(ember, emb, np.where(tide, td, np.where(storm, stm, glm)))
    h = meadow + (outer - meadow) * w
    h = 2.4 + (h - 2.4) * smooth(26, 60, R)                 # Lanternrest stays level
    return h, dict(qx=qx, qz=qz, wx=wx, wz=wz, crest=crest)   # the mountains come next, from uplift


# ---------------------------------------------------------------- mountains: uplift and rivers
def mountains(H, f, steps=260, height=1.0):
    """The ranges are pushed up by tectonic uplift while rivers cut them down (the stream power law,
    solved in uplift.mjs). Uplift is strongest along each range's spine and fades to nothing at its
    foot, where the rivers leave the mountains; the rivers branch back up into the range, leaving
    ridges, spurs, saddles and valleys between them. Returns the land with its mountains, and how much
    ground drains through each spot (where the rivers are)."""
    r = RANGES; rng = np.random.default_rng(5)
    U = (r ** 0.9 * (0.55 + 0.45 * f['crest'])).astype(np.float32) * 0.6
    K = (1.0 + 0.45 * fbm(f['qx'] * 3.3, f['qz'] * 3.3, 3, 55)).astype(np.float32) * 0.06   # harder and softer rock
    H0 = (r * 3 + rng.random(X.shape) * 0.6 * r).astype(np.float32)                         # a rough dome to start from
    fixed = (r < 0.03).astype(np.uint8)
    with tempfile.TemporaryDirectory() as d:
        json.dump({'NV': NV, 'cell': CELL, 'steps': steps, 'dt': 1.0, 'm': 0.5, 'diffusion': 0.02, 'talus': 1.25}, open(os.path.join(d, 'params.json'), 'w'))
        for name, a in (('U', U), ('K', K), ('H0', H0)): a.astype('<f4').tofile(os.path.join(d, name + '.bin'))
        fixed.tofile(os.path.join(d, 'fixed.bin'))
        subprocess.check_call(['node', os.path.join(HERE, 'uplift.mjs'), d])
        M = np.fromfile(os.path.join(d, 'H.bin'), '<f4').reshape(NV, NV); A = np.fromfile(os.path.join(d, 'A.bin'), '<f4').reshape(NV, NV)
    print('  mountains: highest %.0f above the land' % M.max())
    return H + M * height, A


# ---------------------------------------------------------------- erosion
def erode(H, drops=60000, seed=7):
    rng = np.random.default_rng(seed); H = H.copy(); n = H.shape[0]
    inertia, cap_k, min_cap, dep, ero, evap, grav, life = 0.05, 2.5, 0.01, 0.3, 0.2, 0.02, 4.0, 40
    def hg(x, y):
        ix, iy = int(x), int(y); fx, fy = x - ix, y - iy
        a, b, c, d = H[iy, ix], H[iy, ix + 1], H[iy + 1, ix], H[iy + 1, ix + 1]
        return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy, (b - a) * (1 - fy) + (d - c) * fy, (c - a) * (1 - fx) + (d - b) * fx
    # half the rain falls on the mountains, where it carves the gullies and spurs
    mj, mi = np.nonzero(RANGES > 0.15); pick = rng.integers(0, len(mj), drops)
    for k in range(drops):
        if k % 2: x, y = mi[pick[k]] + rng.uniform(0, 1), mj[pick[k]] + rng.uniform(0, 1); x, y = min(max(x, 1), n - 2.01), min(max(y, 1), n - 2.01)
        else: x, y = rng.uniform(1, n - 2, 2)
        dx = dy = 0.0; sp, wa, sed = 1.0, 1.0, 0.0
        for _ in range(life):
            ix, iy = int(x), int(y); fx, fy = x - ix, y - iy
            h0, gx, gy = hg(x, y)
            dx = dx * inertia - gx * (1 - inertia); dy = dy * inertia - gy * (1 - inertia)
            l = math.hypot(dx, dy)
            if l < 1e-9: break
            dx /= l; dy /= l; nx, ny = x + dx, y + dy
            if nx < 1 or ny < 1 or nx >= n - 2 or ny >= n - 2: break
            dh = hg(nx, ny)[0] - h0
            cap = max(-dh * sp * wa * cap_k, min_cap)
            if sed > cap or dh > 0:
                amt = min(dh, sed) if dh > 0 else (sed - cap) * dep; sed -= amt
                H[iy, ix] += amt * (1 - fx) * (1 - fy); H[iy, ix + 1] += amt * fx * (1 - fy); H[iy + 1, ix] += amt * (1 - fx) * fy; H[iy + 1, ix + 1] += amt * fx * fy
            else:
                amt = min((cap - sed) * ero, -dh, 0.6)
                H[iy, ix] -= amt * (1 - fx) * (1 - fy); H[iy, ix + 1] -= amt * fx * (1 - fy); H[iy + 1, ix] -= amt * (1 - fx) * fy; H[iy + 1, ix + 1] -= amt * fx * fy
                sed += amt
            sp = math.sqrt(max(0.0, sp * sp + dh * grav)); wa *= 1 - evap; x, y = nx, ny
    return H


def thermal(H, talus=1.6, iters=12, rate=0.4):
    """Thermal erosion: wherever rock stands steeper than its angle of repose it slides down to its
    neighbours. The angle varies from place to place (harder and softer rock), and only a few rounds
    run, so it knocks down spikes and sheer walls without planing every slope to the same angle."""
    H = H.copy(); lim = (talus + 0.6 * fbm(X / 37, Z / 37, 3, 91)) * CELL
    for _ in range(iters):
        for dj, di in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            nb = np.roll(H, (dj, di), axis=(0, 1)); mv = np.clip(H - nb - lim, 0, None) * rate * 0.25
            mv[0, :] = mv[-1, :] = mv[:, 0] = mv[:, -1] = 0
            H = H - mv + np.roll(mv, (-dj, -di), axis=(0, 1))
    return H


# ---------------------------------------------------------------- after erosion: ledges, crater
def shape(H, P, f):
    ember, gloam, tide, storm = regions(); w = smooth(112, 138, R)
    # (the ranges are no longer walls: the game keeps each region's edge at the crest itself)
    # meadow knolls: ledges a jump high (2 units), stepping up to small hilltops
    knoll = np.clip(ridged(f['qx'] * 2.4, f['qz'] * 2.4, 4, 9) - 0.52, 0, 1) * 13 * smooth(40, 60, R) * (1 - smooth(100, 112, R))
    H = H + terrace(knoll, 2.0, 0.1)
    # Stormreach: the land itself is cut into a giant stair of 4-unit steps (only roads ramp up them)
    H = np.where(storm & (R > 128), H + (terrace(H, 4.0, 0.09) - H) * w, H)
    # the volcano: benches 7 units apart up the cone, a crater with a lava lake and an island
    V = P['volcano']; rv = np.hypot(X - V['x'], Z - V['z'])
    onc = ember & (rv < V['base'] - 6) & (rv > V['rim'] + 2)
    H = np.where(onc, terrace(H, 7.0, 0.09), H)
    crater = V['floor'] + (V['top'] - V['floor']) * smooth(V['rim'] - 7, V['rim'] + 1, rv)
    H = np.where(ember & (rv < V['rim'] + 1), np.minimum(H, crater), H)
    H = np.where(rv < V['island'], np.maximum(H, V['islandH']), H)
    return H


def flats(H, P):
    """Level ground for each place, blended out to twice its size (as the game used to do)."""
    spots = [(w['x'], w['z'], 7) for w in P['waystones'] if w['id'] != 'village']
    spots += [(s['x'], s['z'], 11) for s in P['shrines']] + [(c['x'], c['z'], 13) for c in P['camps']] + [(k['x'], k['z'], 12) for k in P['kzones']]
    spots += [(r['x'], r['z'], 9) for r in P['rifts']] + [(e['x'], e['z'], 6) for e in P['extra'] if abs(e['x']) > 40 or abs(e['z']) > 40]
    spots += [(P['springs']['x'], P['springs']['z'], 10)] + [(r['x'], r['z'], 12) for r in P['rival']]
    for (x, z, r) in spots:
        i, j = int(round((x + HALF) / CELL)), int(round((z + HALF) / CELL)); h0 = H[j, i]
        if (abs(x) <= abs(z)) and z > 0 and math.hypot(x, z) > 124: h0 = max(h0, 0.9)   # Mirrormere: above the water
        d = np.hypot(X - x, Z - z); m = d < r * 2.2
        H[m] = h0 + (H[m] - h0) * smooth(r, r * 2.2, d[m])
    return H


# ---------------------------------------------------------------- roads
def region_of(x, z):
    return NAMES[LB[int(round((z + HALF) / CELL)), int(round((x + HALF) / CELL))]]

def astar(H, a, b, ok):
    """Cheapest path on the grid between cells a and b (j, i), avoiding steep climbs and water, and
    staying on cells where ok is true (its own region, so a road never cuts through a wall)."""
    (j0, i0), (j1, i1) = a, b
    INF = 1e18; best = {a: 0.0}; came = {}; pq = [(0.0, a)]
    nb = [(-1, 0, 1), (1, 0, 1), (0, -1, 1), (0, 1, 1), (-1, -1, 1.414), (-1, 1, 1.414), (1, -1, 1.414), (1, 1, 1.414)]
    while pq:
        f, c = heapq.heappop(pq)
        if c == b: break
        j, i = c; g = best[c]
        for dj, di, dd in nb:
            nj, ni = j + dj, i + di
            if nj < 0 or nj > N or ni < 0 or ni > N or not ok[nj, ni]: continue
            dist = dd * CELL; s = abs(H[nj, ni] - H[j, i]) / dist
            cost = dist * (1 + 40 * max(0.0, s - 0.15) ** 2) * (3 if H[nj, ni] < 0.3 else 1)
            ng = g + cost
            if ng < best.get((nj, ni), INF):
                best[(nj, ni)] = ng; came[(nj, ni)] = c
                heapq.heappush(pq, (ng + math.hypot(nj - j1, ni - i1) * CELL, (nj, ni)))
    path = [b]
    while path[-1] != a and path[-1] in came: path.append(came[path[-1]])
    return path[::-1]

def roads(H, P):
    """Join every place in each region (and each region to the meadow through its pass) with roads,
    then carve them in: a smoothed height profile no steeper than 1 in 2.5, levelled across."""
    cellof = lambda x, z: (int(round((z + HALF) / CELL)), int(round((x + HALF) / CELL)))
    nodes = {k: [] for k in ('meadow', 'ember', 'tide', 'storm', 'gloam')}
    add = lambda x, z: nodes[region_of(x, z)].append((x, z))
    add(0, 0)
    for w in P['waystones']: add(w['x'], w['z'])
    for s in P['shrines']: add(s['x'], s['z'])
    for c in P['camps'] + P['kzones'] + P['rifts']: add(c['x'], c['z'])
    for e in P['extra']: add(e['x'], e['z'])
    for r in P['rival']: add(r['x'], r['z'])
    add(P['springs']['x'], P['springs']['z'])
    # each pass: a road from inside the meadow, through the gap, to the region beyond
    passes = [((98, 0), (158, 0), 1), ((-98, 0), (-158, 0), 2), ((0, 98), (0, 158), 3), ((0, -98), (0, -158), 4)]
    inner = np.maximum(AX, AZ) < 280
    edges = []
    for a, b, k in passes: add(*a); add(*b); edges.append((a, b, ((LB == 0) | (LB == k)) & (np.minimum(AX, AZ) < 30)))
    BOX = {reg: (LB == k) & inner for k, reg in enumerate(NAMES)}
    for reg, pts in nodes.items():
        pts = list(dict.fromkeys(pts)); inside = [pts[0]]; rest = pts[1:]
        while rest:   # Prim: always join the closest place not yet on the network
            best = min(((math.hypot(a[0] - b[0], a[1] - b[1]), a, b) for a in inside for b in rest))
            edges.append((best[1], best[2], BOX[reg])); inside.append(best[2]); rest.remove(best[2])
    mask = np.zeros_like(H); prof = np.full_like(H, np.nan)
    for a, b, ok in edges:
        path = astar(H, cellof(*a), cellof(*b), ok)
        hs = np.array([H[j, i] for j, i in path], float)
        k = int(round(10 / CELL)); pad = np.pad(hs, k, mode='edge'); hs = np.convolve(pad, np.ones(2 * k + 1) / (2 * k + 1), mode='valid')
        for _ in range(4):   # limit the grade both ways
            for t in range(1, len(hs)): hs[t] = np.clip(hs[t], hs[t - 1] - 0.42 * CELL, hs[t - 1] + 0.42 * CELL)
            for t in range(len(hs) - 2, -1, -1): hs[t] = np.clip(hs[t], hs[t + 1] - 0.42 * CELL, hs[t + 1] + 0.42 * CELL)
        hs = np.maximum(hs, 0.5)
        for (j, i), h in zip(path, hs):
            j0, j1, i0, i1 = max(0, j - 4), min(N, j + 4), max(0, i - 4), min(N, i + 4)
            d = np.hypot(X[j0:j1 + 1, i0:i1 + 1] - xs[i], Z[j0:j1 + 1, i0:i1 + 1] - xs[j])
            wgt = 1 - smooth(2.6, 6.5, d); cur = mask[j0:j1 + 1, i0:i1 + 1]
            upd = wgt > cur; cur[upd] = wgt[upd]; p = prof[j0:j1 + 1, i0:i1 + 1]; p[upd] = h
    m = mask > 0
    H[m] = H[m] + (prof[m] - H[m]) * mask[m]
    return H, mask, nodes


# ---------------------------------------------------------------- reach
def flood(H, start, limit, seen=None):
    from collections import deque
    seen = np.zeros(H.shape, np.uint8) if seen is None else seen; q = deque([start]); seen[start] = 1
    while q:
        j, i = q.popleft()
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = j + dj, i + di
            if 0 <= a <= N and 0 <= b <= N and not seen[a, b] and H[a, b] - H[j, i] <= limit:
                seen[a, b] = 1; q.append((a, b))
    return seen

def reach(H, nodes):
    cellof = lambda x, z: (int(round((z + HALF) / CELL)), int(round((x + HALF) / CELL)))
    walk = flood(H, cellof(0, 0), WALK); jump = flood(H, cellof(0, 0), JUMP); dbl = flood(H, cellof(0, 0), DOUBLE)
    out = np.where(walk > 0, 1, np.where(jump > 0, 2, np.where(dbl > 0, 3, 0))).astype(np.uint8)
    bad = [(reg, p) for reg, pts in nodes.items() for p in pts if walk[cellof(*p)] == 0]
    return out, bad


def preview(H, mask, path):
    gy, gx = np.gradient(H, CELL); l = np.sqrt(gx * gx + gy * gy + 1)
    shade = np.clip((gx * 0.55 + 0.65 + gy * 0.55) / l, 0, 1)
    stops = np.array([(96, 160, 78), (150, 176, 92), (182, 160, 104), (150, 112, 86), (128, 122, 118), (205, 202, 198), (250, 250, 252)], float)
    t = np.clip(H / 70, 0, 1) * 6; i = np.clip(t.astype(int), 0, 5); fr = (t - i)[..., None]; col = stops[i] * (1 - fr) + stops[i + 1] * fr
    col = np.where((H < 0)[..., None], [60, 140, 210], col)
    img = col * (0.45 + 0.75 * shade[..., None])
    img = img * (1 - 0.55 * mask[..., None]) + np.array([214, 190, 140]) * 0.55 * mask[..., None]
    steep = np.hypot(gx, gy) > 0.85; img[steep] = img[steep] * 0.75 + np.array([110, 40, 40]) * 0.25
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((960, 960), Image.LANCZOS).save(path)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--preview'); ap.add_argument('--drops', type=int, default=int(60000 * (N / 320) ** 2)); a = ap.parse_args()
    P = json.loads(subprocess.check_output(['node', os.path.join(HERE, 'points.mjs')], cwd=ROOT))
    t0 = time.time()
    H, f = base(P); print('land %.1fs' % (time.time() - t0))
    H, DRAIN = mountains(H, f); print('mountains %.1fs' % (time.time() - t0))
    H = thermal(erode(H, a.drops), 1.5, 8); print('erosion %.1fs' % (time.time() - t0))
    H = shape(H, P, f); H = flats(H, P); print('cliffs, ledges, crater, flats %.1fs' % (time.time() - t0))
    H, mask, nodes = roads(H, P); print('roads %.1fs' % (time.time() - t0))
    # your own sculpting from Blender (tools/world/blender.py), laid over the generated land last
    sp = os.path.join(OUT, 'sculpt.bin')
    if os.path.exists(sp):
        d = np.fromfile(sp, '<f4')
        if d.size == NV * NV: H = H + d.reshape(NV, NV); print('  sculpt layer added (biggest change %.1f)' % np.abs(d).max())
        else: print('  sculpt.bin is for a different grid size, so it was left out')
    rch, bad = reach(H, nodes); print('reach %.1fs' % (time.time() - t0))
    for reg, p in bad: print('  UNREACHABLE on foot:', reg, p)
    # leak test: with the four pass corridors blocked, no region may be walked into from another
    RG = LB; names = NAMES
    blocked = H.copy(); blocked[(np.minimum(AX, AZ) < 28) & (R > 100) & (R < 162)] = 999
    leaks = 0   # (informative only: in the game a region's edge is enforced at the crest)
    for k, (sx, sz) in enumerate([(0, 0), (200, -60), (-200, 60), (-60, 200), (60, -200)]):
        seen = flood(blocked, (int(round((sz + HALF) / CELL)), int(round((sx + HALF) / CELL))), WALK) > 0
        lk = seen & (RG != k) & ~((np.minimum(AX, AZ) < 30) & (R > 96) & (R < 166))
        if lk.any(): leaks += 1
    print('  the ranges alone seal the regions apart' if not leaks else '  %d regions can be climbed out of over a range (the game stops you at the crest)' % leaks)
    geo = lambda x, z: 'meadow' if math.hypot(x, z) < 124 else (('ember' if x > 0 else 'gloam') if abs(x) > abs(z) else ('tide' if z > 0 else 'storm'))
    for reg, pts in nodes.items():
        for (x, z) in pts:
            if region_of(x, z) != geo(x, z) and not (min(abs(x), abs(z)) < 30 and 96 < math.hypot(x, z) < 166): print('  MOVED: place at (%d, %d) is now in %s, not %s' % (x, z, region_of(x, z), geo(x, z)))
    LB.tofile(os.path.join(OUT, 'regions.bin'))
    os.makedirs(OUT, exist_ok=True)
    H.astype('<f4').tofile(os.path.join(OUT, 'height.bin'))
    json.dump({'N': N, 'SIZE': SIZE}, open(os.path.join(OUT, 'meta.json'), 'w'))
    (np.clip(mask, 0, 1) * 255).astype(np.uint8).tofile(os.path.join(OUT, 'roads.bin'))
    rch.tofile(os.path.join(OUT, 'reach.bin'))
    print('wrote assets/world (%d x %d), %d places unreachable' % (NV, NV, len(bad)))
    if a.preview: os.makedirs(a.preview, exist_ok=True); preview(H, mask, os.path.join(a.preview, 'world.png')); np.save(os.path.join(a.preview, 'world.npy'), H)
