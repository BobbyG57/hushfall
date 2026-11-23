"""Hushfall's world, to Blender and back, one file per zone.

Run by Blender (the two .command files in blender/ do this for you):

  Blender --background --factory-startup --python-exit-code 1 --python tools/world/blender.py -- send
  Blender --background --factory-startup --python-exit-code 1 --python tools/world/blender.py -- bring

send   Makes (or refreshes) the Blender files:
         blender/Kit.blend          the building pieces, on a shelf. Made once, then yours: change
                                    pieces or make new ones here.
         blender/zones/<Zone>.blend one per zone (Lanternrest Meadow, Emberridge, Gloamwood,
                                    Mirrormere, Stormreach), holding
           Terrain      the zone's ground to sculpt. 1 Blender unit = 1 game unit, coloured by
                        region (roads tan, rock grey, snow white). Blender X = game x, Blender Y =
                        north (game -z), Blender Z = height.
           Around       a darker ring of the neighbouring land, for reference (not selectable).
           Places       an arrow for every waystone, shrine, camp, grove and rift in the zone (for
                        reference: moving them does not move them in the game).
           Kit shelf    copies of the Kit.blend pieces, to place from.
           Placed       the pieces set out in this zone.
       A zone file that already exists gets fresh terrain, places and shelf copies (keeping what
       you placed), unless it has sculpting that still needs bringing into the game.
bring  Reads them all back: what you changed in the zones becomes assets/world/sculpt.bin (the
       difference from the generated land), every piece in Kit.blend is saved as
       assets/models/kit/<name>.glb, and everything placed is listed in assets/world/placed.json.
       Then run tools/world/make_world.py, which lays the sculpting over the land and checks every
       place can still be reached.
"""
import bpy, bmesh, json, math, os, re, sys
import numpy as np
from mathutils import Matrix, Quaternion

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORLD = os.path.join(ROOT, 'assets', 'world')
KITDIR = os.path.join(ROOT, 'assets', 'models', 'kit')
KIT_BLEND = os.path.join(ROOT, 'blender', 'Kit.blend')
ZDIR = os.path.join(ROOT, 'blender', 'zones')
BROUGHT = os.path.join(ZDIR, '.brought')     # fingerprints of the zones last brought into the game
HALF = 320.0
AROUND = 40.0                               # how much of the neighbouring land each zone file shows
# the five zones: (index in regions.bin, short name, file name, Blender colour tag)
ZONES = [(0, 'meadow', 'Lanternrest Meadow', 'COLOR_04'), (1, 'ember', 'Emberridge', 'COLOR_01'), (2, 'gloam', 'Gloamwood', 'COLOR_06'),
         (3, 'tide', 'Mirrormere', 'COLOR_05'), (4, 'storm', 'Stormreach', 'COLOR_03')]
zone_path = lambda name: os.path.join(ZDIR, name + '.blend')


def grid():
    N = json.load(open(os.path.join(WORLD, 'meta.json')))['N']; NV = N + 1
    rd = lambda f, t: np.fromfile(os.path.join(WORLD, f), t).reshape(NV, NV)
    sp = os.path.join(WORLD, 'sculpt.bin')
    sc = np.fromfile(sp, '<f4').reshape(NV, NV) if os.path.exists(sp) and os.path.getsize(sp) == NV * NV * 4 else np.zeros((NV, NV), np.float32)
    return N, NV, 2 * HALF / N, rd('height.bin', '<f4'), rd('roads.bin', np.uint8), rd('regions.bin', np.uint8), sc


def fingerprint(obj):
    """Identifies the shape of a terrain mesh, to tell whether it has been sculpted since."""
    import hashlib
    co = np.zeros(len(obj.data.vertices) * 3, np.float32); obj.data.vertices.foreach_get('co', co)
    return hashlib.sha1(np.round(co, 2).astype('<f4').tobytes()).hexdigest()


def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if not c: c = bpy.data.collections.new(name); (parent or bpy.context.scene.collection).children.link(c)
    return c


def nodes_on(m):
    if bpy.app.version < (5, 0, 0): m.use_nodes = True     # always on from Blender 5


def srgb(hexv):
    c = [((hexv >> s) & 255) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def base_name(n):
    return n.rsplit('.', 1)[0] if '.' in n and n.rsplit('.', 1)[1].isdigit() else n


def clean(n):
    return re.sub(r'[^A-Za-z0-9_-]+', '_', base_name(n))


def save(path, compress=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=compress, relative_remap=True)


def view(cx, cy, dist):
    for scr in bpy.data.screens:
        for a in scr.areas:
            if a.type != 'VIEW_3D': continue
            for s in a.spaces:
                if s.type != 'VIEW_3D': continue
                s.shading.type = 'MATERIAL'; s.clip_end = 4000; s.clip_start = 0.1
                r = s.region_3d; r.view_distance = dist; r.view_location = (cx, cy, 0)


# ---------------------------------------------------------------- the terrain
def terrain_colours(H, roads, regions, CELL):
    base = np.array([[96, 160, 78], [122, 84, 70], [100, 84, 146], [104, 172, 146], [122, 134, 150]], float) / 255
    c = base[regions]
    gy, gx = np.gradient(H, CELL); s = np.hypot(gx, gy)
    k = np.clip((s - 0.7) / 0.5, 0, 1)[..., None]; c = c * (1 - k) + np.array([0.46, 0.44, 0.42]) * k
    k = np.clip((H - 46) / 16, 0, 1)[..., None]; c = c * (1 - k) + 0.95 * k
    k = (roads / 255.0)[..., None] * 0.8; c = c * (1 - k) + np.array([0.82, 0.70, 0.48]) * k
    c = np.where((H < 0)[..., None], [0.25, 0.52, 0.82], c)
    return c


def vc_material(name, tint):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name); nodes_on(mat)
    nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = next((n for n in nt.nodes if n.type == 'VERTEX_COLOR'), None) or nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Region'; nt.links.new(attr.outputs[0], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 1.0
    mat.diffuse_color = tint
    return mat


def grow(mask, m):
    """The mask, grown by m cells in every direction (a square)."""
    def run(a, axis):
        a = np.moveaxis(a, axis, 0).astype(np.int32); n = a.shape[0]
        cs = np.concatenate([np.zeros((1,) + a.shape[1:], np.int32), np.cumsum(a, 0)]); i = np.arange(n)
        return np.moveaxis((cs[np.minimum(i + m + 1, n)] - cs[np.maximum(i - m, 0)]) > 0, 0, axis)
    return run(run(mask, 0), 1)


def build_mesh(name, q, CO, RGB, ids):
    used = np.unique(q); loc = np.searchsorted(used, q).ravel().astype(np.int32)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(used)); me.vertices.foreach_set('co', CO[used].ravel())
    me.loops.add(len(loc)); me.loops.foreach_set('vertex_index', loc)
    me.polygons.add(len(q)); me.polygons.foreach_set('loop_start', np.arange(0, len(loc), 4, dtype=np.int32))
    me.update(calc_edges=True); me.validate()
    rgba = np.concatenate([RGB[used] ** 2.2, np.ones((len(used), 1))], -1).astype(np.float32)   # to linear
    me.color_attributes.new('Region', 'BYTE_COLOR', 'POINT').data.foreach_set('color', rgba.ravel())
    if ids:
        me.attributes.new('gid', 'INT', 'POINT').data.foreach_set('value', used.astype(np.int32))
        me.attributes.new('sent', 'FLOAT', 'POINT').data.foreach_set('value', CO[used, 2])
    return me


def make_zone(k, name, tag, N, NV, CELL, H, roads, regions):
    """The zone's own ground, to sculpt (every point remembers where it is on the game's grid, gid, and
    the height it was sent with, sent, so only what you change comes back), and a darker ring of the
    land around it, for reference only."""
    xs = -HALF + np.arange(NV) * CELL; X, Z = np.meshgrid(xs, xs)
    CO = np.stack([X, -Z, H], -1).reshape(-1, 3).astype(np.float32)
    RGB = terrain_colours(H, roads, regions, CELL).reshape(-1, 3)
    jj, ii = np.meshgrid(np.arange(N), np.arange(N), indexing='ij'); a = (jj * NV + ii).ravel()
    quads = np.stack([a, a + NV, a + NV + 1, a + 1], -1); mine = regions[:N, :N] == k
    around = grow(mine, int(round(AROUND / CELL))) & ~mine
    me = build_mesh(name, quads[mine.ravel()], CO, RGB, True); me.materials.append(vc_material('Terrain', (0.35, 0.55, 0.3, 1)))
    c = coll('Terrain'); c.color_tag = tag
    o = bpy.data.objects.new(name, me); c.objects.link(o); o['sent'] = fingerprint(o)
    grey = RGB * 0.45 + 0.16
    am = build_mesh('Around ' + name, quads[around.ravel()], CO, grey, False); am.materials.append(vc_material('Around', (0.3, 0.3, 0.3, 1)))
    ao = bpy.data.objects.new('Neighbouring land', am); ao.hide_select = True; coll('Around (for reference)').objects.link(ao)
    v = CO[np.unique(quads[mine.ravel()])]
    return o, (v[:, 0].min() + v[:, 0].max()) / 2, (v[:, 1].min() + v[:, 1].max()) / 2, max(np.ptp(v[:, 0]), np.ptp(v[:, 1]))


