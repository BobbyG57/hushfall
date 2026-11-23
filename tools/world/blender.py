"""Hushfall's world, to Blender and back.

Run by Blender (the two .command files in blender/ do this for you):

  Blender --background --factory-startup --python-exit-code 1 --python tools/world/blender.py -- send
  Blender --background --factory-startup --python-exit-code 1 --python tools/world/blender.py -- bring

send   Makes blender/world.blend from the game's world, or refreshes it:
         Terrain   the valley as five meshes, one per zone, each in its own collection. 1 Blender
                   unit = 1 game unit, coloured by region (roads tan, rock grey, snow white).
                   Blender X = game x, Blender Y = north (game -z), Blender Z = height.
         Places    an arrow for every waystone, shrine, camp, grove and rift in src/data.js (for
                   reference: moving them here does not move them in the game).
         Kit       a shelf of building pieces north of the map. Made once, then yours to change.
         Placed    your copies of Kit pieces, set out on the terrain.
       If world.blend already exists, only Terrain and Places are refreshed, and only when no
       zone has sculpting that still needs bringing into the game.
bring  Reads blender/world.blend back: what you changed in the zones becomes
       assets/world/sculpt.bin (the difference from the generated land), every Kit piece is saved
       as assets/models/kit/<name>.glb, and Placed is listed in assets/world/placed.json. Then run tools/world/make_world.py, which
       lays the sculpting over the land and checks every place can still be reached.
"""
import bpy, bmesh, json, math, os, re, sys
import numpy as np
from mathutils import Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORLD = os.path.join(ROOT, 'assets', 'world')
KITDIR = os.path.join(ROOT, 'assets', 'models', 'kit')
BLEND = os.path.join(ROOT, 'blender', 'world.blend')
BROUGHT = os.path.join(ROOT, 'blender', 'world.brought')   # fingerprints of the zones last brought into the game
HALF = 320.0


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


# ---------------------------------------------------------------- the terrain
def terrain_colours(H, roads, regions, CELL):
    base = np.array([[96, 160, 78], [122, 84, 70], [100, 84, 146], [104, 172, 146], [122, 134, 150]], float) / 255
    c = base[regions]
    gy, gx = np.gradient(H, CELL); s = np.hypot(gx, gy)
    k = np.clip((s - 0.7) / 0.5, 0, 1)[..., None]; c = c * (1 - k) + np.array([0.46, 0.44, 0.42]) * k
    k = np.clip((H - 46) / 16, 0, 1)[..., None]; c = c * (1 - k) + 0.95 * k
    k = (roads / 255.0)[..., None] * 0.8; c = c * (1 - k) + np.array([0.82, 0.70, 0.48]) * k
    c = np.where((H < 0)[..., None], [0.25, 0.52, 0.82], c)
    c = c ** 2.2   # to linear
    return np.concatenate([c, np.ones(c.shape[:2] + (1,))], -1).astype(np.float32)


# the five zones, each its own object in its own collection (Blender colour tags)
ZONES = [(0, 'meadow', 'Lanternrest Meadow', 'COLOR_04'), (1, 'ember', 'Emberridge', 'COLOR_01'), (2, 'gloam', 'Gloamwood', 'COLOR_06'),
         (3, 'tide', 'Mirrormere', 'COLOR_05'), (4, 'storm', 'Stormreach', 'COLOR_03')]


def terrain_material():
    mat = bpy.data.materials.get('Terrain') or bpy.data.materials.new('Terrain'); nodes_on(mat)
    nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = next((n for n in nt.nodes if n.type == 'VERTEX_COLOR'), None) or nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Region'; nt.links.new(attr.outputs[0], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 1.0
    mat.diffuse_color = (0.35, 0.55, 0.3, 1)
    return mat


