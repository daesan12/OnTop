"""A collar in clean flat colours: -- <shared.glb> <out.glb> set=k [down=0.13] [up=0.04] [xmax=0.1] [win=15] [grow=6] [white=0.5]
Tripo painted the 사또's collar (white inner collar, orange band, the black vest around them) with blotches and a
broken black tie between them; in the game it looked smeared and broken (user). Around the neck (neck joint `down`
below to `up` above, |x| < xmax) the set's top faces are drawn into a mask in their texture (grown `grow` texels).
Inside it every texel is sorted into white, orange or dark, the sorting smoothed by a `win`-texel majority (blotches
and the thin tie go, the borders stay smooth curves), and each sort painted one colour: its median (white lifted to
the brighter side). Painting per face instead followed the triangles and left the borders sawtoothed."""
import bpy, bmesh, sys, os, re
import numpy as np

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], os.path.abspath(a[1])
opt = dict(x.split('=', 1) for x in a[2:])
SET = opt['set']; DOWN, UP, XM = float(opt.get('down', 0.13)), float(opt.get('up', 0.04)), float(opt.get('xmax', 0.1))
WIN, GROW = int(opt.get('win', 15)), int(opt.get('grow', 6))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ad = arm.animation_data; active = ad.action if ad else None
if ad:
    for t in ad.nla_tracks: t.mute = True
    ad.action = None
for pb in arm.pose.bones: pb.matrix_basis.identity()
bpy.context.view_layer.update()
neck = arm.matrix_world @ next(b for b in arm.pose.bones if b.name.endswith('Neck')).head
base = lambda o: re.sub(r'(_\d+)?(\.\d+)?$', '', o.name)


def box_sum(m, r):
    """Sum of m over a (2r+1) square around each texel (integral image)."""
    c = np.pad(m, ((r + 1, r), (r + 1, r))).cumsum(0).cumsum(1)
    return c[2 * r + 1:, 2 * r + 1:] - c[:-2 * r - 1, 2 * r + 1:] - c[2 * r + 1:, :-2 * r - 1] + c[:-2 * r - 1, :-2 * r - 1]


def fill_triangles(mask, tris):
    """Rasterize UV triangles (texel coordinates) into mask."""
    for (x0, y0), (x1, y1), (x2, y2) in tris:
        xs, ys = (x0, x1, x2), (y0, y1, y2)
        lx, hx = max(0, int(min(xs))), min(mask.shape[1] - 1, int(max(xs)) + 1)
        ly, hy = max(0, int(min(ys))), min(mask.shape[0] - 1, int(max(ys)) + 1)
        if hx < lx or hy < ly: continue
        X, Y = np.meshgrid(np.arange(lx, hx + 1) + 0.5, np.arange(ly, hy + 1) + 0.5)
        d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(d) < 1e-9: continue
        l0 = ((y1 - y2) * (X - x2) + (x2 - x1) * (Y - y2)) / d
        l1 = ((y2 - y0) * (X - x2) + (x0 - x2) * (Y - y2)) / d
        inside = (l0 >= -0.02) & (l1 >= -0.02) & (1 - l0 - l1 >= -0.02)
        mask[ly:hy + 1, lx:hx + 1] |= inside


done = set()
for o in [o for o in bpy.data.objects if o.type == 'MESH' and base(o).startswith(f'item__TOP__{SET}')]:
    img = next((n.image for m in o.data.materials if m and m.node_tree for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
    if not img or img.name in done: continue
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)
    mw = o.matrix_world; uvd = o.data.uv_layers.active.data
    tris = []
    for p in o.data.polygons:
        c = mw @ p.center
        if not (abs(c.x) < XM and neck.z - DOWN < c.z < neck.z + UP): continue
        us = [(uvd[l].uv.x * w_, uvd[l].uv.y * h_) for l in p.loop_indices]
        for k in range(1, len(us) - 1): tris.append((us[0], us[k], us[k + 1]))
    if not tris: continue
    mask = np.zeros((h_, w_), bool); fill_triangles(mask, tris)
    if GROW: mask = box_sum(mask.astype(np.float32), GROW) > 0
    C = P[..., :3]
    # white only where bright: the vest's grey sheen sorted as white left pale blotches on it
    cls = np.full((h_, w_), 2, np.int8)                                   # dark (vest, tie, its sheen)
    cls[C.mean(2) > float(opt.get('white', 0.5))] = 0                     # white
    cls[(C[..., 0] > 0.4) & (C[..., 0] - C[..., 2] > 0.25)] = 1           # orange
    votes = np.stack([box_sum(((cls == k) & mask).astype(np.float32), WIN // 2) for k in range(3)])
    sm = votes.argmax(0)
    for k, name in ((0, 'white'), (1, 'orange'), (2, 'dark')):
        sel = mask & (sm == k)
        if not sel.any(): continue
        src_ = C[mask & (cls == k)]
        colour = np.percentile(src_, 70, axis=0) if k == 0 else np.median(src_, axis=0)
        P[sel, :3] = colour
        print('COLLAR', img.name, name, int(sel.sum()), 'texels to', colour.round(2).tolist())
    img.pixels[:] = P.ravel(); img.pack(); done.add(img.name)
if ad:
    for t in ad.nla_tracks: t.mute = False
    ad.action = active
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_apply=False, export_image_format='AUTO')
print('RESULT', out)
