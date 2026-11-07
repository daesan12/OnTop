"""Cut a layered build's items down to a face budget per set, in place: -- <in.glb> <out.glb> sets=l,m,n [faces=120000]
Tripo parts come in at about a million faces an outfit; fitted as they are, the build grew from 71 MB to 259 MB
with three outfits (S15P31B105-363). The other sets were 30k to 117k faces. Each item object of the named sets is
decimated (collapse, before its armature modifier, so the rest shape, weights and UVs carry over) by one ratio per
set: faces / the set's total. Body pieces and other sets are left as they are. Exported like fit_outfit.py."""
import bpy, sys, re, collections
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
opt = dict(x.split('=') for x in a[2:])
SETS = opt['sets'].split(','); BUDGET = int(opt.get('faces', 120000))
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ad = arm.animation_data; active = ad.action
items = collections.defaultdict(list)
for o in bpy.data.objects:
    m = re.match(r'item__[A-Z]+__([a-z0-9]+)', o.name) if o.type == 'MESH' else None
    if m and m.group(1) in SETS: items[m.group(1)].append(o)
for s in SETS:
    total = sum(len(o.data.polygons) for o in items[s]); ratio = min(1.0, BUDGET / max(1, total))
    for o in items[s]:
        if len(o.data.polygons) < 200: continue
        bpy.context.view_layer.objects.active = o
        md = o.modifiers.new('dec', 'DECIMATE'); md.ratio = ratio; md.use_collapse_triangulate = True
        bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
        bpy.ops.object.modifier_apply(modifier='dec')
    print('SET', s, total, '->', sum(len(o.data.polygons) for o in items[s]), 'faces in', len(items[s]), 'items')
ad.action = active
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_apply=False, export_image_format='AUTO')
print('RESULT', out)
