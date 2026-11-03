"""Render GLBs from any direction: -- <out.png> <dx,dy,dz> <cx,cy,cz|Bone> <scale> <glb>[:names] ...
POSE=action:frame poses the armatures; the centre may be a bone name (its head, posed)."""
import bpy, sys, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]; out = os.path.abspath(a[0]); d = Vector([float(x) for x in a[1].split(',')]).normalized()
cs = a[2]; scale = float(a[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
for spec in a[4:]:
    path, _, names = spec.partition(':')
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    for o in set(bpy.data.objects) - before:
        if o.type == 'MESH' and (o.name.startswith('Icosphere') or (names and not any(o.name.startswith(n) for n in names.split(',')))): bpy.data.objects.remove(o)
        elif o.type == 'ARMATURE': o.data.pose_position = 'REST'
pose = os.environ.get('POSE')
for o in bpy.data.objects:
    if o.type != 'ARMATURE' or not pose: continue
    o.data.pose_position = 'POSE'; an, fr = pose.split(':'); ad = o.animation_data
    for t in ad.nla_tracks: t.mute = True
    ad.action = next(t.strips[0].action for t in ad.nla_tracks if t.name == an)
    if hasattr(ad, 'action_slot') and ad.action.slots: ad.action_slot = ad.action.slots[0]
    bpy.context.scene.frame_set(int(fr))
if ',' in cs: c = Vector([float(x) for x in cs.split(',')])
else:
    am = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); c = am.matrix_world @ next(b for b in am.pose.bones if b.name.endswith(cs)).head
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
sc.view_settings.view_transform = 'Standard'
if os.environ.get('FLAT'):                       # texture colour only, no lighting
    sc.render.engine = 'BLENDER_WORKBENCH'; sh_ = sc.display.shading; sh_.light = 'FLAT'; sh_.color_type = 'TEXTURE'
sc.render.resolution_x = sc.render.resolution_y = 768
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = scale; cam.location = c + d * 3; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
