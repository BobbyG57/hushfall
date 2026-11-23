#!/usr/bin/env python3
"""Paints Hushfall's hand-painted ground textures: one per region, plus a cliff rock.

    python3 tools/textures/paint_ground.py                  # writes assets/textures/ground/*.jpg
    python3 tools/textures/paint_ground.py --preview DIR     # also paints 3 variants of each and
                                                             # contact sheets, to compare and pick

Every texture is 512 x 512 and repeats seamlessly. Each is built from noise made with FFTs (so it
wraps around), mapped through a small painted palette and softly posterized into flat bands of
paint, then layered with brush strokes, stones, cracks or ripples. Strokes are drawn at double size
and scaled down, which gives them soft edges.

In the game the region's own colours (the biome palette, see CUSTOMIZE.md) set the overall colour;
a texture adds its painted detail and its shifts of light and hue on top.
"""
import argparse
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

N = 512           # output size
S = N * 2         # drawing size for strokes (scaled down at the end)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'assets', 'textures', 'ground')


def rgb(h):
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], np.float32)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


class Painter:
    def __init__(self, seed):
        self.rng = np.random.default_rng(seed)

    # ---------------------------------------------------------------- tileable fields
    def noise(self, beta=2.0, hi=None, stretch=(1.0, 1.0)):
        """Fractal noise in 0..1 that wraps at the edges. Higher beta = smoother. stretch > 1 on an
        axis makes the features longer along the other axis."""
        w = self.rng.standard_normal((N, N)).astype(np.float32)
        fy = np.fft.fftfreq(N)[:, None] * N * stretch[1]
        fx = np.fft.fftfreq(N)[None, :] * N * stretch[0]
        f = np.hypot(fx, fy); f[0, 0] = 1
        amp = f ** (-beta / 2); amp[0, 0] = 0
        if hi: amp = amp * np.exp(-(f / hi) ** 2)
        out = np.real(np.fft.ifft2(np.fft.fft2(w) * amp)).astype(np.float32)
        out -= out.min(); out /= out.max() + 1e-9
        return out

    def voronoi(self, k, squash=1.0, warp=0.0):
        """Distances to the nearest and second-nearest of k points on a wrapping square, plus the
        index of the nearest. Points keep a minimum spacing (two close points would smear a dark
        wedge across the cracks). squash < 1 flattens the cells; warp bends the cracks."""
        gap, pts = 0.62 * N / math.sqrt(k), []
        for _ in range(k * 60):
            if len(pts) >= k: break
            q = self.rng.uniform(0, N, 2)
            if all(min(abs(q[0] - o[0]), N - abs(q[0] - o[0])) ** 2 + min(abs(q[1] - o[1]), N - abs(q[1] - o[1])) ** 2 > gap * gap for o in pts): pts.append(q)
        k = len(pts); pts = np.array(pts, np.float32)
        yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
        if warp: xx = xx + (self.noise(2.4) - 0.5) * warp; yy = yy + (self.noise(2.4) - 0.5) * warp
        dx = np.abs(xx[None] - pts[:, 0, None, None]); dx = np.minimum(dx, N - dx)
        dy = np.abs(yy[None] - pts[:, 1, None, None]); dy = np.minimum(dy, N - dy) / squash
        d = np.sqrt(dx * dx + dy * dy)
        order = np.argsort(d, axis=0)
        d1 = np.take_along_axis(d, order[0:1], 0)[0]; d2 = np.take_along_axis(d, order[1:2], 0)[0]
        return d1, d2, order[0], k

    # ---------------------------------------------------------------- colour
    @staticmethod
    def ramp(t, stops):
        cols = np.stack([rgb(h) for h in stops]); n = len(stops) - 1
        x = np.clip(t, 0, 1) * n; i = np.clip(np.floor(x).astype(int), 0, n - 1); f = (x - i)[..., None]
        return cols[i] * (1 - f) + cols[i + 1] * f

    @staticmethod
    def bands(t, k, soft=0.18):
        """Soft posterize: flat bands of paint with gentle edges."""
        q = t * k; i = np.floor(q); f = q - i
        return np.clip((i + smoothstep(0.5 - soft, 0.5 + soft, f)) / k, 0, 1)

    # ---------------------------------------------------------------- brushwork (drawn at size S)
    def layer(self):
        return Image.new('RGBA', (S, S), (0, 0, 0, 0))

    def _wrap(self, draw_fn, pts):
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        for ox in (-S, 0, S):
            if max(xs) + ox < 0 or min(xs) + ox > S: continue
            for oy in (-S, 0, S):
                if max(ys) + oy < 0 or min(ys) + oy > S: continue
                draw_fn([(x + ox, y + oy) for x, y in pts])

    def blades(self, lay, n, length, width, angle, jitter, colors, bend=0.25):
        """Tapered strokes (grass blades, reeds, leaves). angle in degrees, 0 = right, -90 = up."""
        d = ImageDraw.Draw(lay); r = self.rng
        for _ in range(n):
            x, y = r.uniform(0, S, 2); L = r.uniform(*length); W = r.uniform(*width)
            a = math.radians(angle + r.uniform(-jitter, jitter)); c = colors[r.integers(len(colors))]
            ux, uy = math.cos(a), math.sin(a); px, py = -uy, ux; b = r.uniform(-bend, bend) * L
            mx, my = x + ux * L * 0.55 + px * b * 0.5, y + uy * L * 0.55 + py * b * 0.5
            tip = (x + ux * L + px * b, y + uy * L + py * b)
            poly = [(x + px * W / 2, y + py * W / 2), (mx + px * W * 0.28, my + py * W * 0.28), tip, (mx - px * W * 0.28, my - py * W * 0.28), (x - px * W / 2, y - py * W / 2)]
            self._wrap(lambda q: d.polygon(q, fill=c), poly)

    def dabs(self, lay, n, size, colors, squash=0.8):
        """Round paint dabs (flowers, ash, spores, moss)."""
        d = ImageDraw.Draw(lay); r = self.rng
        for _ in range(n):
            x, y = r.uniform(0, S, 2); s = r.uniform(*size); c = colors[r.integers(len(colors))]
            self._wrap(lambda q: d.ellipse([q[0], q[1]], fill=c), [(x - s, y - s * squash), (x + s, y + s * squash)])

    def stones(self, lay, n, size, base, light, dark):
        """Pebbles: a soft shadow below right, the stone, a highlight above left."""
        d = ImageDraw.Draw(lay); r = self.rng
        for _ in range(n):
            x, y = r.uniform(0, S, 2); s = r.uniform(*size); sq = r.uniform(0.55, 0.85)
            for (ox, oy, k, c) in ((s * 0.25, s * 0.3, 1.05, dark), (0, 0, 1.0, base), (-s * 0.22, -s * 0.25, 0.5, light)):
                w, h = s * k, s * k * sq
                self._wrap(lambda q: d.ellipse([q[0], q[1]], fill=c), [(x + ox - w, y + oy - h), (x + ox + w, y + oy + h)])

    @staticmethod
    def finish(base_rgb, layers, soften=1):
        img = Image.fromarray(np.clip(base_rgb, 0, 255).astype(np.uint8)).resize((S, S), Image.BICUBIC).convert('RGBA')
        for lay in layers: img = Image.alpha_composite(img, lay)
        img = img.convert('RGB').resize((N, N), Image.LANCZOS)
        for _ in range(soften): img = img.filter(ImageFilter.SMOOTH)
        return img


