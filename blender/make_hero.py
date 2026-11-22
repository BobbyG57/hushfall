"""Builds the sample Hushfall hero in Blender and exports it for the game.

Run from the GameForFun folder (Blender does not need to be open):

  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/make_hero.py

It writes:
  blender/hero.blend       the editable source: open it in Blender to change the model or its moves
  assets/models/hero.glb   what the game loads (listed in assets/art.json)

Add  -- --preview /some/folder  at the end to also render a contact sheet of every animation.

The model faces Blender's front view (-Y), stands on the ground at the origin, and is about 2 m tall.
It is one mesh skinned to a small skeleton, with one action per game move (see CUSTOMIZE.md for the
names the game looks for). The sword's blade uses a material called "Blade", so it takes on the
element of your Kith in the game, and the empties BladeBase and BladeTip mark where the sword trail
is drawn.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GLB = os.path.join(ROOT, 'assets', 'models', 'hero.glb')
BLEND = os.path.join(HERE, 'hero.blend')
FPS = 30
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = ARGS[ARGS.index('--preview') + 1] if '--preview' in ARGS else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS


# ------------------------------------------------------------------ materials
def linear(hexv):
    c = [((hexv >> s) & 255) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


COLORS = {
    'Tunic': 0x2f4a7a, 'Sleeve': 0x27375f, 'Hood': 0x22325a, 'Skin': 0xf0cfa8, 'Eyes': 0x1a1a22,
    'Blush': 0xf09a8a, 'Hair': 0x6a3f24, 'Scarf': 0xd0412f, 'ScarfDark': 0xa32f27, 'Gold': 0xd9b45a,
    'Leather': 0x5a3a26, 'Glove': 0x6e4a30, 'Pants': 0x2a2f45, 'Boot': 0x4a3022, 'Grip': 0x3a3340,
    'Blade': 0xdfe8f5,
}
MI = {name: i for i, name in enumerate(COLORS)}
MATS = []
for name, hx in COLORS.items():
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = linear(hx)
    bsdf.inputs['Roughness'].default_value = 0.35 if name == 'Blade' else 0.85
    bsdf.inputs['Metallic'].default_value = 0.0
    m.diffuse_color = linear(hx)
    MATS.append(m)

# ------------------------------------------------------------------ skeleton (name, head, tail, parent)
BONES = [
    ('Root', (0, 0, 0.9), (0, 0, 1.0), None),          # pelvis: moves and turns the whole body
    ('Spine', (0, 0, 0.98), (0, 0, 1.4), 'Root'),
    ('Head', (0, 0, 1.42), (0, 0, 1.95), 'Spine'),
    ('ArmL', (0.37, 0, 1.34), (0.37, 0, 0.86), 'Spine'),
    ('ArmR', (-0.37, 0, 1.34), (-0.37, 0, 0.86), 'Spine'),
    ('Sword', (-0.37, 0, 0.87), (-0.37, -0.3, 0.87), 'ArmR'),
    ('LegL', (0.13, 0, 0.88), (0.13, 0, 0.1), 'Root'),
    ('LegR', (-0.13, 0, 0.88), (-0.13, 0, 0.1), 'Root'),
    ('Scarf', (0.06, 0.17, 1.44), (0.06, 0.62, 1.32), 'Spine'),
]
BI = {b[0]: i for i, b in enumerate(BONES)}

# ------------------------------------------------------------------ mesh: one bmesh, each part weighted to one bone
bm = bmesh.new()
DL = bm.verts.layers.deform.verify()
R8 = math.radians(22.5)   # turns 8-sided cylinders so a flat face points forward


def add(kind, bone, mat, size=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0), **kw):
    before = set(bm.verts)
    M = Matrix.Translation(loc) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1.0))
    if kind == 'box':
        r = bmesh.ops.create_cube(bm, size=1.0, matrix=M)
    elif kind == 'cyl':
        r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=kw.get('seg', 8),
                                  radius1=kw['r1'], radius2=kw['r2'], depth=kw['depth'], matrix=M)
    else:
        r = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.5, matrix=M)
    if kw.get('bevel'):
        edges = list({e for v in r['verts'] for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=edges, offset=kw['bevel'], segments=1, affect='EDGES', profile=0.5)
    new = [v for v in bm.verts if v not in before]
    for v in new:
        v[DL][BI[bone]] = 1.0
    for f in {f for v in new for f in v.link_faces}:
        f.material_index = MI[mat]
        f.smooth = False


for sx, b in ((1, 'LegL'), (-1, 'LegR')):
    x = 0.13 * sx
    add('box', b, 'Pants', (0.17, 0.18, 0.62), (x, 0, 0.56))
    add('box', b, 'Boot', (0.2, 0.3, 0.24), (x, -0.04, 0.12), bevel=0.04)
    add('box', b, 'Leather', (0.22, 0.22, 0.07), (x, -0.01, 0.27))
add('cyl', 'Root', 'Tunic', (1, 0.82, 1), (0, 0, 0.74), (0, 0, R8), r1=0.34, r2=0.27, depth=0.42)
add('cyl', 'Root', 'Gold', (1, 0.82, 1), (0, 0, 0.555), (0, 0, R8), r1=0.35, r2=0.335, depth=0.05)
add('cyl', 'Root', 'Leather', (1, 0.82, 1), (0, 0, 0.94), (0, 0, R8), r1=0.285, r2=0.285, depth=0.08)
add('box', 'Root', 'Gold', (0.1, 0.04, 0.09), (0, -0.225, 0.94))
add('box', 'Root', 'Leather', (0.12, 0.1, 0.14), (0.25, -0.1, 0.85), bevel=0.02)
add('cyl', 'Spine', 'Tunic', (1, 0.78, 1), (0, 0, 1.16), (0, 0, R8), r1=0.27, r2=0.31, depth=0.44)
add('cyl', 'Spine', 'Scarf', (1, 0.85, 1), (0, 0, 1.43), (0, 0, R8), r1=0.25, r2=0.21, depth=0.14)
add('box', 'Scarf', 'Scarf', (0.13, 0.5, 0.035), (0.06, 0.42, 1.37), (-0.25, 0, 0))
add('box', 'Scarf', 'ScarfDark', (0.11, 0.36, 0.03), (-0.05, 0.34, 1.37), (-0.4, 0, 0.12))
add('box', 'Head', 'Skin', (0.46, 0.42, 0.42), (0, -0.02, 1.67), bevel=0.06)
for sx in (1, -1):
    add('box', 'Head', 'Eyes', (0.065, 0.03, 0.11), (0.095 * sx, -0.235, 1.66))
    add('box', 'Head', 'Blush', (0.06, 0.02, 0.03), (0.155 * sx, -0.232, 1.59))
    add('box', 'Head', 'Hair', (0.07, 0.12, 0.2), (0.2 * sx, -0.16, 1.74))
add('box', 'Head', 'Hair', (0.44, 0.08, 0.1), (0, -0.2, 1.84))
add('box', 'Head', 'Hood', (0.58, 0.5, 0.52), (0, 0.07, 1.75), bevel=0.09)
add('cyl', 'Head', 'Hood', (1, 1, 1), (0, 0.3, 1.9), (-1.2, 0, 0), seg=4, r1=0.16, r2=0.0, depth=0.32)
for sx, b in ((1, 'ArmL'), (-1, 'ArmR')):
    x = 0.37 * sx
    add('ico', b, 'Tunic', (0.21, 0.21, 0.21), (x, 0, 1.33))
    add('box', b, 'Sleeve', (0.16, 0.17, 0.38), (x, 0, 1.14))
    add('box', b, 'Gold', (0.18, 0.19, 0.05), (x, 0, 0.96))
    add('box', b, 'Glove', (0.15, 0.16, 0.15), (x, 0, 0.87), bevel=0.03)
add('box', 'Sword', 'Grip', (0.045, 0.24, 0.045), (-0.37, 0.01, 0.87))
add('box', 'Sword', 'Gold', (0.07, 0.07, 0.07), (-0.37, 0.15, 0.87), bevel=0.015)
add('box', 'Sword', 'Gold', (0.05, 0.06, 0.3), (-0.37, -0.13, 0.87))
add('box', 'Sword', 'Blade', (0.035, 1.0, 0.11), (-0.37, -0.66, 0.87))
add('cyl', 'Sword', 'Blade', (0.3, 0.75, 1), (-0.37, -1.25, 0.87), (math.pi / 2, 0, 0), seg=4, r1=0.08, r2=0.0, depth=0.18)

me = bpy.data.meshes.new('HeroMesh')
bm.to_mesh(me)
bm.free()
for m in MATS:
    me.materials.append(m)
hero = bpy.data.objects.new('Hero', me)
for b in BONES:
    hero.vertex_groups.new(name=b[0])

arm = bpy.data.armatures.new('HeroRig')
rig = bpy.data.objects.new('HeroRig', arm)
scene.collection.objects.link(rig)
scene.collection.objects.link(hero)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, head, tail, parent in BONES:
    eb = arm.edit_bones.new(name)
    eb.head, eb.tail, eb.roll = head, tail, 0
    if parent:
        eb.parent = arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
hero.parent = rig
hero.modifiers.new('Armature', 'ARMATURE').object = rig

# empties that mark the sword trail, riding on the Sword bone
for name, pos in (('BladeBase', (-0.37, -0.18, 0.87)), ('BladeTip', (-0.37, -1.32, 0.87))):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.08
    scene.collection.objects.link(e)
    e.parent, e.parent_type, e.parent_bone = rig, 'BONE', 'Sword'
    bpy.context.view_layer.update()
    e.matrix_world = Matrix.Translation(pos)

# ------------------------------------------------------------------ animation
# Poses are written as rotations in degrees around the world axes, as if every parent bone were at
# rest: X (negative raises an arm or leg forward, positive leans the body forward), Y (sideways),
# Z (positive turns toward the hero's left). "NameT" entries move a bone, in metres.
rig.animation_data_create()
REST = {pb.name: pb.bone.matrix_local.to_3x3() for pb in rig.pose.bones}
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'
last = {}


def set_pose(P):
    for pb in rig.pose.bones:
        B = REST[pb.name]
        r = P.get(pb.name, 0)
        r = (r, 0, 0) if isinstance(r, (int, float)) else r
        q = (B.inverted() @ Euler([math.radians(v) for v in r], 'XYZ').to_matrix() @ B).to_quaternion()
        if pb.name in last and last[pb.name].dot(q) < 0:
            q.negate()
        last[pb.name] = q.copy()
        pb.rotation_quaternion = q
        pb.location = B.inverted() @ Vector(P.get(pb.name + 'T', (0, 0, 0)))


BASE = {'ArmL': (0, -8, 0), 'ArmR': (-10, 8, 0), 'Sword': 25}


def S(**kw):
    d = dict(BASE)
    d.update(kw)
    return d


def clip(name, keys, linear=False):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    last.clear()
    prefs = bpy.context.preferences.edit
    old = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = 'LINEAR' if linear else 'BEZIER'
    for f, P in keys:
        set_pose(P)
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=f)
            pb.keyframe_insert('location', frame=f)
    prefs.keyframe_new_interpolation_type = old
    return act


idle_a = S(Spine=3, Scarf=(0, 0, -4))
idle_b = S(Spine=6, RootT=(0, 0, -0.015), ArmL=(0, -10, 0), ArmR=(-12, 10, 0), Sword=28, Head=-3, Scarf=(8, 0, 6))
clip('Idle', [(0, idle_a), (30, idle_b), (60, idle_a)])

run_a = S(Root=(8, 0, 0), Spine=(6, 0, -6), LegL=-38, LegR=32, ArmL=(35, -8, 0), ArmR=(-35, 10, 0), Sword=40, Head=-6, Scarf=35)
run_b = S(Root=(8, 0, 0), Spine=(6, 0, 6), LegL=32, LegR=-38, ArmL=(-35, -8, 0), ArmR=(35, 10, 0), Sword=40, Head=-6, Scarf=35)
run_up = lambda sway: S(Root=(8, 0, 0), RootT=(0, 0, 0.07), Spine=6, Sword=40, Head=-6, Scarf=(45, 0, sway))
clip('Run', [(0, run_a), (4.5, run_up(5)), (9, run_b), (13.5, run_up(-5)), (18, run_a)])

clip('Jump', [(0, S()), (6, S(LegL=-55, LegR=15, Root=-5, ArmL=(-30, -45, 0), ArmR=(-40, 40, 0), Sword=10, Spine=-6, Scarf=60, Head=-8))])

# attacks: the game plays these in step with the swing, from wind-up (first frame) to follow-through (last)
right = dict(RootT=(0, 0, -0.05), Root=(0, 0, -10), Spine=(6, 0, -45), ArmR=(-85, 0, -60), Sword=90, ArmL=(-25, -30, 25), Head=(0, 0, 20), LegL=-15, LegR=15, Scarf=(20, 0, 20))
front = dict(RootT=(0, 0, -0.06), Spine=8, ArmR=(-88, 0, 0), Sword=90, ArmL=(-10, -30, 10), LegL=-15, LegR=15, Scarf=20)
left = dict(RootT=(0, 0, -0.05), Root=(0, 0, 10), Spine=(10, 0, 40), ArmR=(-82, 0, 50), Sword=95, ArmL=(10, -35, 0), Head=(0, 0, -25), LegL=-15, LegR=15, Scarf=(20, 0, -25))
clip('Slash', [(0, right), (4, front), (10, left)])
clip('Slash2', [(0, left), (5, front), (10, right)])
clip('Overhead', [
    (0, dict(Spine=-15, ArmR=(-170, 0, 8), ArmL=(-160, 0, -8), Sword=40, Head=-10, RootT=(0, 0, 0.02), Scarf=10)),
    (4, dict(Spine=0, ArmR=(-125, 0, 5), ArmL=(-110, 0, -5), Sword=60, Scarf=20)),
    (10, dict(Spine=15, RootT=(0, 0, -0.1), ArmR=(-75, 0, 5), ArmL=(-45, 0, -5), Sword=80, Head=5, LegL=-30, LegR=25, Scarf=40)),
])
spin = dict(RootT=(0, 0, -0.08), Spine=10, ArmR=(-85, 0, -80), Sword=90, ArmL=(-30, -70, 0), LegL=-20, LegR=20, Scarf=70)
clip('Spin', [(i * 2, dict(spin, Root=(0, 0, i * 60))) for i in range(7)], linear=True)
clip('Thrust', [
    (0, dict(RootT=(0, 0.05, -0.06), Spine=(5, 0, -35), ArmR=(30, 25, 0), Sword=-30, ArmL=(-50, -40, 0), LegL=-20, LegR=25, Head=(0, 0, 25), Scarf=20)),
    (10, dict(RootT=(0, -0.12, -0.08), Root=6, Spine=(15, 0, 15), ArmR=(-90, 0, 12), Sword=90, ArmL=(20, -30, 0), LegL=-35, LegR=30, Head=(-5, 0, -10), Scarf=45)),
])

# held poses: the game plays these once and holds the last frame
clip('Charge', [(0, S()), (8, dict(RootT=(0, 0.06, -0.14), Root=(0, 0, -10), Spine=(12, 0, -50), ArmR=(40, 30, 0), Sword=-40, ArmL=(-55, -35, 15), LegL=-30, LegR=30, Head=(0, 0, 35), Scarf=(30, 0, 20)))])
clip('Guard', [(0, S()), (5, dict(RootT=(0, 0, -0.07), Spine=(8, 0, 12), ArmR=(-70, 0, 15), Sword=(0, 0, 90), ArmL=(-60, 0, -25), LegL=-18, LegR=18, Head=6))])
dash = dict(RootT=(0, 0, -0.18), Root=35, Spine=15, ArmL=(55, -25, 0), ArmR=(55, 25, 0), Sword=-20, LegL=-55, LegR=45, Head=-30, Scarf=80)
clip('Dodge', [(0, S()), (3, dash), (12, dict(dash, RootT=(0, 0, -0.12), Root=25, LegL=-40, LegR=35))])
flinch = dict(RootT=(0, 0.06, -0.04), Root=-12, Spine=(-20, 0, 10), Head=-20, ArmL=(-35, -50, 0), ArmR=(-35, 50, 0), Sword=20, LegL=-10, LegR=8, Scarf=40)
clip('Hurt', [(0, S()), (3, flinch), (10, dict(flinch, Root=-5, Spine=(-8, 0, 4), Head=-8, ArmL=(-15, -25, 0), ArmR=(-20, 30, 0)))])
down = dict(RootT=(0, 0.05, -0.78), Root=-88, Spine=-5, Head=-10, ArmL=(-10, -75, 0), ArmR=(-10, 75, 0), Sword=60, LegL=-8, LegR=6, Scarf=-30)
clip('Die', [(0, S()), (6, dict(RootT=(0, 0.05, -0.12), Root=-20, Spine=-15, Head=-20, ArmL=(-50, -50, 0), ArmR=(-50, 50, 0), LegL=-15, LegR=5)),
             (18, down), (24, dict(down, RootT=(0, 0.05, -0.8)))])
clip('Drink', [(0, S()), (8, S(ArmL=(-145, 0, -45), Head=-20, Spine=-6, ArmR=(-5, 10, 0)))])

rig.animation_data.action = None
set_pose({})
bpy.context.view_layer.update()

# ------------------------------------------------------------------ save and export
os.makedirs(os.path.dirname(GLB), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', export_animation_mode='ACTIONS')
# Only the model data is written (no window layout or recent folders), so the file carries no paths
# from this computer. Opening it in Blender shows the scene in your usual layout.
bpy.data.libraries.write(BLEND, {scene, *bpy.data.actions}, path_remap='NONE', fake_user=True, compress=True)
print('[hero] wrote', GLB, os.path.getsize(GLB), 'bytes, and', BLEND)

# ------------------------------------------------------------------ optional preview contact sheet
if PREVIEW:
    import numpy as np
    os.makedirs(PREVIEW, exist_ok=True)
    cam = bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam'))
    scene.collection.objects.link(cam)
    cam.location = (3.0, -4.2, 2.6)
    cam.rotation_euler = (Vector((0, 0, 0.95)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 50
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.color_type = 'MATERIAL'
    scene.render.resolution_x = scene.render.resolution_y = 200
    scene.render.image_settings.file_format = 'PNG'
    names = ['Idle', 'Run', 'Jump', 'Slash', 'Slash2', 'Overhead', 'Spin', 'Thrust', 'Charge', 'Guard', 'Dodge', 'Hurt', 'Die', 'Drink']
    cols, size, rows = 5, 200, []
    for n in names:
        act = bpy.data.actions[n]
        rig.animation_data.action = act
        if hasattr(rig.animation_data, 'action_slot') and act.slots:
            rig.animation_data.action_slot = act.slots[0]
        f0, f1 = act.frame_range
        row = []
        for i in range(cols):
            scene.frame_set(int(round(f0 + (f1 - f0) * i / (cols - 1))))
            path = os.path.join(PREVIEW, f'{n}_{i}.png')
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path)
            row.append(np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4))
            bpy.data.images.remove(img)
        rows.append(np.concatenate(row, axis=1))
    sheet = np.concatenate(rows[::-1], axis=0)   # image rows run bottom-up
    out = bpy.data.images.new('sheet', sheet.shape[1], sheet.shape[0])
    out.pixels = sheet.ravel()
    out.filepath_raw = os.path.join(PREVIEW, 'sheet.png')
    out.file_format = 'PNG'
    out.save()
    print('[hero] preview', out.filepath_raw)
