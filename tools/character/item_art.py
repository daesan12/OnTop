"""Wardrobe card pictures of one outfit's items: -- <shared_layers.glb> <out_dir> <file> <set> [size=320]
Each item (item__<SLOT>__<set>, its under-pieces included) alone, in the game's arms-down rest, from the front-left
like the default parts' pictures (frontend/src/features/wardrobe/parts), lit by a soft sky and a sun, transparent.
Writes <out_dir>/outfit-<file>-<set>-<slot>.raw.png; fit them to the card with the same 232 px width afterwards."""
import bpy, sys, os, re
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, od, file_, SET = a[0], os.path.abspath(a[1]), a[2], a[3]
opt = dict(x.split('=') for x in a[4:])
SIZE = int(opt.get('size', 640))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from game_pose import bind_pose
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bind_pose(arm)
items = {}
for o in list(bpy.data.objects):
    if o.type != 'MESH': continue
    m = re.match(rf'item__([A-Z]+)__{SET}(?:__under_\w+)?(?:_\d+)?$', re.sub(r'\.\d+$', '', o.name))
    if m: items.setdefault(m.group(1), []).append(o)
    else: o.hide_render = True
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = SIZE; sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.55
sun = bpy.data.objects.new('s', bpy.data.lights.new('s', 'SUN')); sun.data.energy = 1.6; sc.collection.objects.link(sun); sun.rotation_euler = (0.9, 0.2, 0.5)
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
d = Vector((-0.35, -1, 0.15)).normalized()
dg = bpy.context.evaluated_depsgraph_get()
for slot, objs in items.items():
    for o in bpy.data.objects:
        if o.type == 'MESH': o.hide_render = o not in objs
    P = [o.matrix_world @ v.co for o in objs for v in o.evaluated_get(dg).to_mesh().vertices]
    lo = Vector([min(p[i] for p in P) for i in range(3)]); hi = Vector([max(p[i] for p in P) for i in range(3)])
    c = (lo + hi) / 2; cam.data.ortho_scale = max(hi - lo) * 1.15
    cam.location = c + d * 5; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(od, f'outfit-{file_}-{SET}-{slot.lower()}.raw.png'); bpy.ops.render.render(write_still=True)
    print('ART', slot, len(objs), 'meshes')