A = lambda h, a: ((h >> 16) & 255, (h >> 8) & 255, h & 255, a)


# ---------------------------------------------------------------- the surfaces
def meadow(p):
    t = 0.65 * p.noise(2.7) + 0.35 * p.noise(1.8, hi=45)
    col = p.ramp(p.bands(t, 4), [0x3f7e32, 0x529a3e, 0x6db54e, 0x8ccb5f])
    shade = smoothstep(0.45, 0.85, p.noise(2.8))[..., None]; col = col * (1 - 0.1 * shade)
    lay = p.layer()
    p.blades(lay, 1500, (22, 44), (5, 9), -90, 24, [A(0x3a7330, 150), A(0x2f6328, 120)])
    p.blades(lay, 1700, (20, 40), (4, 8), -90, 22, [A(0x5ea845, 170), A(0x74bb52, 170)])
    p.blades(lay, 900, (16, 32), (3, 6), -90, 20, [A(0x9ad466, 190), A(0xb4df74, 160)])
    top = p.layer()
    p.dabs(top, 26, (3, 5), [A(0xf4f0e0, 230), A(0xf2d24a, 230), A(0xf0a0c0, 220)])
    return p.finish(col, [lay, top])


def ember(p):
    t = 0.6 * p.noise(2.5) + 0.4 * p.noise(1.7, hi=60)
    col = p.ramp(p.bands(t, 4), [0x3a2420, 0x4c302a, 0x64402f, 0x7e5238])
    d1, d2, cell, k = p.voronoi(30, warp=70)
    plate = p.rng.uniform(-0.09, 0.09, k).astype(np.float32)[cell][..., None]; col = col * (1 + plate)
    crack = 1 - smoothstep(0.8, 2.6, d2 - d1)
    glow = crack * smoothstep(0.72, 0.85, p.noise(2.4))
    col = col * (1 - 0.65 * crack[..., None]) + rgb(0xc8582a) * (0.35 * glow[..., None])
    lay = p.layer()
    p.stones(lay, 140, (6, 13), A(0x3a2a26, 255), A(0x6a5048, 200), A(0x1e1416, 140))
    p.dabs(lay, 380, (1.5, 3), [A(0x9a8a80, 130), A(0xb8a89a, 100)])
    return p.finish(col, [lay])


