"""A raw game build's near LOD on a magenta background, every piece shown: -- <raw.glb> <out_prefix> [cull]
Holes show magenta, black texture (unbaked atlas texels) shows black. Writes <out_prefix>_front/_chest/_side/_backs.png.
The views are framed for the 1.7 m figure; for an outfit file (no body) it shows the items alone."""
import bpy, sys
from mathutils import Vector
import os
a = sys.argv[sys.argv.index('--') + 1:]; path, tag = a[0], os.path.abspath(a[1])
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=path)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and not o.name.startswith('near'): bpy.data.objects.remove(o)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'FLAT'; sh.color_type = 'TEXTURE'
sh.show_backface_culling = a[2] == 'cull' if len(a) > 2 else False
sc.world = bpy.data.worlds.new('w'); sc.world.color = (1, 0, 1)
sc.render.resolution_x = sc.render.resolution_y = 800
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
for name, (d, c, S) in {'front': ((0, -1, 0.1), (0, 0, 1.15), 1.0), 'chest': ((0.3, -1, 0.2), (0.05, 0, 1.15), 0.45),
                        'side': ((1, -0.4, 0.2), (0.1, 0, 1.2), 0.6), 'backs': ((-0.4, 1, 0.3), (0, 0, 1.2), 0.7)}.items():
    d = Vector(d).normalized(); c = Vector(c); cam.data.type = 'ORTHO'; cam.data.ortho_scale = S; cam.location = c + d * 4
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{tag}_{name}.png'; bpy.ops.render.render(write_still=True)
