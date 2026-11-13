"""Cover picture of a whole skin (S15P31B105-416): -- <whole_raw.glb> <out.raw.png> [size=640]
The set card (item_art.py together=) leaves the face out, so the cat hood showed an empty black opening. This draws
the whole-skin file itself (near mesh, face included) in its bind pose (the game's rest), with item_art.py's light
and front-left view. Fit it with fit_cards.mjs like the cards."""
import bpy, sys, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
opt = dict(x.split('=') for x in a[2:]); SIZE = int(opt.get('size', 640))
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); arm.data.pose_position = 'REST'   # (bound in the game's rest already)
objs = [o for o in bpy.data.objects if o.type == 'MESH' and 'near' in o.name]
for o in bpy.data.objects:
    if o.type == 'MESH': o.hide_render = o not in objs
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
P = [o.matrix_world @ v.co for o in objs for v in o.evaluated_get(dg).to_mesh().vertices]
lo = Vector([min(p[i] for p in P) for i in range(3)]); hi = Vector([max(p[i] for p in P) for i in range(3)])
c = (lo + hi) / 2; cam.data.ortho_scale = max(hi - lo) * 1.15
cam.location = c + d * 5; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = os.path.abspath(a[1]); bpy.ops.render.render(write_still=True)
print('ART', [o.name for o in objs])