def tide(p):
    t = 0.55 * p.noise(2.6) + 0.45 * p.noise(1.9, hi=50)
    col = p.ramp(p.bands(t, 4), [0x3f7a70, 0x568f84, 0x73ab98, 0x98c6b0])
    sheen = smoothstep(0.7, 0.9, p.noise(2.2, stretch=(1.0, 5.0)))[..., None]
    col = col * (1 - 0.25 * sheen) + rgb(0xd2ecdc) * (0.25 * sheen)
    lay = p.layer()
    p.blades(lay, 520, (34, 64), (3, 6), -90, 10, [A(0x3f6e5e, 170), A(0x2f5c4e, 150)], bend=0.12)
    p.blades(lay, 380, (30, 56), (3, 5), -90, 10, [A(0x7fb09a, 170), A(0xa3cbb4, 140)], bend=0.12)
    p.stones(lay, 22, (6, 11), A(0xe6dcae, 230), A(0xfff6d8, 210), A(0x4a6a60, 110))
    return p.finish(col, [lay])


def storm(p):
    d1, d2, cell, k = p.voronoi(30, warp=24)
    v = p.rng.uniform(0, 1, k).astype(np.float32)[cell]
    t = 0.55 * v + 0.3 * p.noise(2.4) + 0.15 * p.noise(1.4, hi=90, stretch=(1.0, 3.0))
    col = p.ramp(p.bands(t, 5, 0.12), [0x56606e, 0x6a7686, 0x808c9c, 0x9aa6b4])
    edge = 1 - smoothstep(1.2, 4.0, d2 - d1); col = col * (1 - 0.45 * edge[..., None])
    lay = p.layer()
    p.blades(lay, 700, (12, 24), (3, 5), -90, 35, [A(0x7f8c78, 170), A(0xa3ad96, 160)])   # tough mountain grass
    p.stones(lay, 70, (5, 10), A(0x7a8694, 255), A(0xb8c2cc, 200), A(0x3a424c, 130))
    return p.finish(col, [lay])


def gloam(p):
    t = 0.6 * p.noise(2.6) + 0.4 * p.noise(1.8, hi=50)
    col = p.ramp(p.bands(t, 4), [0x1f1a33, 0x2a2446, 0x372e5a, 0x463b72])
    moss = smoothstep(0.55, 0.8, p.noise(2.7))[..., None] * 0.8
    col = col * (1 - moss) + p.ramp(p.noise(1.6, hi=80), [0x3f3f78, 0x4f4f90, 0x6060a8]) * moss
    lay = p.layer()
    p.blades(lay, 900, (12, 22), (6, 11), 0, 180, [A(0x4a3a78, 200), A(0x5e4a90, 190), A(0x221c3a, 170)], bend=0.4)
    glow = p.layer()
    p.dabs(glow, 40, (5, 8), [A(0x8a70d0, 60)]); p.dabs(glow, 40, (1.5, 3), [A(0xd8c8ff, 230)])
    return p.finish(col, [lay, glow])


def cliff(p):
    t = 0.5 * p.noise(2.4, stretch=(6.0, 1.0)) + 0.3 * p.noise(2.0) + 0.2 * p.noise(1.5, hi=80)
    col = p.ramp(p.bands(t, 4), [0x5a554e, 0x726c64, 0x8c867c, 0xa69f94])
    d1, d2, cell, k = p.voronoi(24, squash=0.45, warp=40)
    plate = p.rng.uniform(-0.08, 0.08, k).astype(np.float32)[cell][..., None]; col = col * (1 + plate)
    edge = 1 - smoothstep(1.0, 3.6, d2 - d1); col = col * (1 - 0.5 * edge[..., None])
    lay = p.layer()
    p.blades(lay, 500, (18, 40), (3, 5), 0, 8, [A(0xb8b2a6, 120), A(0x45403a, 110)], bend=0.05)
    return p.finish(col, [lay])


SURFACES = {'meadow': meadow, 'ember': ember, 'tide': tide, 'storm': storm, 'gloam': gloam, 'cliff': cliff}
# the variant used for each surface (chosen by comparing the preview sheets)
CHOSEN = {'meadow': 1, 'ember': 2, 'tide': 1, 'storm': 2, 'gloam': 1, 'cliff': 2}


def paint(name, variant):
    return SURFACES[name](Painter(1000 * (list(SURFACES).index(name) + 1) + variant))


def sheet(images, path, cell=384):
    """A contact sheet: each texture tiled 2 x 2 (to show the seams), one row per surface."""
    rows, cols = len(images), max(len(r) for r in images)
    out = Image.new('RGB', (cols * cell, rows * cell), (20, 20, 24))
    for j, row in enumerate(images):
        for i, im in enumerate(row):
            h = cell // 2; small = im.resize((h, h), Image.LANCZOS)
            for ox in (0, h):
                for oy in (0, h): out.paste(small, (i * cell + ox, j * cell + oy))
    out.save(path)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--preview'); ap.add_argument('--variants', type=int, default=3)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    for name in SURFACES:
        paint(name, CHOSEN[name]).save(os.path.join(OUT, name + '.jpg'), quality=90)
        print('wrote', name)
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        rows = [[paint(n, v) for v in range(1, a.variants + 1)] for n in SURFACES]
        sheet(rows[:3], os.path.join(a.preview, 'sheet_a.png')); sheet(rows[3:], os.path.join(a.preview, 'sheet_b.png'))
        print('sheets in', a.preview)
