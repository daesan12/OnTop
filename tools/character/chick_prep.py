"""The chick costume's Tripo parts made ready for fit_outfit.py (S15P31B105-364): -- <parts.glb> <out.glb>
[hood_z=0.585] [sleeve_x=0.19] [sleeve_z=0.38] [low_z=0.25] [lift=0.25] [collar_z=0.52 collar_x=0.14]
Tripo gave the hood, the plush suit and its wing sleeves as one part (0). It is split by place into
  31 the hood (over hood_z; HAIR, with the bangs 8 and the sprout 7),
  32 the wing sleeves (|x| over sleeve_x, between sleeve_z and hood_z; TOP, weighted on the arm chain: wing_parts),
  33 the suit's lower part (under low_z; BOTTOM, with the ankle skin 9 and 10),
  30 the rest of the suit (TOP, with the belly 3).
The generated arms hang a little under the body's T-pose (the wrists 3-4 cm low): the sleeves are lifted by
lift x (|x| - sleeve_x), nothing at their root, so they meet the body's wrists."""
import bpy, bmesh, sys
a = sys.argv[sys.argv.index('--') + 1:]
opt = dict(x.split('=') for x in a[2:])
HZ, SX, SZ, LZ, LIFT = (float(opt.get(k, d)) for k, d in
                        (('hood_z', 0.585), ('sleeve_x', 0.19), ('sleeve_z', 0.38), ('low_z', 0.25), ('lift', 0.25)))
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
src = bpy.data.objects['tripo_part_0']; mw = src.matrix_world.copy()

# collar_z, collar_x: the hood also takes the suit round the neck (|x| under collar_x, over collar_z), a copy the
# suit keeps too. head_fit grows the hood 1.107 times and lifts it about 6 cm onto the body's bigger head; cut level
# with the suit, the neck then showed between them over a ragged suit edge (S15P31B105-364)
CZ, CX = float(opt.get('collar_z', 0.52)), float(opt.get('collar_x', 0.14))

def where(c):
    if c.z >= HZ: return '31'
    if abs(c.x) >= SX and c.z >= SZ: return '32'
    if c.z < LZ: return '33'
    return '30'

def keeps(name, c):
    return where(c) == name or (name == '31' and c.z >= CZ and abs(c.x) < CX)

for name in ('30', '31', '32', '33'):
    o = src.copy(); o.data = src.data.copy(); o.name = o.data.name = 'tripo_part_' + name
    src.users_collection[0].objects.link(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keeps(name, mw @ f.calc_center_median())], context='FACES')
    if name == '32':
        inv = mw.inverted()
        for v in bm.verts:
            w = mw @ v.co; w.z += LIFT * max(0.0, abs(w.x) - SX); v.co = inv @ w
    bm.to_mesh(o.data); bm.free()
    print('PART', o.name, len(o.data.polygons), 'faces')
bpy.data.objects.remove(src)
bpy.ops.export_scene.gltf(filepath=a[1], export_format='GLB', export_image_format='JPEG', export_jpeg_quality=95,
                          export_animations=False, export_skins=False)
print('RESULT', a[1])
