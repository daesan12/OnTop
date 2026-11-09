"""Lift drooping Tripo sleeves onto the body's T-pose arms: -- <parts.glb> <out.glb> parts=14,15,23,24 [lift=0.33] [from=0.1]
The generated arms often hang under the body's (the baker's cuffs 4.4 cm low, S15P31B105-367; the chick's wing
sleeves, chick_prep.py). Each listed part's points out past |x| = from (m, about the shoulder) rise by
lift x (|x| - from); nothing moves inside it, so a part that crosses the shoulder (a strap) keeps its chest end."""
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
opt = dict(x.split('=') for x in a[2:])
LIFT, X0 = float(opt.get('lift', 0.33)), float(opt.get('from', 0.1))
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
for n in opt['parts'].split(','):
    o = bpy.data.objects['tripo_part_' + n]; mw = o.matrix_world; inv = mw.inverted()
    for v in o.data.vertices:
        w = mw @ v.co; w.z += LIFT * max(0.0, abs(w.x) - X0); v.co = inv @ w
    o.data.update()
    print('LIFT', o.name)
bpy.ops.export_scene.gltf(filepath=a[1], export_format='GLB', export_image_format='JPEG', export_jpeg_quality=95,
                          export_animations=False, export_skins=False)
print('RESULT', a[1])