def make_zones(N, NV, CELL, H, roads, regions, parent):
    """One mesh per zone. Each square of the grid goes to the zone it lies in, and the points along a
    border are shared, so the zones meet without gaps. Every point remembers where it is on the game's
    grid (gid) and the height it was sent with (sent), so only what you change comes back."""
    xs = -HALF + np.arange(NV) * CELL; X, Z = np.meshgrid(xs, xs)
    CO = np.stack([X, -Z, H], -1).reshape(-1, 3).astype(np.float32)
    RGBA = terrain_colours(H, roads, regions, CELL).reshape(-1, 4)
    jj, ii = np.meshgrid(np.arange(N), np.arange(N), indexing='ij'); a = (jj * NV + ii).ravel()
    quads = np.stack([a, a + NV, a + NV + 1, a + 1], -1); lab = regions[:N, :N].ravel()
    mat = terrain_material(); out = []
    for k, _, name, tag in ZONES:
        q = quads[lab == k]
        if not len(q): continue
        used = np.unique(q); loc = np.searchsorted(used, q).ravel().astype(np.int32)
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(used)); me.vertices.foreach_set('co', CO[used].ravel())
        me.loops.add(len(loc)); me.loops.foreach_set('vertex_index', loc)
        me.polygons.add(len(q)); me.polygons.foreach_set('loop_start', np.arange(0, len(loc), 4, dtype=np.int32))
        me.update(calc_edges=True); me.validate()
        me.color_attributes.new('Region', 'BYTE_COLOR', 'POINT').data.foreach_set('color', RGBA[used].ravel())
        me.attributes.new('gid', 'INT', 'POINT').data.foreach_set('value', used.astype(np.int32))
        me.attributes.new('sent', 'FLOAT', 'POINT').data.foreach_set('value', CO[used, 2])
        me.materials.append(mat)
        c = coll(name, parent); c.color_tag = tag
        o = bpy.data.objects.new(name, me); c.objects.link(o); o['sent'] = fingerprint(o); out.append(o)
    return out


def terrain_objects():
    tc = bpy.data.collections.get('Terrain')
    return sorted((o for o in tc.all_objects if o.type == 'MESH'), key=lambda o: o.name) if tc else []


def read_terrain(objs, H, NV, CELL):
    """Your sculpting, laid onto the game's grid: the new height wherever a zone was changed (where two
    zones share a border point and both changed it, their average), and the game's height elsewhere."""
    flat = H.ravel(); acc = np.zeros(NV * NV); cnt = np.zeros(NV * NV); notes = []
    for o in objs:
        me = o.data; n = len(me.vertices); co = np.zeros(n * 3, np.float32); me.vertices.foreach_get('co', co)
        M = np.array(o.matrix_world); co = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
        gid = me.attributes.get('gid'); sent = me.attributes.get('sent')
        if gid is not None and len(gid.data) == n:
            g = np.zeros(n, np.int32); gid.data.foreach_get('value', g)
            base = flat[g]
            if sent is not None: base = np.zeros(n, np.float32); sent.data.foreach_get('value', base)
            ch = np.abs(co[:, 2] - base) > 0.02
            np.add.at(acc, g[ch], co[ch, 2]); np.add.at(cnt, g[ch], 1)
        elif n == NV * NV:      # a whole-valley mesh, as older files had
            ch = np.abs(co[:, 2] - flat) > 0.02; acc[ch] += co[ch, 2]; cnt[ch] += 1
        else:                   # remeshed: look straight down onto it at every grid point it covers
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
            notes.append(o.name + ' was remeshed, so it was read by looking down onto it')
    out = flat.copy(); m = cnt > 0; out[m] = acc[m] / cnt[m]
    return out.reshape(NV, NV), notes


# ---------------------------------------------------------------- places from data.js
def places():
    import subprocess
    node = next((p for p in ('/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node') if os.path.exists(p)), 'node')
    try: return json.loads(subprocess.check_output([node, os.path.join(ROOT, 'tools', 'world', 'points.mjs')], cwd=ROOT))
    except Exception as e: print('  (could not read the places from src/data.js: %s)' % e); return None


