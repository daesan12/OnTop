"""Refine the existing rigged Rudolph without provider calls or source overwrites.

blender -b --python scripts/refine-christmas-rudolph.py -- SOURCE_GLB OUTPUT_DIRECTORY
"""
import bpy, hashlib, json, math, os, sys
from mathutils import Vector

source, output, *options = sys.argv[sys.argv.index('--') + 1:]
os.makedirs(output, exist_ok=True)
def sha(file):
    with open(file, 'rb') as stream: return hashlib.sha256(stream.read()).hexdigest()
source_hash = sha(source)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 60
bpy.ops.import_scene.gltf(filepath=source)
for obj in list(bpy.context.scene.objects):
    if obj.name == 'Icosphere': bpy.data.objects.remove(obj, do_unlink=True)
rig = next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
action = rig.animation_data.action
if action is None: action = next(strip.action for track in rig.animation_data.nla_tracks for strip in track.strips)
# glTF import can offset keys by one Blender frame. Retain the complete loop
# and normalize its time range explicitly before sampling the 0.8-second clip.
curves = [curve for layer in action.layers for strip in layer.strips
          for bag in strip.channelbags for curve in bag.fcurves]
keys = [key for curve in curves for key in curve.keyframe_points]
first, last = min(key.co.x for key in keys), max(key.co.x for key in keys)
for key in keys:
    for coordinate in (key.co, key.handle_left, key.handle_right): coordinate.x = (coordinate.x-first)*48/(last-first)
rig.animation_data_clear()
for bone in rig.pose.bones: bone.matrix_basis.identity()
bpy.context.view_layer.update()
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
def smooth(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)
def cute(point):
    x, y, z = point
    head = smooth((z - .30) / .25) * smooth((-y - .12) / .22)
    antler = smooth((z - .86) / .18)
    # Broader face, shorter muzzle, compact antlers, a softly rounded torso.
    x *= (1 + .12 * (1 - head)) * (1 + .28 * head * (1 - antler)) * (1 - .22 * antler)
    y += head * (1 - antler * .5) * (-.55 - y) * .22
    z += head * (1 - antler) * (z - .55) * .06
    z -= antler * max(0, z - .88) * .28
    if z < -.25: z = -.25 + (z + .25) * .84
    return Vector((x, y, z))
for obj in meshes:
    inverse = obj.matrix_world.inverted()
    for vertex in obj.data.vertices: vertex.co = inverse @ cute(obj.matrix_world @ vertex.co)
body = next(obj for obj in meshes if obj.name.startswith('tripo_node_'))
bpy.context.view_layer.objects.active = body
weld = body.modifiers.new('Weld coincident texture seam vertices', 'WELD')
weld.merge_threshold = .00001
bpy.ops.object.modifier_apply(modifier=weld.name)
decimate = body.modifiers.new('Gentle low-poly silhouette', 'DECIMATE')
decimate.ratio = .68
decimate.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=decimate.name)
for face in body.data.polygons: face.use_smooth = True
# Blend subtle facet normals into the smooth fur instead of hard triangle edges.
normals = [None] * len(body.data.loops)
for face in body.data.polygons:
    for index in face.loop_indices:
        normal = body.data.vertices[body.data.loops[index].vertex_index].normal
        normals[index] = (normal * .72 + face.normal * .28).normalized()
body.data.normals_split_custom_set(normals)
points = [obj.matrix_world @ vertex.co for obj in meshes for vertex in obj.data.vertices]
bottom, top = min(p.z for p in points), max(p.z for p in points)
scale = 2.4 / (top - bottom)
roots = [obj for obj in bpy.context.scene.objects if obj.parent is None]
normalizer = bpy.data.objects.new('Cute_Rudolph_2_4m', None)
bpy.context.scene.collection.objects.link(normalizer)
for obj in roots: obj.parent = normalizer
normalizer.scale = (scale, scale, scale)
normalizer.location.z = -.9 - bottom * scale
rig.animation_data_create(); rig.animation_data.action = action
rig.animation_data.action_slot = action.slots[0]
bpy.context.scene.frame_start = 0; bpy.context.scene.frame_end = 48
bpy.context.scene.frame_set(0)
destination = os.path.join(output, 'rudolph.glb')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=destination, export_format='GLB', export_extras=True,
    export_animations=True, export_frame_range=True, export_force_sampling=True,
    export_meshopt_compression_enable=True, export_image_quality=85)
assert source_hash == sha(source), 'Original source changed'
report = {'source_sha256': source_hash, 'sha256': sha(destination), 'bytes': os.path.getsize(destination),
    'triangles': sum(len(face.vertices)-2 for obj in meshes for face in obj.data.polygons),
    'height_metres': 2.4, 'ground_offset': -.9, 'additional_credits': 0,
    'changes': ['broader round face', 'shorter muzzle', 'compact antlers', 'fuller torso', 'shorter legs', 'gentle faceting'],
    'rig_bones': len(rig.data.bones), 'duration_seconds': .8}
with open(os.path.join(output, 'refinement.json'), 'w') as stream: json.dump(report, stream, indent=2)
print('RUDOLPH_REFINEMENT', json.dumps(report))
if '--no-render' in options: sys.exit(0)

# Review images are rendered from the exported asset's geometry and materials.
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 800; scene.render.resolution_y = 800; scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('Rudolph review studio'); scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.14, .18, .20, 1)
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .65
for name, position, power, color in [('Key', (3,-4,5), 350, (1,.91,.8)), ('Fill', (-3,-2,3), 230, (.8,.9,1)), ('Rim', (0,3,4), 300, (1,.9,.75))]:
    light = bpy.data.lights.new(name, 'AREA'); light.energy = power; light.size = 4; light.color = color
    obj = bpy.data.objects.new(name, light); scene.collection.objects.link(obj); obj.location = position
    obj.rotation_euler = (Vector((0,0,.3))-obj.location).to_track_quat('-Z','Y').to_euler()
camera = bpy.data.objects.new('Review camera', bpy.data.cameras.new('Review camera'))
scene.collection.objects.link(camera); scene.camera = camera; camera.data.type = 'ORTHO'; camera.data.ortho_scale = 3.1
for name, direction in [('front', (0,-1,.12)), ('three-quarter', (1.3,-2,.4))]:
    direction = Vector(direction).normalized(); camera.location = Vector((0,0,.3)) + direction * 6
    camera.rotation_euler = (-direction).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = os.path.join(output, name + '.png'); bpy.ops.render.render(write_still=True)
