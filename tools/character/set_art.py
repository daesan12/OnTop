"""Wardrobe card picture of a whole set: the dressed character, transparent, 320 px."""
import bpy, sys
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]; path, out = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=path)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and not o.name.startswith('near'): bpy.data.objects.remove(o)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 640
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.55
sun = bpy.data.objects.new('s', bpy.data.lights.new('s', 'SUN')); sun.data.energy = 1.6; sc.collection.objects.link(sun); sun.rotation_euler = (0.9, 0.2, 0.5)
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
d = Vector((0.35, -1, 0.12)).normalized(); c = Vector((0, 0, 1.0)); cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.15
cam.location = c + d * 5; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
