"""Front and side silhouettes of the shared body and the Tripo general (scaled by s about the ground origin),
for fitting: -- <shared_layers.glb> <general.glb> <out_prefix> s=1.2 [sz=..]"""
import bpy, sys, math, re, os
from mathutils import Vector, Matrix
a = sys.argv[sys.argv.index('--') + 1:]
opt = dict(x.split('=') for x in a[3:])
s = float(opt.get('s', 1.2)); sz = float(opt.get('sz', s)); dz = float(opt.get('dz', 0)); dy = float(opt.get('dy', 0))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ad = arm.animation_data
for t in ad.nla_tracks: t.mute = True
ad.action = None
for pb in arm.pose.bones: pb.matrix_basis.identity()
if opt.get('pose') == 'bind':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from game_pose import bind_pose
    bind_pose(arm)
base = [o for o in bpy.data.objects if o.type == 'MESH' and re.sub(r'\.\d+$', '', o.name).startswith('body')]
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o not in base: bpy.data.objects.remove(o)
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=a[1])
gen = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
for o in bpy.data.objects:
    if o not in before and o.parent is None:
        o.matrix_world = Matrix.Translation((0, dy, dz)) @ Matrix.Diagonal((s, s, sz, 1)) @ o.matrix_world
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'; sc.render.film_transparent = True; sc.render.resolution_x = 800; sc.render.resolution_y = 1000
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'SINGLE'
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.3
for view, loc, rot in (('front', (0, -3, 0.6), (math.pi / 2, 0, 0)), ('side', (3, 0, 0.6), (math.pi / 2, 0, math.pi / 2))):
    cam.location = loc; cam.rotation_euler = rot
    for which, objs in (('base', base), ('gen', gen)):
        for o in base + gen: o.hide_render = o not in objs
        sc.render.filepath = f'{a[2]}_{view}_{which}.png'; bpy.ops.render.render(write_still=True)