def make_water():
    wc = coll('Water'); wp = bpy.data.meshes.new('Water'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=HALF); bm.to_mesh(wp); bm.free()
    wm = bpy.data.materials.new('Water'); nodes_on(wm); b = next(n for n in wm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (0.1, 0.4, 0.75, 1); b.inputs['Alpha'].default_value = 0.55; wm.diffuse_color = (0.1, 0.4, 0.75, 0.5)
    try: wm.surface_render_method = 'BLENDED'
    except Exception: pass
    wp.materials.append(wm); w = bpy.data.objects.new('Water', wp); w.hide_select = True; wc.objects.link(w)


def read_terrain(o, flat, acc, cnt, NV, CELL):
    """Adds what was changed in this zone to acc and cnt (where two zones share a border point and both
    changed it, the game takes their average). Returns a note if the zone had to be read another way."""
    me = o.data; n = len(me.vertices); co = np.zeros(n * 3, np.float32); me.vertices.foreach_get('co', co)
    M = np.array(o.matrix_world); co = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    gid = me.attributes.get('gid'); sent = me.attributes.get('sent')
    if gid is not None and len(gid.data) == n:
        g = np.zeros(n, np.int32); gid.data.foreach_get('value', g)
        base = flat[g]
        if sent is not None: base = np.zeros(n, np.float32); sent.data.foreach_get('value', base)
        ch = np.abs(co[:, 2] - base) > 0.02
        np.add.at(acc, g[ch], co[ch, 2]); np.add.at(cnt, g[ch], 1)
        return None
    # remeshed: look straight down onto it at every grid point it covers
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    bvh = BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get()); Mi = o.matrix_world.inverted()
    dv = (Mi.to_3x3() @ Vector((0, 0, -1.0))).normalized(); xs = -HALF + np.arange(NV) * CELL
    x0, y0 = co[:, 0].min(), co[:, 1].min(); x1, y1 = co[:, 0].max(), co[:, 1].max()
    for j in range(NV):
        if not (y0 - 1 <= -xs[j] <= y1 + 1): continue
        for i in range(NV):
            if not (x0 - 1 <= xs[i] <= x1 + 1): continue
            hit = bvh.ray_cast(Mi @ Vector((xs[i], -xs[j], 900.0)), dv)
            if hit[0] is not None:
                z = (o.matrix_world @ hit[0]).z; c = j * NV + i
                if abs(z - flat[c]) > 0.02: acc[c] += z; cnt[c] += 1
    return o.name + ' was remeshed, so it was read by looking down onto it'


# ---------------------------------------------------------------- places from data.js
def places():
    import subprocess
    node = next((p for p in ('/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node') if os.path.exists(p)), 'node')
    try: return json.loads(subprocess.check_output([node, os.path.join(ROOT, 'tools', 'world', 'points.mjs')], cwd=ROOT))
    except Exception as e: print('  (could not read the places from src/data.js: %s)' % e); return None


def make_places(P, H, regions, CELL, col, zone):
    """An arrow for every place from data.js in this zone, with its name."""
    if not P: return
    def h(x, z):
        i = int(round((x + HALF) / CELL)); j = int(round((z + HALF) / CELL)); n = H.shape[0] - 1
        return float(H[min(max(j, 0), n), min(max(i, 0), n)])
    pts = [('Waystone: ' + w.get('name', w.get('id', '')), w) for w in P['waystones']]
    pts += [('Shrine: ' + s.get('name', s['id']), s) for s in P['shrines']]
    pts += [('Camp %d' % (k + 1), c) for k, c in enumerate(P['camps'])]
    pts += [('Kith grove %d' % (k + 1), g) for k, g in enumerate(P['kzones'])]
    pts += [('Hush Rift %s' % r['id'], r) for r in P['rifts']]
    pts += [('Spot: ' + e.get('kind', 'extra'), e) for e in P['extra']]
    if P.get('springs'): pts.append(('Hot springs', P['springs']))
    for name, p in pts:
        i = min(max(int(round((p['x'] + HALF) / CELL)), 0), H.shape[0] - 1); j = min(max(int(round((p['z'] + HALF) / CELL)), 0), H.shape[0] - 1)
        if int(regions[j, i]) != zone: continue
        o = bpy.data.objects.new(name, None); o.empty_display_type = 'SINGLE_ARROW'; o.empty_display_size = 6
        o.location = (p['x'], -p['z'], h(p['x'], p['z'])); o.show_name = True; o.show_in_front = True; col.objects.link(o)


# ---------------------------------------------------------------- the kit of building pieces
MATS = {}
def kmat(hexv, glow=False):
    key = (hexv, glow)
    if key in MATS: return MATS[key]
    name = 'kit %06x%s' % (hexv, ' glow' if glow else '')
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); nodes_on(m)
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); c = srgb(hexv)
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = 1.0
    if glow: b.inputs['Emission Color'].default_value = (*c, 1); b.inputs['Emission Strength'].default_value = 1.0
    m.diffuse_color = (*c, 1); MATS[key] = m; return m


class Piece:
    """Builds one kit piece from simple solids, as a single object with one material per colour."""
    def __init__(self, name): self.name, self.bm, self.mats = name, bmesh.new(), []

    def _mi(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)

    def _put(self, geom, sx, sy, sz, x, y, z, rot, mat, tilt=0.0):
        vs = [g for g in geom if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.scale(self.bm, vec=(sx, sy, sz), verts=vs)
        if tilt: bmesh.ops.rotate(self.bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(tilt, 3, 'X'))
        if rot: bmesh.ops.rotate(self.bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, 'Z'))
        bmesh.ops.translate(self.bm, vec=(x, y, z), verts=vs)
        mi = self._mi(mat)
        for f in {f for v in vs for f in v.link_faces}: f.material_index = mi
        return self

    # every solid sits on its base: (x, y) is its centre, z its bottom
    def box(self, sx, sy, sz, x=0, y=0, z=0, mat=None, rot=0.0, tilt=0.0):
        g = bmesh.ops.create_cube(self.bm, size=1.0)['verts']; bmesh.ops.translate(self.bm, vec=(0, 0, 0.5), verts=g)
        return self._put(g, sx, sy, sz, x, y, z, rot, mat, tilt)

    def cyl(self, r, h, x=0, y=0, z=0, mat=None, segs=8, r2=None, rot=0.0, tilt=0.0):
        g = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=1.0, radius2=(r2 / r if r2 is not None else 1.0), depth=1.0)['verts']
        bmesh.ops.translate(self.bm, vec=(0, 0, 0.5), verts=g)
        return self._put(g, r, r, h, x, y, z, rot, mat, tilt)

    def roof(self, sx, sy, sz, x=0, y=0, z=0, mat=None, rot=0.0):
        """A gable roof: a triangular prism with its ridge along Y."""
        bm = self.bm; v = [bm.verts.new(p) for p in ((-0.5, -0.5, 0), (0.5, -0.5, 0), (0, -0.5, 1), (-0.5, 0.5, 0), (0.5, 0.5, 0), (0, 0.5, 1))]
        for f in ((0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (3, 0, 2, 5)): bm.faces.new([v[i] for i in f])
        return self._put(v, sx, sy, sz, x, y, z, rot, mat)

    def rock(self, s, x=0, y=0, z=0, mat=None, seed=1, sz=1.0):
        rnd = np.random.default_rng(seed); g = bmesh.ops.create_icosphere(self.bm, subdivisions=1, radius=0.5)['verts']
        for v in g: k = 0.75 + rnd.random() * 0.5; v.co.x *= k; v.co.y *= k; v.co.z = v.co.z * (0.8 + rnd.random() * 0.5) + 0.3
        return self._put(g, s, s, s * sz, x, y, z, 0.0, mat)

    def ico(self, sx, sy, sz, x=0, y=0, z=0, mat=None, seed=0, jitter=0.18, sub=1):
        """A lumpy ball (canopies, bushes, mushroom caps). Unlike the solids above, z is its centre."""
        rnd = np.random.default_rng(seed); g = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=0.5)['verts']
        for v in g: v.co *= 1 + (rnd.random() - 0.5) * 2 * jitter
        return self._put(g, sx, sy, sz, x, y, z, 0.0, mat)

    def limb(self, r, length, start, tilt, rot, mat, r2=None, segs=6):
        """A cylinder from start, leaning tilt radians from upright toward heading rot. Returns its far end,
        so trunks and branches can be built a segment at a time."""
        x, y, z = start; self.cyl(r, length, x=x, y=y, z=z, mat=mat, segs=segs, r2=r2, rot=rot, tilt=tilt)
        st = math.sin(tilt); return (x + st * math.sin(rot) * length, y - st * math.cos(rot) * length, z + math.cos(tilt) * length)

    def frond(self, base, heading, length, width, rise, droop, mat, thick=0.06, n=5):
        """A leaf blade: widest in the middle, rising then drooping toward its tip (palm fronds)."""
        bm = self.bm; x0, y0, z0 = base; dx, dy = math.cos(heading), math.sin(heading); px, py = -dy, dx; T, B = [], []
        for i in range(n + 1):
            t = i / n; w = max(0.03, width * math.sin(math.pi * (0.12 + 0.88 * t)) ** 0.7) if i < n else 0.03
            cx, cy, cz = x0 + dx * length * t, y0 + dy * length * t, z0 + rise * length * t - droop * t * t
            T.append((bm.verts.new((cx - px * w, cy - py * w, cz)), bm.verts.new((cx + px * w, cy + py * w, cz))))
            B.append((bm.verts.new((cx - px * w, cy - py * w, cz - thick)), bm.verts.new((cx + px * w, cy + py * w, cz - thick))))
        fs = []
        for i in range(n):
            (a, b), (c, d) = T[i], T[i + 1]; (e, f), (g, h) = B[i], B[i + 1]
            fs += [bm.faces.new((a, b, d, c)), bm.faces.new((e, g, h, f)), bm.faces.new((a, c, g, e)), bm.faces.new((b, f, h, d))]
        fs += [bm.faces.new((T[0][0], B[0][0], B[0][1], T[0][1])), bm.faces.new((T[n][0], T[n][1], B[n][1], B[n][0]))]
        mi = self._mi(mat)
        for f in fs: f.material_index = mi
        return self

    def done(self, col, at, solid=True, radius=None):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(self.name); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for m in self.mats: me.materials.append(m)
        o = bpy.data.objects.new(self.name, me); o.location = at; o.show_name = True; o['solid'] = 1 if solid else 0
        if radius: o['radius'] = radius        # block only a circle this wide round the origin (a trunk)
        col.objects.link(o); return o