def make_places(P, H, regions, CELL, col):
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
        o = bpy.data.objects.new(name, None); o.empty_display_type = 'SINGLE_ARROW'; o.empty_display_size = 6
        o.location = (p['x'], -p['z'], h(p['x'], p['z'])); o.show_name = True; o.show_in_front = True
        i = min(max(int(round((p['x'] + HALF) / CELL)), 0), H.shape[0] - 1); j = min(max(int(round((p['z'] + HALF) / CELL)), 0), H.shape[0] - 1)
        coll(ZONES[int(regions[j, i])][2] + ' places', col).objects.link(o)


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

    def done(self, col, at, solid=True):
        me = bpy.data.meshes.new(self.name); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for m in self.mats: me.materials.append(m)
        o = bpy.data.objects.new(self.name, me); o.location = at; o.show_name = True; o['solid'] = 1 if solid else 0
        col.objects.link(o); return o


def shelf_spot(k):
    """Where the k-th piece stands on the shelf, just north of the map."""
    return (-63 + (k % 8) * 18, 352 + (k // 8) * 20, 0)


def make_shelf():
    sc = coll('Shelf'); me = bpy.data.meshes.new('Shelf'); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
    m = bpy.data.materials.new('Shelf'); nodes_on(m); b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (0.08, 0.08, 0.09, 1); m.diffuse_color = (0.08, 0.08, 0.09, 1); me.materials.append(m)
    o = bpy.data.objects.new('Shelf', me); o.location = (-0.0, 362, -0.3); o.scale = (160, 46, 0.5); o.hide_select = True; sc.objects.link(o)


def make_kit(col):
    WALL, PLASTER, ROOF, WOOD, DARK, STONE, SLATE, GLOW = 0xe6dac0, 0xf1e9d6, 0xa5482e, 0x7a5434, 0x4e3624, 0xa8a296, 0x56606e, 0xffd98a
    out = []; spot = shelf_spot
    p = Piece('cottage')
    p.box(6, 5, 3.2, mat=kmat(PLASTER)).box(6.2, 5.2, 0.5, mat=kmat(STONE))
    p.roof(7, 5.8, 2.6, z=3.2, mat=kmat(ROOF), rot=math.pi / 2)
    p.box(1.2, 0.2, 2.1, y=-2.55, mat=kmat(DARK)).box(1.0, 0.15, 0.9, x=-1.9, y=-2.53, z=1.3, mat=kmat(GLOW, True)).box(1.0, 0.15, 0.9, x=1.9, y=-2.53, z=1.3, mat=kmat(GLOW, True))
    p.box(0.9, 0.9, 2.4, x=1.8, y=1.2, z=3.6, mat=kmat(STONE))
    out.append(p.done(col, spot(0)))
    p = Piece('chapel')
    p.box(5.5, 10, 4.6, y=1.5, mat=kmat(0xdcd5c6)).roof(6.4, 10.6, 3, y=1.5, z=4.6, mat=kmat(SLATE))
    p.box(3, 3, 8.5, y=-4.2, mat=kmat(0xd0c8b8)).cyl(2.2, 4.5, y=-4.2, z=8.5, mat=kmat(SLATE), segs=4, r2=0.0, rot=math.pi / 4)
    p.box(1.4, 0.3, 2.6, y=-5.75, mat=kmat(DARK)).box(1.2, 0.3, 1.2, y=-5.75, z=5.6, mat=kmat(GLOW, True))
    for k in range(3): p.box(0.25, 0.8, 1.6, x=2.8, y=-0.6 + k * 2.4, z=1.8, mat=kmat(0x8fb4e0, True)).box(0.25, 0.8, 1.6, x=-2.8, y=-0.6 + k * 2.4, z=1.8, mat=kmat(0x8fb4e0, True))
    p.box(0.25, 0.25, 1.6, y=-4.2, z=13, mat=kmat(0xd8b050)).box(1.0, 0.25, 0.25, y=-4.2, z=13.9, mat=kmat(0xd8b050))
    out.append(p.done(col, spot(1)))
    p = Piece('gravestone')
    # a slab with a rounded top (a short cylinder turned on its side)
    p.box(0.8, 0.22, 0.9, mat=kmat(0x9c9c98)).cyl(0.4, 0.22, y=0.11, z=0.9, mat=kmat(0x9c9c98), segs=12, tilt=math.pi / 2).box(1.0, 0.5, 0.12, mat=kmat(0x7f7f7a))
    out.append(p.done(col, spot(2)))
    p = Piece('grave_cross')
    p.box(0.22, 0.22, 1.6, mat=kmat(0xb8b4ac)).box(0.9, 0.22, 0.22, z=1.05, mat=kmat(0xb8b4ac)).box(0.7, 1.6, 0.15, y=0.9, mat=kmat(0x6b8a4a))
    out.append(p.done(col, spot(3)))
    p = Piece('fence')
    for x in (-2, 0, 2): p.box(0.22, 0.22, 1.3, x=x, mat=kmat(WOOD))
    p.box(4.3, 0.12, 0.16, z=0.5, mat=kmat(0x9a7046)).box(4.3, 0.12, 0.16, z=1.0, mat=kmat(0x9a7046))
    out.append(p.done(col, spot(4)))
    p = Piece('field')
    p.box(10, 8, 0.12, mat=kmat(0x6e4c30))
    for k in range(7):
        y = -3.3 + k * 1.1; p.box(9.4, 0.5, 0.22, y=y, mat=kmat(0x5c3e26))
        for s in range(9): p.cyl(0.22, 0.7 + ((k * 7 + s * 3) % 5) * 0.12, x=-4 + s, y=y, z=0.2, mat=kmat(0x74b043 if k % 3 else 0x9cc24a), segs=4, r2=0.04)
    out.append(p.done(col, spot(5), solid=False))
    p = Piece('wheat')
    p.box(10, 8, 0.12, mat=kmat(0x7a5a36))
    for k in range(8):
        for s in range(10): p.box(0.7, 0.7, 1.1 + ((k * 5 + s * 3) % 4) * 0.12, x=-4.5 + s, y=-3.5 + k, z=0.1, mat=kmat(0xe0c060 if (k + s) % 3 else 0xcfa94a), rot=(k * s) % 3 * 0.3)
    out.append(p.done(col, spot(6), solid=False))
    p = Piece('haystack')
    p.cyl(1.3, 1.4, mat=kmat(0xd8b85a), segs=8).cyl(1.3, 1.2, z=1.4, mat=kmat(0xe6c86a), segs=8, r2=0.2)
    out.append(p.done(col, spot(7)))
    p = Piece('signpost')
    p.box(0.25, 0.25, 2.8, mat=kmat(WOOD)).box(1.8, 0.12, 0.45, x=0.75, z=2.1, mat=kmat(0xb88a56)).box(1.6, 0.12, 0.45, x=-0.6, z=1.5, mat=kmat(0xb88a56), rot=0.35)
    out.append(p.done(col, spot(8)))
    p = Piece('watchtower')
    for sx in (-1.6, 1.6):
        for sy in (-1.6, 1.6): p.box(0.45, 0.45, 7.4, x=sx, y=sy, mat=kmat(DARK))
    p.box(4.4, 4.4, 0.4, z=6.6, mat=kmat(WOOD))
    for k in (-2.1, 2.1): p.box(4.4, 0.15, 1.0, y=k, z=7.0, mat=kmat(0x9a7046)).box(0.15, 4.4, 1.0, x=k, z=7.0, mat=kmat(0x9a7046))
    for sx in (-1.9, 1.9):
        for sy in (-1.9, 1.9): p.box(0.25, 0.25, 2.4, x=sx, y=sy, z=7.0, mat=kmat(DARK))
    p.cyl(3.6, 2.2, z=9.4, mat=kmat(ROOF), segs=4, r2=0.0, rot=math.pi / 4)
    p.box(0.6, 3.0, 0.15, x=0, y=-2.6, z=0.2, mat=kmat(0x9a7046), tilt=-1.1)
    out.append(p.done(col, spot(9)))
    p = Piece('ruin_wall')
    for k, hh in enumerate((2.6, 3.4, 1.8, 2.9, 1.2, 2.2)): p.box(1.05, 1.1, hh, x=-2.6 + k * 1.05, mat=kmat(STONE if k % 2 else 0x989284))
    p.box(1.0, 0.9, 0.7, x=1.6, y=-1.2, mat=kmat(0x8c877b), rot=0.4).box(0.7, 0.6, 0.5, x=-1.2, y=1.1, mat=kmat(0x8c877b), rot=0.8)
    out.append(p.done(col, spot(10)))
    p = Piece('stilt_hut')
    for sx in (-1.8, 1.8):
        for sy in (-1.8, 1.8): p.box(0.3, 0.3, 2.4, x=sx, y=sy, mat=kmat(0xcfc6a8))
    p.box(4.6, 4.6, 0.3, z=2.2, mat=kmat(0xb89a6a)).box(3.4, 3.4, 2.2, z=2.5, mat=kmat(0xe8dcbc))
    p.cyl(3.2, 2.0, z=4.7, mat=kmat(0xc8a860), segs=6, r2=0.0).box(1.0, 0.15, 1.6, y=-1.72, z=2.5, mat=kmat(DARK))
    out.append(p.done(col, spot(11)))
    p = Piece('crag')
    p.rock(4.0, mat=kmat(0x8b9088), seed=3, sz=1.4).rock(2.2, x=1.8, y=0.9, mat=kmat(0x7d827a), seed=5, sz=1.2).rock(1.6, x=-1.6, y=-1.1, mat=kmat(0x969b92), seed=8)
    out.append(p.done(col, spot(12)))
    p = Piece('well')
    p.cyl(1.2, 0.9, mat=kmat(STONE), segs=10).cyl(0.95, 0.05, z=0.9, mat=kmat(0x3a6a8a), segs=10)
    p.box(0.2, 0.2, 2.4, x=-1.0, mat=kmat(WOOD)).box(0.2, 0.2, 2.4, x=1.0, mat=kmat(WOOD)).roof(2.8, 1.8, 0.9, z=2.4, mat=kmat(ROOF), rot=math.pi / 2)
    out.append(p.done(col, spot(13)))
    p = Piece('lamp_post')
    p.box(0.2, 0.2, 3.0, mat=kmat(0x3a3a3a)).box(0.9, 0.15, 0.15, x=0.35, z=2.9, mat=kmat(0x3a3a3a)).box(0.45, 0.45, 0.6, x=0.75, z=2.3, mat=kmat(GLOW, True))
    out.append(p.done(col, spot(14)))
    p = Piece('cart')
    p.box(2.2, 3.4, 0.7, z=0.9, mat=kmat(0x9a7046)).box(2.2, 0.15, 0.6, y=1.62, z=1.6, mat=kmat(0x9a7046)).box(0.15, 3.4, 0.6, x=1.03, z=1.6, mat=kmat(0x9a7046)).box(0.15, 3.4, 0.6, x=-1.03, z=1.6, mat=kmat(0x9a7046))
    p.cyl(0.7, 0.2, x=-1.1, z=0.7, mat=kmat(DARK), segs=10, tilt=math.pi / 2, rot=math.pi / 2).cyl(0.7, 0.2, x=1.3, z=0.7, mat=kmat(DARK), segs=10, tilt=math.pi / 2, rot=math.pi / 2)
    p.box(0.15, 2.4, 0.15, x=0.5, y=-2.6, z=0.9, mat=kmat(WOOD)).box(0.15, 2.4, 0.15, x=-0.5, y=-2.6, z=0.9, mat=kmat(WOOD))
    out.append(p.done(col, spot(15)))
    return out


def kit_names(col):
    return {o.name: o for o in col.objects if o.type == 'MESH'}


def base_name(n):
    return n.rsplit('.', 1)[0] if '.' in n and n.rsplit('.', 1)[1].isdigit() else n


# ---------------------------------------------------------------- send
def send():
    N, NV, CELL, H, roads, regions, sc = grid()
    fresh = not os.path.exists(BLEND)
    if not fresh:
        bpy.ops.wm.open_mainfile(filepath=BLEND)
        try: brought = json.load(open(BROUGHT))
        except Exception: brought = {}
        objs = terrain_objects()
        busy = [o.name for o in objs if fingerprint(o) not in (o.get('sent', ''), brought.get(o.name, ''))]
        if busy:
            print('\nSculpting in %s is not in the game yet, so the terrain was left as it is.' % ', '.join(busy))
            print('Bring it into the game first (blender/Bring world into game.command), or delete blender/world.blend to start over.\n')
            return
        for o in objs: me = o.data; bpy.data.objects.remove(o); bpy.data.meshes.remove(me)
        pc = bpy.data.collections.get('Places')
        if pc:
            for o in list(pc.all_objects): bpy.data.objects.remove(o)
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    sc_ = bpy.context.scene; sc_.unit_settings.system = 'METRIC'
    make_zones(N, NV, CELL, H, roads, regions, coll('Terrain'))
    make_places(places(), H, regions, CELL, coll('Places'))
    if fresh:
        wc = coll('Water'); wp = bpy.data.meshes.new('Water'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=HALF); bm.to_mesh(wp); bm.free()
        wm = bpy.data.materials.new('Water'); nodes_on(wm); b = next(n for n in wm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = (0.1, 0.4, 0.75, 1); b.inputs['Alpha'].default_value = 0.55; wm.diffuse_color = (0.1, 0.4, 0.75, 0.5)
        try: wm.surface_render_method = 'BLENDED'
        except Exception: pass
        wp.materials.append(wm); w = bpy.data.objects.new('Water', wp); w.hide_select = True; wc.objects.link(w)
        make_shelf(); kc = coll('Kit'); pieces = make_kit(kc)
        known = {o.name for o in pieces}
        # pieces you made earlier come back from their saved models
        if os.path.isdir(KITDIR):
            for f in sorted(os.listdir(KITDIR)):
                if f.endswith('.glb') and f[:-4] not in known: import_piece(f[:-4], kc, len(known)); known.add(f[:-4])
        pc = coll('Placed'); restore_placed(pc, kit_names(kc))
        cam_setup()
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True, relative_remap=True)
    print('\nWrote blender/world.blend (%s).\n' % ('new' if fresh else 'terrain and places refreshed'))


def import_piece(name, kc, k):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(KITDIR, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]; meshes = [o for o in new if o.type == 'MESH']
    if not meshes: return
    keep = meshes[0]
    if len(meshes) > 1:
        with bpy.context.temp_override(active_object=keep, selected_editable_objects=meshes): bpy.ops.object.join()
    keep.parent = None; keep.matrix_world = Matrix.Translation(shelf_spot(k))
    keep.name = name; keep.data.name = name; keep.show_name = True
    info = json.load(open(os.path.join(WORLD, 'placed.json'))).get('kit', {}).get(name, {}) if os.path.exists(os.path.join(WORLD, 'placed.json')) else {}
    keep['solid'] = info.get('solid', 1)
    for c in list(keep.users_collection): c.objects.unlink(keep)
    kc.objects.link(keep)
    for o in new:
        if o != keep and o.name in bpy.data.objects: bpy.data.objects.remove(o)


def restore_placed(pc, kit):
    path = os.path.join(WORLD, 'placed.json')
    if not os.path.exists(path): return
    from mathutils import Quaternion, Vector
    _, NV, CELL, H, *_ = grid()
    for p in json.load(open(path)).get('placed', []):
        src = kit.get(p['kit'])
        if not src: continue
        o = bpy.data.objects.new(p['kit'], src.data)   # a linked copy: it shares the piece's mesh
        x, z = p['x'], p['z']; i = int(round((x + HALF) / CELL)); j = int(round((z + HALF) / CELL))
        qx, qy, qz, qw = p.get('q', [0, 0, 0, 1]); sx, sy, sz = p.get('s', [1, 1, 1])
        o.location = (x, -z, float(H[min(max(j, 0), NV - 1), min(max(i, 0), NV - 1)]) + p.get('lift', 0))
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Quaternion((qw, qx, -qz, qy)); o.scale = (sx, sz, sy)
        pc.objects.link(o)


def cam_setup():
    for scr in bpy.data.screens:
        for a in scr.areas:
            if a.type != 'VIEW_3D': continue
            for s in a.spaces:
                if s.type != 'VIEW_3D': continue
                s.shading.type = 'MATERIAL'; s.clip_end = 4000; s.clip_start = 0.1
                r = s.region_3d; r.view_distance = 520; r.view_location = (0, 0, 0)


# ---------------------------------------------------------------- bring
def bring():
    if not os.path.exists(BLEND): sys.exit('There is no blender/world.blend yet: send the world to Blender first.')
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    N, NV, CELL, H, roads, regions, sc = grid()
    objs = terrain_objects()
    if not objs: sys.exit('blender/world.blend has no terrain in its Terrain collection.')
    hs, notes = read_terrain(objs, H, NV, CELL)
    json.dump({o.name: fingerprint(o) for o in objs}, open(BROUGHT, 'w'))
    gen = H - sc                                   # the land as generated, before any sculpting
    d = (hs - gen).astype(np.float32); d[np.abs(d) < 0.02] = 0
    sp = os.path.join(WORLD, 'sculpt.bin')
    if d.any(): d.astype('<f4').tofile(sp)
    elif os.path.exists(sp): os.remove(sp)        # nothing sculpted: no layer
    print('Terrain: %d spots sculpted (biggest change %.1f)' % (int((d != 0).sum()), float(np.abs(d).max())))
    for n_ in notes: print('  ' + n_)
    # what counts: anything standing off the map (on the shelf, north of it) is a piece of the kit, and
    # anything on the map is placed. The collections only keep things tidy.
    land = set(terrain_objects())
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in land and not any(c.name in ('Water', 'Shelf') for c in o.users_collection)]
    off = lambda o: max(abs(o.matrix_world.translation.x), abs(o.matrix_world.translation.y)) > HALF + 2
    kit = {}
    for o in sorted((o for o in objs if off(o)), key=lambda o: (o.name != base_name(o.name), o.name)):
        kit.setdefault(re.sub(r'[^A-Za-z0-9_-]+', '_', base_name(o.name)), o)
    os.makedirs(KITDIR, exist_ok=True); info = {}
    for name, o in kit.items():
        keep = o.matrix_world.copy(); o.matrix_world = Matrix.Identity(4)
        for x in bpy.context.view_layer.objects: x.select_set(False)
        try:
            o.select_set(True); bpy.context.view_layer.objects.active = o
            bpy.ops.export_scene.gltf(filepath=os.path.join(KITDIR, name + '.glb'), export_format='GLB', use_selection=True, export_apply=True, export_animations=False, export_yup=True)
        finally: o.matrix_world = keep
        info[name] = {'file': 'models/kit/%s.glb' % name, 'solid': int(o.get('solid', 1))}
    # what you set out on the terrain
    placed = []; skipped = []
    byMesh = {o.data.name: n for n, o in kit.items()}; byName = {base_name(o.name): n for n, o in kit.items()}
    for o in objs:
        if off(o): continue
        k = byMesh.get(o.data.name) or byName.get(base_name(o.data.name)) or byName.get(base_name(o.name))
        if not k: skipped.append(o.name); continue
        loc, q, s = o.matrix_world.decompose(); x, z = loc.x, -loc.y
        i = int(round((x + HALF) / CELL)); j = int(round((z + HALF) / CELL)); gh = float(hs[min(max(j, 0), NV - 1), min(max(i, 0), NV - 1)])
        placed.append({'kit': k, 'x': round(x, 3), 'z': round(z, 3), 'lift': round(loc.z - gh, 3),
                       'q': [round(q.x, 5), round(q.z, 5), round(-q.y, 5), round(q.w, 5)], 's': [round(s.x, 4), round(s.z, 4), round(s.y, 4)]})
    json.dump({'kit': info, 'placed': placed}, open(os.path.join(WORLD, 'placed.json'), 'w'), indent=1)
    print('Kit: %d pieces saved to assets/models/kit. Placed: %d pieces.' % (len(info), len(placed)))
    if skipped: print('  On the map but not a copy of a piece on the shelf, so left out:', ', '.join(skipped[:12]), '...' if len(skipped) > 12 else '')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    {'send': send, 'bring': bring}.get(args[0] if args else '', lambda: sys.exit('Say send or bring.'))()
