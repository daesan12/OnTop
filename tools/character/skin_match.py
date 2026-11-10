"""Match the Tripo parts' skin colour to the shared body's skin:
-- <shared_layers.glb> <outfit_parts.glb> <out_parts.glb> parts=1,5,6,7,8 [strength=1.0]
Body skin = the median texel under the faces led by the neck, hands, forearms and shins. In each listed part's
texture the skin-like pixels (reddish: r > g > b, not dark, not grey) are scaled per channel so their median
becomes the body's; the muscles' shading (each pixel's ratio to the median) is kept. Cloth pixels are untouched."""
import bpy, sys, numpy as np
a = sys.argv[sys.argv.index('--') + 1:]
opt = dict(x.split('=') for x in a[3:])
parts = [f'tripo_part_{n}' for n in opt.get('parts', '1,5,6,7,8').split(',')]
strength = float(opt.get('strength', 1.0))

def pixels(img):
    w, h = img.size; return np.array(img.pixels[:], np.float32).reshape(h, w, img.channels)

# 1. the body's skin
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
# (every body piece, body and body__<tokens>: with more outfits the neck, hands, forearms and shins all went to
# body__ pieces and the plain body had none of them, S15P31B105-364)
SKIN = ('Neck', 'LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm', 'LeftLeg', 'RightLeg')
cols = []
for body in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.split('.')[0].startswith('body')]:
    img = next((n.image for m in body.data.materials if m and m.node_tree for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
    if not img or not body.data.uv_layers: continue
    P = pixels(img); h, w = P.shape[:2]
    gname = {g.index: g.name.split(':')[-1] for g in body.vertex_groups}
    lead = [max(((e.weight, gname.get(e.group, '')) for e in v.groups), default=(0, ''))[1] for v in body.data.vertices]
    uv = body.data.uv_layers.active.data
    for p in body.data.polygons:
        votes = {}
        for vi in p.vertices: votes[lead[vi]] = votes.get(lead[vi], 0) + 1
        if not any(max(votes, key=votes.get).startswith(s) for s in SKIN): continue
        for li in p.loop_indices:
            u, v = uv[li].uv; cols.append(P[min(h - 1, max(0, int(v * h))), min(w - 1, max(0, int(u * w))), :3])
cols = np.array(cols)
# keep the skin-like samples only (the neck's fold line, nails, any cloth edge out)
cm = (cols[:, 0] > cols[:, 1]) & (cols[:, 1] > cols[:, 2]) & (cols.max(1) > 0.35)
target = np.median(cols[cm], 0)
print('BODY skin', np.round(target, 3), 'from', int(cm.sum()), 'of', len(cols), 'samples')

# 2. the parts' skin
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[1])
for name in parts:
    o = bpy.data.objects[name]
    im = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    Q = pixels(im); rgb = Q[..., :3]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    mask = (r > g) & (g > b) & (mx > 0.2) & (sat > 0.15) & (r - b > 0.08)
    if mask.sum() < 100: print('PART', name, 'no skin'); continue
    med = np.median(rgb[mask], 0)
    gain = 1 + (target / np.maximum(med, 1e-4) - 1) * strength
    rgb[mask] = np.clip(rgb[mask] * gain, 0, 1)
    Q[..., :3] = rgb; im.pixels[:] = Q.ravel(); im.update()
    print('PART', name, 'skin px', int(mask.sum()), 'median', np.round(med, 3), 'gain', np.round(gain, 3))
bpy.ops.export_scene.gltf(filepath=a[2], export_format='GLB', export_image_format='JPEG', export_jpeg_quality=95,
                          export_animations=False, export_skins=False)
print('RESULT', a[2])
