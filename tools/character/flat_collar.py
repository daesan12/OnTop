"""A collar in clean flat colours: -- <shared.glb> <out.glb> set=k [down=0.13] [up=0.04] [xmax=0.1] [win=15] [grow=6] [white=0.5]
       [mirror=1] [plug=1]
Tripo painted the 사또's collar (white inner collar, orange band, the black vest around them) with blotches and a
broken black tie between them; in the game it looked smeared and broken (user). Around the neck (neck joint `down`
below to `up` above, |x| < xmax) the set's top faces are drawn into a mask in their texture (grown `grow` texels).
Inside it every texel is sorted into white, orange or dark, the sorting smoothed by a `win`-texel majority (blotches
and the thin tie go, the borders stay smooth curves), and each sort painted one colour: its median (white lifted to
the brighter side). Painting per face instead followed the triangles and left the borders sawtoothed.
Still the left orange band stopped short of the V and a dark notch bit into the right one (user): mirror=1 gives
every front texel the brighter sort of itself and its mirror (orange over white over dark), compared on a front view.
The black stripe down the middle was no paint: the opening between the two flaps, through which the inside of the
robe's back showed. plug=1 closes it from behind: the front view's hole (cells with no front surface but front
surface on all four sides), grown two cells under the flaps, becomes a grid of quads just behind the surfaces around
it, each cell on its mirror cell's sort (white above, the orange band below), each corner skinned like the nearest
top vertex. The zero-UV-area slivers in the opening go; around it they take the view's sort."""
import bpy, bmesh, sys, os, re
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], os.path.abspath(a[1])
opt = dict(x.split('=', 1) for x in a[2:])
SET = opt['set']; DOWN, UP, XM = float(opt.get('down', 0.13)), float(opt.get('up', 0.04)), float(opt.get('xmax', 0.1))
WIN, GROW = int(opt.get('win', 15)), int(opt.get('grow', 6))
MIRROR, PLUG = opt.get('mirror', '0') == '1', opt.get('plug', '0') == '1'
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


def fill_triangles(mask, tris, pos, has):
    """Rasterize UV triangles (texel coordinates) into mask; pos takes each texel's surface point."""
    for ((x0, y0), (x1, y1), (x2, y2)), (A, B, C) in tris:
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
        w0, w1 = l0[inside][:, None], l1[inside][:, None]
        pos[ly:hy + 1, lx:hx + 1][inside] = w0 * A + w1 * B + (1 - w0 - w1) * C
        has[ly:hy + 1, lx:hx + 1] |= inside


