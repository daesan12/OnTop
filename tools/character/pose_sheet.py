"""The shared body alone in the game's rest (arms down, game_pose.py), rendered from four sides as a 2x2 sheet
like the original base sheet (front, right side, back, left side), for generating outfits that are already made
for arms down: -- <shared_layers.glb> <out.png> [size=1024]
Rigid outfits made on the T-pose sheet had to be bent 70 degrees at the shoulders and broke."""
import bpy, sys, os, math, re
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], os.path.abspath(a[1])
opt = dict(x.split('=') for x in a[2:])
SIZE = int(opt.get('size', 1024))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from game_pose import bind_pose
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in list(bpy.data.objects):
    if o.type == 'MESH' and not re.sub(r'\.\d+$', '', o.name).startswith('body'): bpy.data.objects.remove(o)
bind_pose(arm)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x = sc.render.resolution_y = SIZE; sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 2.0; sc.collection.objects.link(sun)
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.15
c = Vector((0, 0, 0.5))
tiles = []
# the character faces -y; right side view = camera on the character's right (+x is its left)
for name, d in (('front', (0, -1, 0)), ('right', (-1, 0, 0)), ('back', (0, 1, 0)), ('left', (1, 0, 0))):
    d = Vector(d); cam.location = c + d * 3; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sun.rotation_euler = (-(d + Vector((0.3, 0, 0.8)))).to_track_quat('-Z', 'Y').to_euler()
    p = out.replace('.png', f'_{name}.png'); sc.render.filepath = p; bpy.ops.render.render(write_still=True); tiles.append(p)
print('TILES', tiles)
