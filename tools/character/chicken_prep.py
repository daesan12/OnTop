"""Fried chicken drumstick suit (S15P31B105-418) prep: -- <parts.glb> <out.glb> [part=0] [z=0.6] [overlap=0.045]
[sink=0.003] [arms=7,8]
Tripo made the batter hood and suit as one part (0). The hood must ride the head and the suit the chest, so it is cut
at the neck (z): faces above become the hood (41), faces under it the suit (40). Cut flush, the seam opened as the
head moved and the neck showed through; a band drawn from the rim's texels read as stretched stripes (user: fill it
with the same modelled batter). So the hood also keeps a copy of the suit's own surface `overlap` under the cut, sunk
`sink` inside it (fading in over the first centimetre so the cut line stays put): when the head moves, real batter
fills the opening.
The bare arms' roots lay inside the suit on the T-pose and Tripo painted them batter orange; with the arms down they
came out as orange streaks. Faces of arms= whose texel is orange (blue under 0.4 x red) take the arm's median skin
texel. The arms are kept whole: fit_outfit.py's skin_parts gives them the body's own weights (docs 4-9)."""
import bpy, bmesh, sys
import numpy as np
a = sys.argv[sys.argv.index('--') + 1:]
opt = dict(x.split('=') for x in a[2:])
Z, OV, SINK = float(opt.get('z', 0.6)), float(opt.get('overlap', 0.045)), float(opt.get('sink', 0.003))
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
src = bpy.data.objects['tripo_part_' + opt.get('part', '0')]; mw = src.matrix_world

def piece(name, keep):
    o = src.copy(); o.data = src.data.copy(); o.name = o.data.name = name; bpy.context.scene.collection.objects.link(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep((mw @ f.calc_center_median()).z)], context='FACES')
    return o, bm

suit, bm = piece('tripo_part_40', lambda z: z <= Z)
bm.to_mesh(suit.data); bm.free()
hood, bm = piece('tripo_part_41', lambda z: z > Z - OV)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.normal_update()
inv = mw.inverted(); n_ = 0
for v in bm.verts:
    z = (mw @ v.co).z
    if z >= Z: continue
    t = min(1.0, (Z - z) / 0.01)
    w = mw @ v.co; nrm = (mw.to_3x3() @ v.normal).normalized()
    v.co = inv @ (w - nrm * SINK * t); n_ += 1
bm.to_mesh(hood.data); bm.free()
bpy.data.objects.remove(src)
print('HOOD cut at', Z, '; hood keeps', OV, 'm of the suit under it,', n_, 'vertices sunk', SINK)

for n in opt.get('arms', '7,8').split(','):
    o = bpy.data.objects['tripo_part_' + n]
    img = next(nd.image for m in o.data.materials for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
    uvd = o.data.uv_layers.active.data
    tex = lambda u: P[min(h_ - 1, max(0, int(u[1] * h_))), min(w_ - 1, max(0, int(u[0] * w_)))]
    cen = {p.index: np.mean([tuple(uvd[l].uv) for l in p.loop_indices], 0) for p in o.data.polygons}
    col = {i: tex(u) for i, u in cen.items()}
    orange = lambda c: c[2] < 0.4 * c[0]
    skin = [i for i, c in col.items() if not orange(c)]
    lum = {i: float(col[i].mean()) for i in skin}; med = np.median(list(lum.values()))
    uv_skin = cen[min(skin, key=lambda i: abs(lum[i] - med))]
    bad = [p for p in o.data.polygons if orange(col[p.index])]
    for p in bad:
        for l in p.loop_indices: uvd[l].uv = uv_skin
    print('ARM', o.name, len(bad), 'orange faces of', len(o.data.polygons), 'to skin', tex(uv_skin).round(2).tolist())
bpy.ops.export_scene.gltf(filepath=a[1], export_format='GLB', export_image_format='JPEG', export_jpeg_quality=95,
                          export_animations=False, export_skins=False)
print('RESULT', a[1])