# where each file's shelf of pieces stands, just outside what the file shows: the first piece, the
# step along a row of eight, and the step to the next row
SHELF = {'kit': ((-63, 352), (18, 0), (0, 20)), 'storm': ((-63, 352), (18, 0), (0, 20)), 'meadow': ((-63, 215), (18, 0), (0, 20)),
         'tide': ((-63, -352), (18, 0), (0, -20)), 'ember': ((352, 63), (0, -18), (20, 0)), 'gloam': ((-352, 63), (0, -18), (-20, 0))}


def shelf_pos(key, k):
    (ox, oy), (ax, ay), (bx, by) = SHELF[key]; r, c = divmod(k, 8)
    return (ox + ax * c + bx * r, oy + ay * c + by * r, 0)


def slab_rect(key, n):
    pts = np.array([shelf_pos(key, k)[:2] for k in range(max(n, 8))]); lo, hi = pts.min(0) - 11, pts.max(0) + 11
    return ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, -0.3), (hi[0] - lo[0], hi[1] - lo[1], 0.5)


def make_slab(key, n, col):
    """The dark slab the shelf pieces stand on. Anything standing on it counts as a shelf piece."""
    me = bpy.data.meshes.new('Shelf'); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    m = bpy.data.materials.get('Shelf') or bpy.data.materials.new('Shelf'); nodes_on(m); b = next(n_ for n_ in m.node_tree.nodes if n_.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (0.08, 0.08, 0.09, 1); m.diffuse_color = (0.08, 0.08, 0.09, 1); me.materials.append(m)
    o = bpy.data.objects.new('Shelf', me); o.location, o.scale = slab_rect(key, n); o.hide_select = True; col.objects.link(o); return o


def fit_slab(key, n):
    o = bpy.data.objects.get('Shelf')
    if o: o.location, o.scale = slab_rect(key, n)


def on_slab(o):
    sl = bpy.data.objects.get('Shelf')
    if not sl: return False
    p = o.matrix_world.translation; c = sl.location; s = sl.scale
    return abs(p.x - c.x) <= s.x / 2 and abs(p.y - c.y) <= s.y / 2


# ---------------------------------------------------------------- the starter pieces
# Each is (name, builder, solid, radius): solid 0 lets the hero walk through it; a radius blocks only
# a circle that wide round the piece's origin (a tree's trunk) instead of its whole footprint.
WALL, PLASTER, ROOF, WOOD, DARK, STONE, SLATE, GLOW = 0xe6dac0, 0xf1e9d6, 0xa5482e, 0x7a5434, 0x4e3624, 0xa8a296, 0x56606e, 0xffd98a
BARK, LEAF, LEAF2, LEAF3, MOSS, ROCK = 0x6b4a2b, 0x3f9a3c, 0x58b84a, 0x4aa641, 0x6b8a4a, 0x8b9088
FLOWERS = [0xffffff, 0xffd24a, 0xff8fb0, 0xb08cff, 0xff6a4a]
rng01 = lambda seed: np.random.default_rng(seed).random


def b_cottage(p):
    p.box(6, 5, 3.2, mat=kmat(PLASTER)).box(6.2, 5.2, 0.5, mat=kmat(STONE))
    p.roof(7, 5.8, 2.6, z=3.2, mat=kmat(ROOF), rot=math.pi / 2)
    p.box(1.2, 0.2, 2.1, y=-2.55, mat=kmat(DARK)).box(1.0, 0.15, 0.9, x=-1.9, y=-2.53, z=1.3, mat=kmat(GLOW, True)).box(1.0, 0.15, 0.9, x=1.9, y=-2.53, z=1.3, mat=kmat(GLOW, True))
    p.box(0.9, 0.9, 2.4, x=1.8, y=1.2, z=3.6, mat=kmat(STONE))

def b_chapel(p):
    p.box(5.5, 10, 4.6, y=1.5, mat=kmat(0xdcd5c6)).roof(6.4, 10.6, 3, y=1.5, z=4.6, mat=kmat(SLATE))
    p.box(3, 3, 8.5, y=-4.2, mat=kmat(0xd0c8b8)).cyl(2.2, 4.5, y=-4.2, z=8.5, mat=kmat(SLATE), segs=4, r2=0.0, rot=math.pi / 4)
    p.box(1.4, 0.3, 2.6, y=-5.75, mat=kmat(DARK)).box(1.2, 0.3, 1.2, y=-5.75, z=5.6, mat=kmat(GLOW, True))
    for k in range(3): p.box(0.25, 0.8, 1.6, x=2.8, y=-0.6 + k * 2.4, z=1.8, mat=kmat(0x8fb4e0, True)).box(0.25, 0.8, 1.6, x=-2.8, y=-0.6 + k * 2.4, z=1.8, mat=kmat(0x8fb4e0, True))
    p.box(0.25, 0.25, 1.6, y=-4.2, z=13, mat=kmat(0xd8b050)).box(1.0, 0.25, 0.25, y=-4.2, z=13.9, mat=kmat(0xd8b050))

def b_gravestone(p):   # a slab with a rounded top (a short cylinder turned on its side)
    p.box(0.8, 0.22, 0.9, mat=kmat(0x9c9c98)).cyl(0.4, 0.22, y=0.11, z=0.9, mat=kmat(0x9c9c98), segs=12, tilt=math.pi / 2).box(1.0, 0.5, 0.12, mat=kmat(0x7f7f7a))

def b_grave_cross(p):
    p.box(0.22, 0.22, 1.6, mat=kmat(0xb8b4ac)).box(0.9, 0.22, 0.22, z=1.05, mat=kmat(0xb8b4ac)).box(0.7, 1.6, 0.15, y=0.9, mat=kmat(0x6b8a4a))

def b_fence(p):
    for x in (-2, 0, 2): p.box(0.22, 0.22, 1.3, x=x, mat=kmat(WOOD))
    p.box(4.3, 0.12, 0.16, z=0.5, mat=kmat(0x9a7046)).box(4.3, 0.12, 0.16, z=1.0, mat=kmat(0x9a7046))

def b_field(p):
    p.box(10, 8, 0.12, mat=kmat(0x6e4c30))
    for k in range(7):
        y = -3.3 + k * 1.1; p.box(9.4, 0.5, 0.22, y=y, mat=kmat(0x5c3e26))
        for s in range(9): p.cyl(0.22, 0.7 + ((k * 7 + s * 3) % 5) * 0.12, x=-4 + s, y=y, z=0.2, mat=kmat(0x74b043 if k % 3 else 0x9cc24a), segs=4, r2=0.04)

def b_wheat(p):
    p.box(10, 8, 0.12, mat=kmat(0x7a5a36))
    for k in range(8):
        for s in range(10): p.box(0.7, 0.7, 1.1 + ((k * 5 + s * 3) % 4) * 0.12, x=-4.5 + s, y=-3.5 + k, z=0.1, mat=kmat(0xe0c060 if (k + s) % 3 else 0xcfa94a), rot=(k * s) % 3 * 0.3)

def b_haystack(p):
    p.cyl(1.3, 1.4, mat=kmat(0xd8b85a), segs=8).cyl(1.3, 1.2, z=1.4, mat=kmat(0xe6c86a), segs=8, r2=0.2)

def b_signpost(p):
    p.box(0.25, 0.25, 2.8, mat=kmat(WOOD)).box(1.8, 0.12, 0.45, x=0.75, z=2.1, mat=kmat(0xb88a56)).box(1.6, 0.12, 0.45, x=-0.6, z=1.5, mat=kmat(0xb88a56), rot=0.35)

def b_watchtower(p):
    for sx in (-1.6, 1.6):
        for sy in (-1.6, 1.6): p.box(0.45, 0.45, 7.4, x=sx, y=sy, mat=kmat(DARK))
    p.box(4.4, 4.4, 0.4, z=6.6, mat=kmat(WOOD))
    for k in (-2.1, 2.1): p.box(4.4, 0.15, 1.0, y=k, z=7.0, mat=kmat(0x9a7046)).box(0.15, 4.4, 1.0, x=k, z=7.0, mat=kmat(0x9a7046))
    for sx in (-1.9, 1.9):
        for sy in (-1.9, 1.9): p.box(0.25, 0.25, 2.4, x=sx, y=sy, z=7.0, mat=kmat(DARK))
    p.cyl(3.6, 2.2, z=9.4, mat=kmat(ROOF), segs=4, r2=0.0, rot=math.pi / 4)
    p.box(0.6, 3.0, 0.15, x=0, y=-2.6, z=0.2, mat=kmat(0x9a7046), tilt=-1.1)

def b_ruin_wall(p):
    for k, hh in enumerate((2.6, 3.4, 1.8, 2.9, 1.2, 2.2)): p.box(1.05, 1.1, hh, x=-2.6 + k * 1.05, mat=kmat(STONE if k % 2 else 0x989284))
    p.box(1.0, 0.9, 0.7, x=1.6, y=-1.2, mat=kmat(0x8c877b), rot=0.4).box(0.7, 0.6, 0.5, x=-1.2, y=1.1, mat=kmat(0x8c877b), rot=0.8)

def b_stilt_hut(p):
    for sx in (-1.8, 1.8):
        for sy in (-1.8, 1.8): p.box(0.3, 0.3, 2.4, x=sx, y=sy, mat=kmat(0xcfc6a8))
    p.box(4.6, 4.6, 0.3, z=2.2, mat=kmat(0xb89a6a)).box(3.4, 3.4, 2.2, z=2.5, mat=kmat(0xe8dcbc))
    p.cyl(3.2, 2.0, z=4.7, mat=kmat(0xc8a860), segs=6, r2=0.0).box(1.0, 0.15, 1.6, y=-1.72, z=2.5, mat=kmat(DARK))

def b_crag(p):
    p.rock(4.0, mat=kmat(0x8b9088), seed=3, sz=1.4).rock(2.2, x=1.8, y=0.9, mat=kmat(0x7d827a), seed=5, sz=1.2).rock(1.6, x=-1.6, y=-1.1, mat=kmat(0x969b92), seed=8)

def b_well(p):
    p.cyl(1.2, 0.9, mat=kmat(STONE), segs=10).cyl(0.95, 0.05, z=0.9, mat=kmat(0x3a6a8a), segs=10)
    p.box(0.2, 0.2, 2.4, x=-1.0, mat=kmat(WOOD)).box(0.2, 0.2, 2.4, x=1.0, mat=kmat(WOOD)).roof(2.8, 1.8, 0.9, z=2.4, mat=kmat(ROOF), rot=math.pi / 2)

def b_lamp_post(p):
    p.box(0.2, 0.2, 3.0, mat=kmat(0x3a3a3a)).box(0.9, 0.15, 0.15, x=0.35, z=2.9, mat=kmat(0x3a3a3a)).box(0.45, 0.45, 0.6, x=0.75, z=2.3, mat=kmat(GLOW, True))

def b_cart(p):
    p.box(2.2, 3.4, 0.7, z=0.9, mat=kmat(0x9a7046)).box(2.2, 0.15, 0.6, y=1.62, z=1.6, mat=kmat(0x9a7046)).box(0.15, 3.4, 0.6, x=1.03, z=1.6, mat=kmat(0x9a7046)).box(0.15, 3.4, 0.6, x=-1.03, z=1.6, mat=kmat(0x9a7046))
    p.cyl(0.7, 0.2, x=-1.1, z=0.7, mat=kmat(DARK), segs=10, tilt=math.pi / 2, rot=math.pi / 2).cyl(0.7, 0.2, x=1.3, z=0.7, mat=kmat(DARK), segs=10, tilt=math.pi / 2, rot=math.pi / 2)
    p.box(0.15, 2.4, 0.15, x=0.5, y=-2.6, z=0.9, mat=kmat(WOOD)).box(0.15, 2.4, 0.15, x=-0.5, y=-2.6, z=0.9, mat=kmat(WOOD))

# -- trees, plants and stones (any zone)
def b_oak_tree(p):
    p.cyl(0.5, 3.4, mat=kmat(BARK), segs=7, r2=0.34)
    p.limb(0.2, 1.8, (0, 0, 2.3), 0.95, 0.8, kmat(BARK), r2=0.08); p.limb(0.18, 1.6, (0, 0, 2.6), 0.9, 3.6, kmat(BARK), r2=0.08)
    p.ico(4.6, 4.4, 3.4, z=4.9, mat=kmat(LEAF), seed=1).ico(3.2, 3.0, 2.6, x=1.5, y=-0.6, z=5.9, mat=kmat(LEAF2), seed=2).ico(3.0, 3.0, 2.4, x=-1.4, y=0.9, z=5.5, mat=kmat(LEAF3), seed=3)

def b_pine_tree(p):
    p.cyl(0.32, 1.9, mat=kmat(0x5a3f28), segs=6)
    for k, (r, h, z) in enumerate(((2.1, 2.8, 1.2), (1.65, 2.6, 2.7), (1.15, 2.3, 4.1))): p.cyl(r, h, z=z, mat=kmat(0x2f7f3a if k % 2 else 0x3c9446), segs=7, r2=0.0, rot=k * 0.4)

def b_birch_tree(p):
    p.cyl(0.22, 5.2, mat=kmat(0xe8e4da), segs=6, r2=0.15)
    for z in (0.8, 1.9, 2.7, 3.8): p.box(0.46, 0.46, 0.1, z=z, mat=kmat(0x3a3a3a), rot=z)
    p.ico(2.6, 2.4, 3.6, z=5.4, mat=kmat(0x8fcf5a), seed=4).ico(1.9, 1.8, 2.4, x=0.7, y=0.3, z=6.6, mat=kmat(0x7fc050), seed=5).ico(1.6, 1.6, 2.0, x=-0.6, y=-0.4, z=4.6, mat=kmat(0x9ad86a), seed=6)

def b_bush(p):
    p.ico(2.3, 2.1, 1.6, z=0.6, mat=kmat(LEAF), seed=6).ico(1.7, 1.6, 1.3, x=1.0, y=0.4, z=0.5, mat=kmat(LEAF2), seed=7).ico(1.5, 1.4, 1.2, x=-0.9, y=-0.3, z=0.45, mat=kmat(LEAF3), seed=8)

def b_flower_patch(p):
    p.cyl(2.2, 0.06, mat=kmat(0x4aa641), segs=10); r = rng01(9)
    for k in range(18):
        a, d = r() * 6.28, 0.3 + r() * 1.7; x, y = math.cos(a) * d, math.sin(a) * d
        p.cyl(0.04, 0.45 + r() * 0.2, x=x, y=y, mat=kmat(0x3c8a34), segs=3).ico(0.3, 0.3, 0.2, x=x, y=y, z=0.6, mat=kmat(FLOWERS[k % 5]), seed=k, jitter=0.05)

def b_stump(p):
    p.cyl(0.7, 0.8, mat=kmat(BARK), segs=8, r2=0.56).cyl(0.54, 0.06, z=0.8, mat=kmat(0xc89a6a), segs=8)
    for a in (0.3, 2.4, 4.4): p.limb(0.16, 0.9, (0, 0, 0.35), 1.7, a, kmat(BARK), r2=0.06)

def b_fallen_log(p):
    p.cyl(0.45, 5.2, x=-2.6, z=0.45, mat=kmat(0x5e4128), segs=8, tilt=math.pi / 2, rot=math.pi / 2)
    p.cyl(0.36, 0.06, x=2.62, z=0.45, mat=kmat(0xc89a6a), segs=8, tilt=math.pi / 2, rot=math.pi / 2)
    p.limb(0.14, 1.0, (0.6, 0, 0.75), 0.6, 0.4, kmat(0x5e4128), r2=0.05); p.ico(1.4, 0.7, 0.3, x=-0.8, z=0.9, mat=kmat(MOSS), seed=10, jitter=0.1)

def b_boulder(p):
    p.rock(3.2, mat=kmat(ROCK), seed=11, sz=0.85).rock(1.4, x=1.6, y=-0.6, mat=kmat(0x7d827a), seed=12)

def b_rock_pile(p):
    for k, (x, y, s) in enumerate(((0, 0, 1.8), (1.2, 0.5, 1.2), (-1.1, 0.6, 1.3), (0.4, -1.1, 1.0), (-0.6, -0.9, 0.8), (1.6, -0.6, 0.7))):
        p.rock(s, x=x, y=y, mat=kmat((0x8b9088, 0x7d827a, 0x969b92)[k % 3]), seed=20 + k)

def b_standing_stone(p):
    p.box(1.1, 0.6, 3.4, mat=kmat(0x8f918a)).ico(1.0, 0.55, 0.35, z=3.45, mat=kmat(MOSS), seed=13, jitter=0.1)

def b_stone_circle(p):
    for k in range(7):
        a = k * 2 * math.pi / 7; p.box(0.9, 0.5, 2.3 + (k * 3 % 4) * 0.35, x=5 * math.cos(a), y=5 * math.sin(a), rot=a + math.pi / 2, mat=kmat(0x8f918a if k % 2 else 0x9c9c98))
    p.cyl(1.3, 0.35, mat=kmat(0x9c9c98), segs=7)

def b_log_pile(p):
    for x0, y, z in ((-1.5, -0.6, 0.28), (-1.5, 0, 0.28), (-1.5, 0.6, 0.28), (-1.4, -0.3, 0.76), (-1.4, 0.3, 0.76), (-1.3, 0, 1.24)):
        p.cyl(0.28, 3.0 - (x0 + 1.5) * 2, x=x0, y=y, z=z, mat=kmat(0x6b4a2b if y else 0x5e4128), segs=7, tilt=math.pi / 2, rot=math.pi / 2)

def b_campfire(p):
    for k in range(8):
        a = k * math.pi / 4; p.rock(0.5, x=0.95 * math.cos(a), y=0.95 * math.sin(a), mat=kmat(0x7d827a), seed=30 + k)
    for a in (0.4, 2.5, 4.6): p.limb(0.1, 1.0, (0.6 * math.cos(a), 0.6 * math.sin(a), 0.05), 1.05, a - math.pi / 2, kmat(0x5e4128))
    p.cyl(0.38, 1.0, z=0.1, mat=kmat(0xff8a2a, True), segs=5, r2=0.0).cyl(0.22, 0.75, z=0.1, mat=kmat(0xffd24a, True), segs=5, r2=0.0, rot=0.6)

def b_tent(p):
    p.roof(3.2, 3.6, 2.4, mat=kmat(0xd8c8a0)).box(0.9, 0.06, 1.3, y=-1.82, mat=kmat(DARK))
    for y in (-1.9, 1.9): p.cyl(0.06, 2.8, y=y, mat=kmat(WOOD), segs=5)

def b_wooden_bridge(p):
    for k in range(12):
        y = -4.5 + k * 0.82; p.box(3.2, 0.75, 0.15, y=y, z=0.6 + 0.55 * math.sin(math.pi * k / 11), mat=kmat(0x9a7046 if k % 2 else 0x8a6038))
    for y in (-4.5, -1.5, 1.5, 4.5):
        rise = 0.55 * math.sin(math.pi * (y + 4.5) / 9.0)
        for x in (-1.55, 1.55): p.box(0.15, 0.15, 1.7 + rise, x=x, y=y, mat=kmat(DARK))
    for x in (-1.55, 1.55): p.box(0.12, 9.4, 0.14, x=x, z=2.0, mat=kmat(WOOD))
    for y in (-4.9, 4.9): p.box(3.6, 0.7, 0.7, y=y, mat=kmat(STONE))

def b_stepping_stones(p):
    for k in range(6):
        p.cyl(0.65 + (k % 3) * 0.12, 0.25, x=math.sin(k * 0.7) * 1.2, y=-4 + k * 1.6, mat=kmat((0x9c9c98, 0x8b9088, 0xa8a296)[k % 3]), segs=7, rot=k)

def b_pond(p):
    p.cyl(3.3, 0.06, z=0.02, mat=kmat(0x3a8ac0), segs=16)
    for k in range(14):
        a = k * 2 * math.pi / 14; p.rock(0.55 + (k % 3) * 0.12, x=3.4 * math.cos(a), y=3.4 * math.sin(a), mat=kmat(0x8b9088), seed=40 + k)
    for x, y, r in ((-1.0, 0.6, 0.5), (0.8, -0.9, 0.4), (1.4, 1.0, 0.45)): p.cyl(r, 0.04, x=x, y=y, z=0.08, mat=kmat(0x4f9a4a), segs=9)
    p.ico(0.3, 0.3, 0.2, x=0.8, y=-0.9, z=0.16, mat=kmat(0xffc0d0), seed=3, jitter=0.05)

def b_ruined_arch(p):
    p.box(1.0, 1.0, 5.0, x=-2.2, mat=kmat(STONE)).box(1.3, 1.3, 0.3, x=-2.2, z=5.0, mat=kmat(0x989284))
    p.box(1.0, 1.0, 3.6, x=2.2, mat=kmat(STONE)).box(3.0, 1.1, 0.9, x=-1.4, z=5.3, mat=kmat(0x989284))
    p.box(1.6, 1.0, 0.8, x=2.9, y=1.7, mat=kmat(0x8c877b), rot=0.5).box(0.9, 0.8, 0.6, x=0.6, y=-1.4, mat=kmat(0x8c877b), rot=1.1)

def b_broken_pillar(p):
    p.box(1.7, 1.7, 0.4, mat=kmat(0xc8c2b4)).cyl(0.62, 3.4, z=0.4, mat=kmat(0xd8d2c4), segs=10)
    p.cyl(0.62, 1.0, x=1.4, y=0.6, z=0.62, mat=kmat(0xd8d2c4), segs=10, tilt=math.pi / 2, rot=0.8)

def b_stone_lantern(p):
    p.box(0.8, 0.8, 0.3, mat=kmat(0x8f918a)).cyl(0.2, 1.2, z=0.3, mat=kmat(0x8f918a), segs=6)
    p.box(0.6, 0.6, 0.55, z=1.5, mat=kmat(GLOW, True)).cyl(0.62, 0.5, z=2.05, mat=kmat(0x6f716a), segs=4, r2=0.0, rot=math.pi / 4)

# -- Emberridge
CHAR = 0x2a1d1a
def b_charred_tree(p):
    p.cyl(0.42, 4.6, mat=kmat(CHAR), segs=6, r2=0.12)
    for z, t, a in ((2.2, 0.9, 0.3), (2.9, 0.8, 2.2), (3.4, 1.0, 4.0), (3.9, 0.7, 5.4)): p.limb(0.13, 1.8, (0, 0, z), t, a, kmat(CHAR), r2=0.03, segs=5)
    p.box(0.22, 0.22, 0.22, x=0.38, z=0.5, mat=kmat(0xff6a2a, True), rot=0.5).box(0.18, 0.18, 0.18, x=-0.3, y=0.3, z=1.2, mat=kmat(0xff6a2a, True))

def b_lava_rock(p):
    p.rock(2.6, mat=kmat(CHAR), seed=21, sz=0.9).rock(1.2, x=1.4, y=0.5, mat=kmat(0x3a2623), seed=22)
    for t, a, z in ((0.5, 0.4, 1.4), (0.7, 2.6, 1.2), (0.4, 4.4, 1.6)): p.limb(0.22, 0.9, (0, 0, z), t, a, kmat(0xff7a2a, True), r2=0.0, segs=4)

def b_basalt_columns(p):
    for k, (x, y, h) in enumerate(((0, 0, 4.2), (1.0, 0.3, 3.4), (-0.9, 0.5, 3.0), (0.4, -0.9, 2.6), (-0.6, -0.8, 1.9), (1.5, -0.7, 1.6), (-1.6, -0.2, 1.3), (0.3, 1.1, 2.2), (-1.2, 1.3, 1.0))):
        p.cyl(0.55, h, x=x, y=y, mat=kmat(0x33282a if k % 2 else 0x3d302c), segs=6, rot=k * 0.2)

def b_ember_vent(p):
    p.cyl(1.7, 0.9, mat=kmat(0x3a2623), segs=8, r2=0.6).cyl(0.58, 0.12, z=0.9, mat=kmat(0xff8a2a, True), segs=8)
    p.cyl(0.25, 0.6, z=0.95, mat=kmat(0xffd24a, True), segs=5, r2=0.0)

# -- Gloamwood
def b_glow_mushroom(p):
    p.cyl(0.36, 3.0, mat=kmat(0xcfc8e0), segs=7, r2=0.28).cyl(1.5, 0.15, z=2.85, mat=kmat(0x6a3a9a), segs=10)
    p.ico(3.4, 3.4, 1.6, z=3.25, mat=kmat(0xb06cff, True), seed=14, jitter=0.08)
    for x, y in ((0.7, 0.4), (-0.6, 0.5), (0.1, -0.8)): p.ico(0.35, 0.35, 0.2, x=x, y=y, z=3.95, mat=kmat(0xf2e8ff, True), seed=2, jitter=0.05)

def b_mushroom_cluster(p):
    for k, (x, y, h, c) in enumerate(((0, 0, 1.2, 0.9), (0.9, 0.4, 0.8, 0.7), (-0.8, 0.5, 0.9, 0.6), (0.3, -0.8, 0.6, 0.5), (-0.5, -0.6, 0.5, 0.45))):
        p.cyl(0.1, h, x=x, y=y, mat=kmat(0xcfc8e0), segs=5).ico(c, c, c * 0.5, x=x, y=y, z=h + 0.05, mat=kmat(0x4ad8ff if k % 2 else 0xb06cff, True), seed=k, jitter=0.06)

def b_crystal_cluster(p):
    p.rock(1.8, mat=kmat(0x2a2440), seed=15, sz=0.6)
    for k, (r, h, t, a) in enumerate(((0.45, 3.0, 0.1, 0), (0.32, 2.2, 0.45, 1.2), (0.3, 1.9, 0.5, 3.0), (0.25, 1.5, 0.6, 4.4), (0.22, 1.3, 0.55, 5.6))):
        p.limb(r, h, (0, 0, 0.4), t, a, kmat(0x6af0e0 if k % 2 else 0x4ad8ff, True), r2=0.0, segs=5)

def b_twisted_tree(p):
    e = p.limb(0.42, 2.0, (0, 0, 0), 0.22, 0.0, kmat(0x1c1828), r2=0.34)
    e = p.limb(0.34, 1.8, e, 0.35, 2.6, kmat(0x1c1828), r2=0.26)
    e = p.limb(0.26, 1.6, e, 0.3, 0.6, kmat(0x1c1828), r2=0.18)
    x, y, z = e
    p.ico(3.6, 3.4, 2.4, x=x, y=y, z=z + 0.6, mat=kmat(0x3a2a68), seed=16).ico(2.4, 2.2, 1.8, x=x + 1.2, y=y - 0.4, z=z + 1.3, mat=kmat(0x5a3f9a), seed=17)
    for dx, dy in ((1.0, 0.6), (-1.1, -0.2), (0.2, -1.2)): p.ico(0.3, 0.3, 0.45, x=x + dx, y=y + dy, z=z - 0.6, mat=kmat(0x6af0e0, True), seed=3, jitter=0.05)

# -- Mirrormere
def b_reeds(p):
    r = rng01(18)
    for k in range(16):
        a, d = r() * 6.28, r() * 0.9; x, y, h = math.cos(a) * d, math.sin(a) * d, 1.5 + r() * 1.0
        p.cyl(0.05, h, x=x, y=y, mat=kmat(0x7fae4a if k % 3 else 0x9cbf5a), segs=3, r2=0.02)
        if k % 3 == 0: p.cyl(0.1, 0.45, x=x, y=y, z=h - 0.55, mat=kmat(0x6a4a2a), segs=5)

def b_palm_tree(p):
    e = (0, 0, 0)
    for k, t in enumerate((0.06, 0.14, 0.22, 0.3, 0.36)): e = p.limb(0.32 - k * 0.025, 1.3, e, t, 0.0, kmat(0xcfc6a8 if k % 2 else 0xb8ae90), r2=0.3 - k * 0.025, segs=6)
    for k in range(7): p.frond(e, k * 2 * math.pi / 7 + 0.3, 3.2, 0.55, 0.3, 1.5, kmat(0x3fb09a if k % 2 else 0x6fd0b0))
    for dx, dy in ((0.25, 0.1), (-0.2, 0.2), (0.0, -0.25)): p.ico(0.36, 0.36, 0.36, x=e[0] + dx, y=e[1] + dy, z=e[2] - 0.3, mat=kmat(0x6a4a2a), seed=5, jitter=0.05)

def b_driftwood(p):
    p.cyl(0.32, 4.4, x=-2.2, z=0.3, mat=kmat(0xd8cfb8), segs=6, tilt=math.pi / 2, rot=math.pi / 2 + 0.15, r2=0.22)
    p.limb(0.12, 1.4, (0.9, 0.1, 0.45), 1.1, 0.5, kmat(0xcfc6a8), r2=0.04, segs=5); p.limb(0.1, 1.0, (-1.0, -0.2, 0.4), 1.2, 3.6, kmat(0xcfc6a8), r2=0.03, segs=5)

def b_coral(p):
    p.ico(1.2, 1.2, 0.6, z=0.2, mat=kmat(0xe07a90), seed=19)
    for k, (t, a, h) in enumerate(((0.15, 0, 1.6), (0.6, 1.1, 1.3), (0.55, 2.3, 1.2), (0.6, 3.5, 1.4), (0.5, 4.7, 1.1), (0.65, 5.7, 1.0))):
        p.limb(0.2, h, (0, 0, 0.3), t, a, kmat(0xff8fa8 if k % 2 else 0xffb86a), r2=0.07, segs=5)

def b_lily_pads(p):
    for k, (x, y, r) in enumerate(((0, 0, 0.8), (1.4, 0.6, 0.6), (-1.2, 0.8, 0.65), (0.6, -1.3, 0.55), (-0.9, -1.0, 0.5), (2.0, -0.8, 0.45))):
        p.cyl(r, 0.04, x=x, y=y, mat=kmat(0x4f9a4a if k % 2 else 0x5fae56), segs=9, rot=k)
    p.ico(0.35, 0.35, 0.25, z=0.15, mat=kmat(0xffc0d0), seed=7, jitter=0.05).ico(0.3, 0.3, 0.22, x=-1.2, y=0.8, z=0.14, mat=kmat(0xffffff), seed=8, jitter=0.05)

# -- Stormreach
def b_windswept_pine(p):
    e = p.limb(0.32, 2.2, (0, 0, 0), 0.18, 0.0, kmat(0x3a3028), r2=0.26)
    e = p.limb(0.26, 2.0, e, 0.32, 0.0, kmat(0x3a3028), r2=0.18)
    x, y, z = e
    for k, (r, h, dz, dy) in enumerate(((1.9, 2.0, -2.6, 0.5), (1.5, 1.9, -1.4, 0.2), (1.0, 1.7, -0.3, -0.1))):
        p.cyl(r, h, x=x, y=y + dy - 0.6, z=z + dz, mat=kmat(0x2f5a5a if k % 2 else 0x3f7272), segs=7, r2=0.0, tilt=0.25)

def b_snowy_rock(p):
    p.rock(2.8, mat=kmat(0x69727f), seed=23, sz=0.95).ico(2.2, 2.0, 0.8, z=2.25, mat=kmat(0xeef3f8), seed=24, jitter=0.12)

def b_storm_crystal(p):
    p.rock(1.6, mat=kmat(0x69727f), seed=25, sz=0.7)
    p.limb(0.45, 3.6, (0, 0, 0.3), 0.12, 0.3, kmat(0xffe14a, True), r2=0.0, segs=5); p.limb(0.25, 1.6, (0.2, 0.1, 0.3), 0.6, 2.0, kmat(0xfff08a, True), r2=0.0, segs=5)

def b_rune_stone(p):
    p.box(1.4, 0.5, 2.8, mat=kmat(0x5f6876)).box(1.5, 0.6, 0.25, z=2.8, mat=kmat(0x4e5662))
    for x, z, w, h in ((-0.3, 0.9, 0.12, 1.2), (0.25, 1.3, 0.12, 0.8), (-0.05, 1.5, 0.55, 0.1), (0.0, 0.7, 0.45, 0.1)): p.box(w, 0.04, h, x=x, y=-0.27, z=z, mat=kmat(0x8fe0ff, True))


STARTER = [('cottage', b_cottage, 1, None), ('chapel', b_chapel, 1, None), ('gravestone', b_gravestone, 1, None), ('grave_cross', b_grave_cross, 1, None),
           ('fence', b_fence, 1, None), ('field', b_field, 0, None), ('wheat', b_wheat, 0, None), ('haystack', b_haystack, 1, None),
           ('signpost', b_signpost, 1, None), ('watchtower', b_watchtower, 1, None), ('ruin_wall', b_ruin_wall, 1, None), ('stilt_hut', b_stilt_hut, 1, None),
           ('crag', b_crag, 1, None), ('well', b_well, 1, None), ('lamp_post', b_lamp_post, 1, None), ('cart', b_cart, 1, None),
           # trees, plants and stones
           ('oak_tree', b_oak_tree, 1, 0.6), ('pine_tree', b_pine_tree, 1, 0.45), ('birch_tree', b_birch_tree, 1, 0.35), ('bush', b_bush, 1, 1.0),
           ('flower_patch', b_flower_patch, 0, None), ('stump', b_stump, 1, 0.7), ('fallen_log', b_fallen_log, 1, None), ('boulder', b_boulder, 1, None),
           ('rock_pile', b_rock_pile, 1, None), ('standing_stone', b_standing_stone, 1, 0.65), ('stone_circle', b_stone_circle, 0, None), ('log_pile', b_log_pile, 1, None),
           ('campfire', b_campfire, 1, 1.0), ('tent', b_tent, 1, None), ('wooden_bridge', b_wooden_bridge, 0, None), ('stepping_stones', b_stepping_stones, 0, None),
           ('pond', b_pond, 0, None), ('ruined_arch', b_ruined_arch, 0, None), ('broken_pillar', b_broken_pillar, 1, 0.8), ('stone_lantern', b_stone_lantern, 1, 0.5),
           # Emberridge
           ('charred_tree', b_charred_tree, 1, 0.45), ('lava_rock', b_lava_rock, 1, None), ('basalt_columns', b_basalt_columns, 1, None), ('ember_vent', b_ember_vent, 1, 1.3),
           # Gloamwood
           ('glow_mushroom', b_glow_mushroom, 1, 0.4), ('mushroom_cluster', b_mushroom_cluster, 0, None), ('crystal_cluster', b_crystal_cluster, 1, None), ('twisted_tree', b_twisted_tree, 1, 0.45),
           # Mirrormere
           ('reeds', b_reeds, 0, None), ('palm_tree', b_palm_tree, 1, 0.35), ('driftwood', b_driftwood, 1, None), ('coral', b_coral, 1, 0.7), ('lily_pads', b_lily_pads, 0, None),
           # Stormreach
           ('windswept_pine', b_windswept_pine, 1, 0.45), ('snowy_rock', b_snowy_rock, 1, None), ('storm_crystal', b_storm_crystal, 1, 0.7), ('rune_stone', b_rune_stone, 1, 0.7)]


def make_kit(col, names=None, start=0):
    """Builds the starter pieces (or just the named ones) on the shelf, from slot start on."""
    MATS.clear(); out = []      # (materials remembered from a file opened earlier are gone)
    for name, build, solid, radius in STARTER:
        if names is not None and name not in names: continue
        p = Piece(name); build(p); out.append(p.done(col, shelf_pos('kit', start + len(out)), solid=bool(solid), radius=radius))
    return out


# ---------------------------------------------------------------- Kit.blend and the shelf copies
def kit_pieces():
    """In Kit.blend, every mesh is a piece, except the shelf it stands on and the figure for scale."""
    return [o for o in bpy.context.scene.objects if o.type == 'MESH' and not any(c.name in ('Shelf', 'Reference') for c in o.users_collection)]


def make_kit_file():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kc = coll('Kit'); pieces = make_kit(kc); known = {o.name for o in pieces}
    if os.path.isdir(KITDIR):   # pieces you made earlier come back from their saved models
        for f in sorted(os.listdir(KITDIR)):
            if f.endswith('.glb') and f[:-4] not in known: import_piece(f[:-4], kc, len(known)); known.add(f[:-4])
    make_slab('kit', len(known), coll('Shelf')); bpy.context.scene['offered'] = [n for n, *_ in STARTER]
    # a plain figure as tall as the hero, for scale
    p = Piece('Hero (2 tall, for scale)'); p.box(0.7, 0.45, 1.3, mat=kmat(0x3a4a8a)).box(0.6, 0.6, 0.6, z=1.35, mat=kmat(0xe8c0a0))
    p.done(coll('Reference'), (-63, 340, 0)); bpy.data.objects['Hero (2 tall, for scale)'].hide_select = True
    view(0, 362, 110); write_kit()


def write_kit():
    # written without the window manager, which would carry this computer's home folder into a file
    # that is shared on GitHub (the screens keep the view)
    bpy.data.libraries.write(KIT_BLEND, set(bpy.data.scenes) | set(bpy.data.workspaces) | set(bpy.data.screens), path_remap='RELATIVE_ALL', compress=False)


def add_new_pieces():
    """Puts starter pieces that Kit.blend has never had on its shelf, after what is there. A piece you
    deleted or renamed is not put back: the file remembers which ones it has been offered."""
    bpy.ops.wm.open_mainfile(filepath=KIT_BLEND, load_ui=True); sc = bpy.context.scene
    have = kit_pieces(); offered = set(sc.get('offered') or [clean(o.name) for o in have])
    new = [n for n, *_ in STARTER if n not in offered]
    if not new: return 0
    made = make_kit(coll('Kit'), set(new), len(have))
    sc['offered'] = sorted(offered | set(new)); fit_slab('kit', len(have) + len(made)); write_kit()
    return len(made)


def import_piece(name, kc, k):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(KITDIR, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]; meshes = [o for o in new if o.type == 'MESH']
    if not meshes: return
    keep = meshes[0]
    if len(meshes) > 1:
        with bpy.context.temp_override(active_object=keep, selected_editable_objects=meshes): bpy.ops.object.join()
    keep.parent = None; keep.matrix_world = Matrix.Translation(shelf_pos('kit', k))
    keep.name = name; keep.data.name = name; keep.show_name = True
    pj = os.path.join(WORLD, 'placed.json')
    keep['solid'] = (json.load(open(pj)).get('kit', {}).get(name, {}) if os.path.exists(pj) else {}).get('solid', 1)
    for c in list(keep.users_collection): c.objects.unlink(keep)
    kc.objects.link(keep)
    for o in new:
        if o != keep and o.name in bpy.data.objects: bpy.data.objects.remove(o)


def append_kit():
    """A fresh copy of every piece in Kit.blend (not yet in the scene), as {name: object}."""
    with bpy.data.libraries.load(KIT_BLEND, link=False) as (src, dst):
        dst.objects = list(src.objects)
    out = {}
    for o in dst.objects:
        if o is None: continue
        if o.type != 'MESH' or o.name.startswith('Shelf') or o.name.startswith('Hero ('): bpy.data.objects.remove(o); continue
        out[clean(o.name)] = o
    return out


def shelf_in_zone(key):
    """The zone file's shelf: copies of the Kit.blend pieces to place from. Copies already here get the
    latest shape from Kit.blend (and so does everything placed from them)."""
    sc = coll('Kit shelf (copies from Kit.blend)')
    on = lambda: sorted((o for o in sc.objects if o.type == 'MESH' and o.name != 'Shelf' and on_slab(o)), key=lambda o: (o.name != base_name(o.name), o.name))
    have = {}
    for o in on(): have.setdefault(clean(o.name), o)
    new = append_kit(); slot = len(have)
    for name, o in sorted(new.items(), key=lambda t: (t[1].location.y, t[1].location.x)):
        old = have.get(name)
        if old:
            old.data.user_remap(o.data); old['solid'] = o.get('solid', 1)
            if 'radius' in o: old['radius'] = o['radius']
            elif 'radius' in old: del old['radius']
            bpy.data.objects.remove(o)
        else:
            sc.objects.link(o); o.matrix_world = Matrix.Translation(shelf_pos(key, slot)); o.show_name = True; o.name = name; slot += 1
    bpy.data.orphans_purge(do_recursive=True)
    if not bpy.data.objects.get('Shelf'): make_slab(key, slot, sc)
    else: fit_slab(key, slot)
    out = {}
    for o in on(): out.setdefault(clean(o.name), o)
    for name, o in out.items(): o.data.name = name
    return out


def restore_placed(k, shelf, H, regions, NV, CELL):
    """Pieces placed in this zone (from assets/world/placed.json), as linked copies of the shelf."""
    path = os.path.join(WORLD, 'placed.json')
    if not os.path.exists(path): return
    pc = coll('Placed')
    for p in json.load(open(path)).get('placed', []):
        x, z = p['x'], p['z']; i = min(max(int(round((x + HALF) / CELL)), 0), NV - 1); j = min(max(int(round((z + HALF) / CELL)), 0), NV - 1)
        src = shelf.get(p['kit'])
        if not src or int(regions[j, i]) != k: continue
        o = bpy.data.objects.new(p['kit'], src.data)
        qx, qy, qz, qw = p.get('q', [0, 0, 0, 1]); sx, sy, sz = p.get('s', [1, 1, 1])
        o.location = (x, -z, float(H[j, i]) + p.get('lift', 0))
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Quaternion((qw, qx, -qz, qy)); o.scale = (sx, sz, sy)
        pc.objects.link(o)


# ---------------------------------------------------------------- send
def send():
    N, NV, CELL, H, roads, regions, sc = grid(); P = places()
    if not os.path.exists(KIT_BLEND): make_kit_file(); print('Made blender/Kit.blend.')
    else:
        n = add_new_pieces()
        if n: print('Kit.blend: %d new pieces added to the shelf.' % n)
    try: brought = json.load(open(BROUGHT))
    except Exception: brought = {}
    for k, key, name, tag in ZONES:
        path = zone_path(name); fresh = not os.path.exists(path)
        if fresh: bpy.ops.wm.read_factory_settings(use_empty=True)
        else:
            bpy.ops.wm.open_mainfile(filepath=path)
            tc = bpy.data.collections.get('Terrain'); objs = [o for o in tc.all_objects if o.type == 'MESH'] if tc else []
            if any(fingerprint(o) not in (o.get('sent', ''), brought.get(name, '')) for o in objs):
                print('%s: has sculpting that is not in the game yet, so it was left as it is (bring it in first).' % name); continue
            for c in ('Terrain', 'Around (for reference)', 'Places'):
                cc = bpy.data.collections.get(c)
                for o in list(cc.all_objects) if cc else []:
                    me = o.data if o.type == 'MESH' else None; bpy.data.objects.remove(o)
                    if me: bpy.data.meshes.remove(me)
        bpy.context.scene.unit_settings.system = 'METRIC'
        o, cx, cy, size = make_zone(k, name, tag, N, NV, CELL, H, roads, regions)
        make_places(P, H, regions, CELL, coll('Places'), k)
        shelf = shelf_in_zone(key)
        if fresh: make_water(); restore_placed(k, shelf, H, regions, NV, CELL); view(cx, cy, size * 1.05)
        save(path)
        print('%s: %s.' % (name, 'made' if fresh else 'terrain, places and shelf refreshed'))


# ---------------------------------------------------------------- bring
def bring():
    N, NV, CELL, H, roads, regions, sc = grid()
    files = [(k, name, zone_path(name)) for k, _, name, _ in ZONES if os.path.exists(zone_path(name))]
    if not files and not os.path.exists(KIT_BLEND): sys.exit('There are no Blender files yet: run Update Blender files first.')
    # the kit: every piece in Kit.blend becomes a model the game can load
    info = {}
    if os.path.exists(KIT_BLEND):
        bpy.ops.wm.open_mainfile(filepath=KIT_BLEND); os.makedirs(KITDIR, exist_ok=True)
        for o in kit_pieces():
            name = clean(o.name)
            if name in info: continue
            keep = o.matrix_world.copy(); o.matrix_world = Matrix.Identity(4)
            for x in bpy.context.view_layer.objects: x.select_set(False)
            try:
                o.select_set(True); bpy.context.view_layer.objects.active = o
                bpy.ops.export_scene.gltf(filepath=os.path.join(KITDIR, name + '.glb'), export_format='GLB', use_selection=True, export_apply=True, export_animations=False, export_yup=True)
            finally: o.matrix_world = keep
            info[name] = {'file': 'models/kit/%s.glb' % name, 'solid': int(o.get('solid', 1))}
            if o.get('radius'): info[name]['radius'] = round(float(o['radius']), 3)
    else:
        pj = os.path.join(WORLD, 'placed.json'); info = json.load(open(pj)).get('kit', {}) if os.path.exists(pj) else {}
    # each zone: what was sculpted, and what was placed
    flat = H.ravel(); acc = np.zeros(NV * NV); cnt = np.zeros(NV * NV); brought = {}; raw = []; skipped = []; notes = []
    for k, name, path in files:
        bpy.ops.wm.open_mainfile(filepath=path)
        tc = bpy.data.collections.get('Terrain'); land = [o for o in tc.all_objects if o.type == 'MESH'] if tc else []
        for o in land:
            note = read_terrain(o, flat, acc, cnt, NV, CELL); brought[name] = fingerprint(o)
            if note: notes.append(note)
        skip = set(land) | {bpy.data.objects.get('Shelf'), bpy.data.objects.get('Water')}
        for o in bpy.context.scene.objects:
            if o.type != 'MESH' or o in skip or o.hide_select or on_slab(o): continue
            kname = next((c for c in (clean(o.data.name), clean(o.name)) if c in info), None)
            if not kname: skipped.append('%s (%s)' % (o.name, name)); continue
            loc, q, s = o.matrix_world.decompose(); raw.append((kname, loc.x, -loc.y, loc.z, q, s))
    json.dump(brought, open(BROUGHT, 'w'))
    hs = flat.copy(); m = cnt > 0; hs[m] = acc[m] / cnt[m]; hs = hs.reshape(NV, NV)
    d = (hs - (H - sc)).astype(np.float32); d[np.abs(d) < 0.02] = 0   # against the land as generated
    sp = os.path.join(WORLD, 'sculpt.bin')
    if d.any(): d.astype('<f4').tofile(sp)
    elif os.path.exists(sp): os.remove(sp)        # nothing sculpted: no layer
    print('Terrain: %d spots sculpted (biggest change %.1f), from %d zone files' % (int((d != 0).sum()), float(np.abs(d).max()), len(files)))
    for n_ in notes: print('  ' + n_)
    placed = []; seen = set()
    for kname, x, z, y, q, s in raw:
        key = (kname, round(x, 2), round(z, 2))
        if key in seen: continue                   # the same piece in two files
        seen.add(key); i = min(max(int(round((x + HALF) / CELL)), 0), NV - 1); j = min(max(int(round((z + HALF) / CELL)), 0), NV - 1)
        placed.append({'kit': kname, 'x': round(x, 3), 'z': round(z, 3), 'lift': round(y - float(hs[j, i]), 3),
                       'q': [round(q.x, 5), round(q.z, 5), round(-q.y, 5), round(q.w, 5)], 's': [round(s.x, 4), round(s.z, 4), round(s.y, 4)]})
    if not files and os.path.exists(os.path.join(WORLD, 'placed.json')): placed = json.load(open(os.path.join(WORLD, 'placed.json'))).get('placed', [])
    placed.sort(key=lambda p: (p['kit'], p['x'], p['z']))          # a steady order, so the file only changes when you do
    json.dump({'kit': dict(sorted(info.items())), 'placed': placed}, open(os.path.join(WORLD, 'placed.json'), 'w'), indent=1)
    print('Kit: %d pieces saved to assets/models/kit. Placed: %d pieces.' % (len(info), len(placed)))
    if skipped: print('  Not a copy of a Kit piece, so left out:', ', '.join(skipped[:12]), '...' if len(skipped) > 12 else '')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    {'send': send, 'bring': bring}.get(args[0] if args else '', lambda: sys.exit('Say send or bring.'))()