done = set()
for o in [o for o in bpy.data.objects if o.type == 'MESH' and base(o).startswith(f'item__TOP__{SET}')]:
    img = next((n.image for m in o.data.materials if m and m.node_tree for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
    if not img or img.name in done: continue
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)
    mw = o.matrix_world; uvd = o.data.uv_layers.active.data
    tris = []
    for p in o.data.polygons:
        # any corner in the box: the black stripe down the front is long slivers whose centres lie below it
        vs = [mw @ o.data.vertices[v].co for v in p.vertices]
        if not any(abs(c.x) < XM and neck.z - DOWN < c.z < neck.z + UP for c in vs): continue
        us = [(uvd[l].uv.x * w_, uvd[l].uv.y * h_) for l in p.loop_indices]
        ps = [np.array(mw @ o.data.vertices[v].co, np.float32) for v in p.vertices]
        for k in range(1, len(us) - 1): tris.append(((us[0], us[k], us[k + 1]), (ps[0], ps[k], ps[k + 1])))
    if not tris: continue
    mask = np.zeros((h_, w_), bool); has = np.zeros((h_, w_), bool); pos = np.zeros((h_, w_, 3), np.float32)
    fill_triangles(mask, tris, pos, has)
    if GROW: mask = box_sum(mask.astype(np.float32), GROW) > 0
    C = P[..., :3]
    # white only where bright: the vest's grey sheen sorted as white left pale blotches on it
    cls = np.full((h_, w_), 2, np.int8)                                   # dark (vest, tie, its sheen)
    cls[C.mean(2) > float(opt.get('white', 0.5))] = 0                     # white
    cls[(C[..., 0] > 0.4) & (C[..., 0] - C[..., 2] > 0.25)] = 1           # orange
    votes = np.stack([box_sum(((cls == k) & mask).astype(np.float32), WIN // 2) for k in range(3)])
    sm = votes.argmax(0)
    if MIRROR or PLUG:
        # on the front as seen from the front: the right flap laps over the left one, and the left flap runs on under
        # it; matched in 3D, a mirror point fell on that hidden underlap. So the sorts are compared on a front view
        # (1 mm cells over x and z, each holding the frontmost surface), for the texels that view shows.
        ys, xs = np.nonzero(has); Q = pos[ys, xs]; K = sm[ys, xs]
        G = 0.001; x0, z0 = -XM, neck.z - DOWN; nx, nz = int(2 * XM / G) + 1, int((DOWN + UP) / G) + 1
        ix = np.clip(((Q[:, 0] - x0) / G).astype(int), 0, nx - 1); iz = np.clip(((Q[:, 2] - z0) / G).astype(int), 0, nz - 1)
        front = Q[:, 1] < neck.y - 0.02    # (clearly the front: at the sides the view showed the inside of the collar)
        view = np.full((nz, nx), -1, np.int8); depth = np.full((nz, nx), np.inf, np.float32)
        order = np.nonzero(front)[0]; order = order[np.argsort(-Q[order, 1])]          # nearest last: it wins
        view[iz[order], ix[order]] = K[order]; depth[iz[order], ix[order]] = Q[order, 1]
        cover = view >= 0
        def spread(view):
            for _ in range(3):                                                         # empty cells: a neighbour's
                for dz, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    sh = np.roll(np.roll(view, dz, 0), dx, 1); e = view < 0; view[e] = sh[e]
        spread(view)
        seen = front & (Q[:, 1] <= depth[iz, ix] + 0.003)
    if MIRROR:
        m = view[iz, np.clip(((-Q[:, 0] - x0) / G).astype(int), 0, nx - 1)]
        n = np.where((K == 1) | (m == 1), 1, np.where((K == 0) | (m == 0), 0, 2))
        new = np.where(seen, n, K)
        print('COLLAR', img.name, 'mirror changed', int((new != K).sum()), 'of', len(K), 'texels')
        # the view as painted now (the slivers and the plug below take their sorts from it)
        view = np.full((nz, nx), -1, np.int8); view[iz[order], ix[order]] = new[order]; spread(view)
        sm[ys, xs] = new
        # (specks where the two sides' borders did not quite meet: a small majority once more)
        votes = np.stack([box_sum(((sm == k) & has).astype(np.float32), 3) for k in range(3)])
        sm = np.where(has, votes.argmax(0), sm)
        # the grown margin (no surface point): the sort of the surface texels around it
        votes = np.stack([box_sum(((sm == k) & has).astype(np.float32), GROW + 1) for k in range(3)])
        edge = mask & ~has; sm[edge] = votes.argmax(0)[edge]
    for k, name in ((0, 'white'), (1, 'orange'), (2, 'dark')):
        sel = mask & (sm == k)
        if not sel.any(): continue
        src_ = C[mask & (cls == k)]
        colour = np.percentile(src_, 70, axis=0) if k == 0 else np.median(src_, axis=0)
        P[sel, :3] = colour
        print('COLLAR', img.name, name, int(sel.sum()), 'texels to', colour.round(2).tolist())
    if PLUG:
        side = lambda c, ax, rev: (np.flip(np.maximum.accumulate(np.flip(c, ax), ax), ax) if rev else np.maximum.accumulate(c, ax))
        hole = ~cover & side(cover, 0, 0) & side(cover, 0, 1) & side(cover, 1, 0) & side(cover, 1, 1)
        # its large pieces only (single empty cells between texels are no opening)
        lab = np.zeros(hole.shape, int); big = np.zeros(hole.shape, bool); nl = 0
        for sz, sx in zip(*np.nonzero(hole)):
            if lab[sz, sx]: continue
            nl += 1; st = [(sz, sx)]; lab[sz, sx] = nl; cells = []
            while st:
                cz, cx = st.pop(); cells.append((cz, cx))
                for dz, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    qz, qx = cz + dz, cx + dx
                    if 0 <= qz < nz and 0 <= qx < nx and hole[qz, qx] and not lab[qz, qx]: lab[qz, qx] = nl; st.append((qz, qx))
            if len(cells) >= 40:
                for c in cells: big[c] = True
        plug = big.copy()
        for _ in range(2): plug |= np.roll(plug, 1, 0) | np.roll(plug, -1, 0) | np.roll(plug, 1, 1) | np.roll(plug, -1, 1)
        # depth: the surfaces around, carried into the hole (each empty cell the mean of its neighbours), 3 mm behind
        y = np.where(cover, depth, np.nan); free = plug & ~cover
        y[free] = np.nanmean(depth[cover & plug]) if (cover & plug).any() else neck.y - 0.05
        for _ in range(400):
            nb = (np.roll(y, 1, 0) + np.roll(y, -1, 0) + np.roll(y, 1, 1) + np.roll(y, -1, 1)) / 4
            y[free] = np.where(np.isnan(nb[free]), y[free], nb[free])
        y = y + 0.003
        # one texel well inside each painted sort; the opening takes, cell by cell, the sort of its mirror cell
        # (white above, the orange band below: the left band runs on down to the V like the right one)
        tex = []
        for k in range(3):
            wz, wx = np.nonzero((box_sum(((sm == k) & has).astype(np.float32), 3) == 49)); tex.append(((wx[0] + 0.5) / w_, (wz[0] + 0.5) / h_))
        def uv_at(cz, cx):
            k = view[min(max(cz, 0), nz - 1), min(max(int((-(x0 + (cx + 0.5) * G) - x0) / G), 0), nx - 1)]
            return tex[k if k >= 0 else 0]
        # front faces in the opening: slivers whose UVs cover no texel (so the view saw nothing there), painted dark;
        # recoloured they stuck out of the bands as long orange spikes, so they go and the plug behind shows
        grow2 = big.copy()
        for _ in range(4): grow2 |= np.roll(grow2, 1, 0) | np.roll(grow2, -1, 0) | np.roll(grow2, 1, 1) | np.roll(grow2, -1, 1)
        drop = []; slv = 0
        for p in o.data.polygons:
            c = mw @ p.center
            if c.y >= neck.y - 0.02: continue
            cz, cx = int((c.z - z0) / G), int((c.x - x0) / G)
            us = [uvd[li].uv for li in p.loop_indices]
            area = sum(abs((us[0] - us[k]).cross(us[k + 1] - us[0])) for k in range(1, len(us) - 1)) * w_ * h_ / 2
            if not (0 <= cz < nz and 0 <= cx < nx) or area >= 1: continue                          # (under a texel)
            if grow2[cz, cx]: drop.append(p.index); continue
            # elsewhere on the front such a sliver shows its one texel's colour (a dark spike in the white collar):
            # it takes the view's sort where all its corners agree, or (under 2 cm long) the sort at its centre
            cs = [mw @ o.data.vertices[v].co for v in p.vertices]
            ks = {view[min(max(int((c_.z - z0) / G), 0), nz - 1), min(max(int((c_.x - x0) / G), 0), nx - 1)] for c_ in cs}
            if max((a_ - b_).length for a_ in cs for b_ in cs) < 0.02: ks = {view[cz, cx]}
            if len(ks) == 1 and min(ks) >= 0:
                u = tex[ks.pop()]
                for li in p.loop_indices: uvd[li].uv = u
                slv += 1
        print('PLUG', len(drop), 'sliver faces in the opening removed,', slv, 'around it recoloured')
        kd = KDTree(len(o.data.vertices))
        for v in o.data.vertices: kd.insert(mw @ v.co, v.index)
        kd.balance()
        bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.active; inv = mw.inverted()
        bm.faces.ensure_lookup_table(); bmesh.ops.delete(bm, geom=[bm.faces[i] for i in drop], context='FACES_ONLY')
        corner, near = {}, {}
        def vert(cz, cx):
            if (cz, cx) not in corner:
                ys_ = [y[a, b] for a, b in ((cz - 1, cx - 1), (cz - 1, cx), (cz, cx - 1), (cz, cx)) if 0 <= a < nz and 0 <= b < nx and plug[a, b]]
                w = Vector((x0 + cx * G, float(np.mean(ys_)), z0 + cz * G))
                corner[(cz, cx)] = bm.verts.new(inv @ w); near[(cz, cx)] = kd.find(w)[1]
            return corner[(cz, cx)]
        faces = 0
        for cz, cx in zip(*np.nonzero(plug)):
            f = bm.faces.new([vert(cz, cx), vert(cz, cx + 1), vert(cz + 1, cx + 1), vert(cz + 1, cx)])   # facing -y: the front
            u = uv_at(cz, cx)
            for l in f.loops: l[uvl].uv = u
            faces += 1
        bm.verts.index_update(); idx = {k: v.index for k, v in corner.items()}
        bm.to_mesh(o.data); bm.free()
        for k, vi in idx.items():
            for g in o.data.vertices[near[k]].groups: o.vertex_groups[g.group].add([vi], g.weight, 'REPLACE')
        print('PLUG', int(big.sum()), 'hole cells,', faces, 'quads')
    img.pixels[:] = P.ravel(); img.pack(); done.add(img.name)
if ad:
    for t in ad.nla_tracks: t.mute = False
    ad.action = active
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_apply=False, export_image_format='AUTO')
print('RESULT', out)
