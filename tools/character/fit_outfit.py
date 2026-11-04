"""Fit a Tripo outfit (made in parts on the shared body's T-pose sheet) onto the shared layered build as item set
<set>, for any outfit: -- <shared_layers.glb> <outfit_parts.glb> <out.glb> set=h map=HAIR:0,1;TOP:2,3;BOTTOM:4;SHOES:5
       [s=1.0] [dx=0 dy=0 dz=0] [head_fit=N] [pants=1] [fill=BOTTOM] [sleeve_drape=1.0 sleeves=N,M] [seam=12>3,5] [under_tops=1] [cull=1] [lining=1 lining_skin=1 v_cut=ax,az,lx,lz,rx,rz v_paint=1] [shoe_cut=1 | shoe_level=1] [dark_lining=SHOES] [shoe_cap=1] [clean_skin=TOP] [neck_poke=1 push_neck=0] [neck_tone=1] [under_layer=1] [under_skirt=0.15] [brighten=TOP,BOTTOM despeck=1] [clean_dark=TOP clean_v=1] [predecimate=N:faces] [smooth_rims=SHOES] [make_shoes=1 shoe_top=0.03] [socks=1] [skirt=TOP skirt_leg=0.5] [stiff=0.03] [boot_top=auto] [hair_hides_scalp=0]

The common steps of add_set.py (the general's script) without its general-only fixes (docs/character-outfits.md):
- the outfit, scaled by s about the ground origin and moved by dx/dy/dz, lies on the shared body (check with
  overlay.py first);
- head_fit=N: the generated face (tripo_part_N) is fitted onto the body's face by a similarity (rotation, uniform
  scale, shift; trimmed nearest-point ICP), and HAIR and FACE move with it, not by s: generated characters keep the
  body's height but not its big head (the gat outfit: body 1.07, head 1.22);
- map= gives each slot its Tripo parts by number (tripo_part_N); every other part (the generated face, hands, bare
  legs) is dropped, since the body's own are used;
- each part is welded and its small holes (loops of at most 30 edges) filled, each patch on one texel of its rim;
- items are pushed 2 mm outside the body where they touch it (hair from 3 cm deep, so it never sinks into the scalp);
- weights come from the body by nearest surface. HAIR and FACE follow the head alone. TOP and BOTTOM take no head or
  neck weight (the chest instead: a collar near the jaw stretched as the head moved), and no arm in the top's middle.
  skirt=SLOT: that item below the belt hangs from the hips, blending to half the leg weights at the knee (a robe's
  or skirt's hem would otherwise split between the legs). Each part's weights are averaged within the part over
  stiff metres, so cloth folds smoothly instead of following every skin crease;
- body faces an item covers become pieces named body__<tokens>, hidden while it is worn. Covered goes by body
  region (each face's leading bone): the top the trunk and arms out to its sleeves' ends but never the neck, the
  bottom the hips and legs above boot_top (auto: the shoes' top less 1.5 cm), the shoes the rest. Hair hides
  nothing unless hair_hides_scalp=1 (faces under the hair within 2 cm, by rays along the normal).
Everything already in the build (items, body pieces, armature, actions) is kept as it is.
"""
import bpy, bmesh, sys, re, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from mathutils.interpolate import poly_3d_calc

a = sys.argv[sys.argv.index('--') + 1:]
src, parts_path, out = a[0], a[1], a[2]
opt = dict(x.split('=', 1) for x in a[3:])
SET = opt['set']; S = float(opt.get('s', 1.0))
OFFSET = Vector((float(opt.get('dx', 0)), float(opt.get('dy', 0)), float(opt.get('dz', 0))))
SLOT_PARTS = {slot: [f'tripo_part_{n}' for n in nums.split(',')]
              for slot, nums in (x.split(':') for x in opt['map'].split(';'))}
SKIRT = opt.get('skirt', '')
STIFF = float(opt.get('stiff', 0.03))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ad = arm.animation_data; active = ad.action
for t in ad.nla_tracks: t.mute = True
ad.action = None
for pb in arm.pose.bones: pb.matrix_basis.identity()
bpy.context.view_layer.update()
J = {b.name[len('mixamorig:'):]: arm.matrix_world @ b.head for b in arm.pose.bones}
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Icosphere')]: bpy.data.objects.remove(o)
body = [o for o in bpy.data.objects if o.type == 'MESH' and re.sub(r'\.\d+$', '', o.name).startswith('body')]

# the body as one surface (rest pose, world space) for weights, push-out and cover tests
copies = []
for o in body:
    c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
    mw = o.matrix_world.copy(); c.parent = None; c.data.transform(mw); c.matrix_world = Matrix()
    for m in list(c.modifiers): c.modifiers.remove(m)
    copies.append(c)
for x in bpy.data.objects: x.select_set(x in copies)
bpy.context.view_layer.objects.active = copies[0]; bpy.ops.object.join()
src_obj = bpy.context.view_layer.objects.active; src_obj.name = 'weight_source'
bm = bmesh.new(); bm.from_mesh(src_obj.data); bm.normal_update()
body_bvh = BVHTree.FromBMesh(bm)
body_fn = [f.normal.copy() for f in bm.faces]
bm.free()

# the outfit's parts, scaled and moved onto the body; parts no slot names are dropped
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=parts_path)
new = [o for o in bpy.data.objects if o not in before]
wanted = {n for names in SLOT_PARTS.values() for n in names}
HEAD_FIT = f"tripo_part_{opt['head_fit']}" if opt.get('head_fit') else None
head_slots = {n for slot in ('HAIR', 'FACE') for n in SLOT_PARTS.get(slot, [])} if HEAD_FIT else set()
parts, face = {}, None
for o in new:
    if o.type != 'MESH': continue
    name = re.sub(r'\.\d+$', '', o.name)
    if name not in wanted and name != HEAD_FIT: continue
    o.data.transform(o.matrix_world if name in head_slots or name == HEAD_FIT
                     else Matrix.Translation(OFFSET) @ Matrix.Diagonal((S, S, S, 1)) @ o.matrix_world)
    o.parent = None; o.matrix_world = Matrix()
    if name == HEAD_FIT: face = o
    else: parts[name] = o
for o in new:
    if o.name in bpy.data.objects and o not in parts.values() and o is not face: bpy.data.objects.remove(o)
missing = wanted - set(parts)
if missing: raise SystemExit(f'map= names parts the file does not have: {sorted(missing)}')
if HEAD_FIT:
    # the body's face: head vertices (above the neck) in front of the head's middle
    BP = np.array([tuple(v.co) for v in src_obj.data.vertices])
    hd = BP[BP[:, 2] > J['Neck'].z + 0.02]; front = hd[hd[:, 1] < (hd[:, 1].min() + hd[:, 1].max()) / 2]
    M = np.array([tuple(v.co) for v in face.data.vertices]); M = M[::max(1, len(M) // 4000)]
    # start: the face's height scaled to the body face's, centred on it and set at its front
    R_ = np.eye(3) * ((front[:, 2].max() - front[:, 2].min()) / (M[:, 2].max() - M[:, 2].min()))
    t_ = (front.min(0) + front.max(0)) / 2 - R_ @ ((M.min(0) + M.max(0)) / 2); t_[1] = front[:, 1].min() - (R_ @ M.T).T[:, 1].min()
    for _ in range(80):
        X = M @ R_.T + t_; Y = np.array([tuple(body_bvh.find_nearest(Vector(x))[0]) for x in X]); d_ = np.linalg.norm(X - Y, axis=1)
        m_ = d_ < max(0.003, 2.5 * np.median(d_)); Xm, Ym = X[m_], Y[m_]; mx, my = Xm.mean(0), Ym.mean(0)
        U_, S_, Vt_ = np.linalg.svd((Ym - my).T @ (Xm - mx) / len(Xm)); E_ = np.diag([1, 1, np.sign(np.linalg.det(U_ @ Vt_))])
        Rr = U_ @ E_ @ Vt_; sc_ = np.trace(np.diag(S_) @ E_) / ((Xm - mx) ** 2).sum(1).mean()
        R_, t_ = sc_ * Rr @ R_, sc_ * Rr @ (t_ - mx) + my
    for n in head_slots:
        o = parts[n]
        for v in o.data.vertices: v.co = Vector(R_ @ np.array(v.co) + t_)
        o.data.update()
    print('HEAD fit: scale', round(float(np.cbrt(np.linalg.det(R_))), 3), 'shift', (100 * t_).round(1).tolist(), 'cm, median gap',
          round(1000 * float(np.median(d_)), 1), 'mm')
    bpy.data.objects.remove(face)
print('PARTS', {slot: names for slot, names in SLOT_PARTS.items()})

def fill_small_holes(o, max_edges=30):
    """Weld the part (the import split it along UV seams) and fill its small open loops; each patch takes the UV
    of the rim corner whose texel is nearest the rim's median colour (per-corner UVs smeared it into streaks)."""
    img = next((n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
    w_, h_ = img.size if img else (1, 1)
    P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1) if img else None
    tex = lambda u: P[min(h_ - 1, max(0, int(u.y * h_))), min(w_ - 1, max(0, int(u.x * w_))), :3]
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    uv = bm.loops.layers.uv.active
    old = set(bm.faces)
    seen, fill = set(), []
    for e in [e for e in bm.edges if e.is_boundary]:
        if e in seen: continue
        stack, comp = [e], []
        while stack:
            x = stack.pop()
            if x in seen: continue
            seen.add(x); comp.append(x)
            for v in x.verts:
                for y in v.link_edges:
                    if y.is_boundary and y not in seen: stack.append(y)
        if len(comp) <= max_edges: fill += comp
    if fill: bmesh.ops.holes_fill(bm, edges=fill, sides=max_edges + 1)
    newf = [f for f in bm.faces if f not in old]
    if newf:
        bmesh.ops.triangulate(bm, faces=newf, quad_method='BEAUTY', ngon_method='BEAUTY')
        newf = [f for f in bm.faces if f not in old]
    if newf and uv and P is not None:
        # one UV per patch (connected new faces), from its rim corners
        todo = set(newf)
        while todo:
            f0 = todo.pop(); patch = [f0]; stack = [f0]
            while stack:
                f = stack.pop()
                for e in f.edges:
                    for g in e.link_faces:
                        if g in todo: todo.discard(g); patch.append(g); stack.append(g)
            rim = [l[uv].uv.copy() for f in patch for v in f.verts for l in v.link_loops if l.face in old]
            if not rim: continue
            cols = np.array([tex(u) for u in rim]); med = np.median(cols, 0)
            best = rim[int(np.argmin(((cols - med) ** 2).sum(1)))]
            for f in patch:
                for l in f.loops: l[uv].uv = best
    bm.to_mesh(o.data); bm.free()
    return len(newf)
for n, o in parts.items():
    k = fill_small_holes(o)
    if k: print('FILL', n, k, 'faces')
# predecimate=N:faces,...: simple parts made dense by Tripo (the gat's hat, 26k faces) are cut down first, so the
# game file's triangle budget goes to the clothes (the dopo's collar came out ragged at 40k triangles in all)
for spec in [x for x in opt.get('predecimate', '').split(',') if x]:
    n, faces = spec.split(':'); o = parts[f'tripo_part_{n}']
    before_ = len(o.data.polygons)
    md = o.modifiers.new('dec', 'DECIMATE'); md.ratio = min(1.0, int(faces) / max(1, before_)); md.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='dec')
    print('PREDECIMATE', n, before_, '->', len(o.data.polygons))

# cull=1: within one slot, faces lying under another of its parts (every corner covered within cull_gap, 6 mm, along
# the face's normal) are deleted. The dopo's upper body overlaps its skirt at the waist; decimated for the game the
# two surfaces crossed and their crossing showed as a ragged grey seam (user).
if opt.get('cull', '0') == '1':
    gap = float(opt.get('cull_gap', 0.006))
    for slot, names in SLOT_PARTS.items():
        trees = {}
        for n in names:
            tb = bmesh.new(); tb.from_mesh(parts[n].data); trees[n] = BVHTree.FromBMesh(tb); tb.free()
        for n in names:
            o = parts[n]; cb = bmesh.new(); cb.from_mesh(o.data); cb.normal_update()
            dead = []
            for f in cb.faces:
                nrm = f.normal
                if nrm.length < 0.5: continue
                for m, t in trees.items():
                    if m == n: continue
                    if all(t.ray_cast(v.co + nrm * 0.0005, nrm, gap)[0] is not None for v in f.verts) and                        t.ray_cast(f.calc_center_median() + nrm * 0.0005, nrm, gap)[0] is not None:
                        dead.append(f); break
            if dead:
                bmesh.ops.delete(cb, geom=dead, context='FACES'); cb.to_mesh(o.data); print('CULL', n, len(dead), 'faces under other parts')
            cb.free()

# one item per slot
G = {}
for slot, names in SLOT_PARTS.items():
    objs = [parts[n] for n in names]
    for o, n in zip(objs, names):
        o.vertex_groups.new(name='part:' + n).add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    for x in bpy.data.objects: x.select_set(x in objs)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join()
    it = bpy.context.view_layer.objects.active; it.name = f'item__{slot}__{SET}'; G[slot] = it
    print('ITEM', it.name, len(it.data.polygons), 'faces')

# brighten=TOP,BOTTOM (the gat's white dopo and baji): Tripo's whites came out grey, darker than the sheet's (user:
# make it like the sheet). In the slots' images the light texels (brighter than 0.45) are lifted toward white by
# brighten_k (0.35 of the way), the dark ones (hat, shoes, hair) left alone.
_done_img = set()
for slot in [x for x in opt.get('brighten', '').split(',') if x and x in G]:
    for m in G[slot].data.materials:
        for n in m.node_tree.nodes:
            if n.type != 'TEX_IMAGE' or not n.image or n.image.name in _done_img: continue
            img = n.image; _done_img.add(img.name); w_, h_ = img.size
            P = np.array(img.pixels[:], np.float32).reshape(h_ * w_, -1)
            lum = P[:, :3].mean(1); k = float(opt.get('brighten_k', 0.35)) * np.clip((lum - 0.45) / 0.2, 0, 1)
            P[:, :3] += (1 - P[:, :3]) * k[:, None]
            # despeck=1: Tripo's grey dots on the white cloth (user: like the sheet) are pixels darker by despeck_d
            # (0.1) than their neighbourhood (a box of despeck_r, 10 px) where that neighbourhood is light (over 0.7);
            # they take the neighbourhood's colour
            if opt.get('despeck', '0') == '1':
                r_ = int(opt.get('despeck_r', 10)); Q = P[:, :3].reshape(h_, w_, 3)
                S = np.pad(Q, ((r_ + 1, r_), (r_ + 1, r_), (0, 0)), mode='edge').cumsum(0).cumsum(1)
                Bx = (S[2 * r_ + 1:, 2 * r_ + 1:] - S[:-2 * r_ - 1, 2 * r_ + 1:] - S[2 * r_ + 1:, :-2 * r_ - 1] + S[:-2 * r_ - 1, :-2 * r_ - 1]) / (2 * r_ + 1) ** 2
                bl, ql = Bx.mean(2), Q.mean(2)
                sp = (bl > 0.7) & (ql < bl - float(opt.get('despeck_d', 0.1)))
                Q[sp] = Bx[sp]; P[:, :3] = Q.reshape(-1, 3)
                print('DESPECK', int(sp.sum()), 'pixels')
            img.pixels[:] = P.ravel(); img.update(); img.pack()
            print('BRIGHTEN', slot, img.name, w_, 'x', h_)

if opt.get('boot_top', 'auto') == 'auto':
    boot_top = (max(v.co.z for v in G['SHOES'].data.vertices) - 0.015) if 'SHOES' in G else 0.0
else:
    boot_top = float(opt['boot_top'])
TOP_BONES = {'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'}
BOTTOM_BONES = {'Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'}
FOOT_BONES = {'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftToe_End', 'RightToe_End'}
def leading_bones(o):
    gname = {g.index: g.name[len('mixamorig:'):] for g in o.vertex_groups if g.name.startswith('mixamorig:')}
    return [max(((e.weight, gname[e.group]) for e in v.groups if e.group in gname), default=(0, ''))[1] for v in o.data.vertices]

def lit_texel(it, pct=80):
    """The UV of the item's lit cloth colour: the texel nearest the median of its brightest fifth (the brighter half
    read grey). pct=50: its middle tone."""
    img = next(n.image for m in it.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
    uvd = it.data.uv_layers.active.data
    cs = np.array([P[min(h_ - 1, int(uvd[li].uv[1] * h_)), min(w_ - 1, int(uvd[li].uv[0] * w_))] for li in range(0, len(uvd), 7)])
    light = cs[cs.mean(1) >= np.percentile(cs.mean(1), pct)]; med = np.median(light, 0)
    return tuple(uvd[int(np.argmin(((cs - med) ** 2).sum(1))) * 7].uv), med

def on_texel(o, like, uv0):
    """o's faces on one texel of item `like`'s own material and UV layer."""
    o.data.materials.clear(); o.data.materials.append(like.data.materials[0])
    name = like.data.uv_layers.active.name
    for u in list(o.data.uv_layers): o.data.uv_layers.remove(u)
    lay = o.data.uv_layers.new(name=name)
    for d in lay.data: d.uv = uv0

# pants=1 (the gat's baji): the trousers are made from the body itself, not from Tripo. Tripo's baji stopped at the
# robe's hem and its lower legs were bulky with ragged tops; filled from the body above them, the two met in a step
# with white shards along the seam (user: "the trousers look too strange"). Here every body face the bottom hides
# (the same region rule as the cover below) is let out from its leg's axis by a loose profile: snug at the hips,
# full at the thighs and knees (pants_full, 1.45), gathered at the ankle; the inner side lets out less
# (pants_inner, 0.35 of it) so the legs do not cross. Smoothed, on one texel of Tripo's own baji colour.
if opt.get('pants', '0') == '1' and 'BOTTOM' in G:
    old = G['BOTTOM']; uv0, med = lit_texel(old)
    lead = leading_bones(src_obj)
    cut_z = boot_top + float(opt.get('pants_cut', 0.03)); hem_z = boot_top - float(opt.get('pants_hem', 0.005))
    pick = []
    for p in src_obj.data.polygons:
        votes = {}
        for vi in p.vertices: votes[lead[vi]] = votes.get(lead[vi], 0) + 1
        bone_ = max(votes, key=votes.get)
        # (and the ankle's front above the cut: the foot leads there up to 4 cm over the shoes' rim, and without it
        # the cut ring had a toothed hole above it)
        if (bone_ in BOTTOM_BONES and p.center.z > boot_top) or (bone_ in FOOT_BONES and p.center.z > cut_z - 0.008):
            pick.append(p.index)
    # the waist: the region's top is a sawtooth too. It is cut level just over its highest tooth (waist_cut), the
    # trunk's faces up to there taken in, so the pants still cover every body face they hide.
    hip_z = J['LeftUpLeg'].z
    pk = set(pick); ecount = {}
    for i in pick:
        for ek in src_obj.data.polygons[i].edge_keys: ecount[ek] = ecount.get(ek, 0) + 1
    top_z = max(src_obj.data.vertices[vi].co.z for ek, n in ecount.items() if n == 1 for vi in ek
                if src_obj.data.vertices[vi].co.z > hip_z)
    waist_cut = top_z + 0.004
    for p in src_obj.data.polygons:
        if p.index in pk: continue
        votes = {}
        for vi in p.vertices: votes[lead[vi]] = votes.get(lead[vi], 0) + 1
        if max(votes, key=votes.get) in TOP_BONES and hip_z < p.center.z < waist_cut + 0.015: pick.append(p.index)
    pt = src_obj.copy(); pt.data = src_obj.data.copy(); bpy.context.scene.collection.objects.link(pt)
    pb_ = bmesh.new(); pb_.from_mesh(pt.data); pb_.faces.ensure_lookup_table(); keep_ = set(pick)
    bmesh.ops.delete(pb_, geom=[f for f in pb_.faces if f.index not in keep_], context='FACES')
    bmesh.ops.remove_doubles(pb_, verts=pb_.verts, dist=1e-5)
    for _ in range(3): bmesh.ops.smooth_vert(pb_, verts=[v for v in pb_.verts if not v.is_boundary], factor=0.5,
                                             use_axis_x=True, use_axis_y=True, use_axis_z=True)
    FULL, INNER = float(opt.get('pants_full', 1.45)), float(opt.get('pants_inner', 0.35))
    LOW = float(opt.get('pants_low', 0))
    hip_z, ankle_z = J['LeftUpLeg'].z, J['LeftFoot'].z
    def profile(z):
        t = (z - ankle_z) / (hip_z - ankle_z)
        pts = [(-1, 1.04), (0.0, 1.04), (0.1, 1.3), (0.45, FULL), (0.85, FULL * 0.9), (1.0, 1.2), (1.3, 1.08), (9, 1.08)]
        # pants_low=k (the gat's baji, like the sheet's): full right down to the ankle, gathered there (k at 8 % of
        # the leg over the ankle), instead of a straight tube under the robe
        if LOW: pts = [(-1, 1.04), (0.0, 1.04), (0.08, LOW), (0.3, max(LOW, FULL * 0.95)), (0.45, FULL), (0.85, FULL * 0.9), (1.0, 1.2), (1.3, 1.08), (9, 1.08)]
        for (t0, f0), (t1, f1) in zip(pts, pts[1:]):
            if t <= t1: return f0 + (f1 - f0) * (t - t0) / (t1 - t0)
    def axis_point(co):
        side = 'Left' if co.x > 0 else 'Right'
        if co.z >= hip_z: return Vector((0.0, J['Hips'].y, co.z))        # the hips: about the body's own vertical axis
        a0, a1 = (J[f'{side}UpLeg'], J[f'{side}Leg']) if co.z >= J[f'{side}Leg'].z else (J[f'{side}Leg'], J[f'{side}Foot'])
        ax = (a1 - a0); t = max(0.0, min(1.0, (co - a0).dot(ax) / ax.length_squared))
        return a0 + ax * t
    for v in pb_.verts:
        c0 = axis_point(v.co); off = v.co - c0
        f = profile(v.co.z)
        # inward (toward the midline, below the hips) lets out less
        if v.co.z < hip_z and off.x * v.co.x < 0:
            f = 1 + (f - 1) * INNER
        v.co = c0 + off * f
    bmesh.ops.bisect_plane(pb_, geom=pb_.verts[:] + pb_.edges[:] + pb_.faces[:], plane_co=(0, 0, waist_cut), plane_no=(0, 0, 1), clear_outer=True)
    # the hem: the body's own cut over the shoes' rim is a sawtooth up to a face's height (1.5 cm). The legs are cut
    # level pants_cut (3 cm) over the rim, above every tooth, and each leg's cut ring is carried straight down to
    # pants_hem (5 mm) under the rim, let out a little (pants_flare) so the hem lies over the shoe's opening
    # (remapping the teeth level left strands; taking the ankles too covered the feet; a hem drawn in under the rim
    # showed through low shoes' openings as stripes).
    bmesh.ops.bisect_plane(pb_, geom=pb_.verts[:] + pb_.edges[:] + pb_.faces[:], plane_co=(0, 0, cut_z), plane_no=(0, 0, 1), clear_inner=True)
    ring = [e for e in pb_.edges if e.is_boundary and all(v.co.z < cut_z + 1e-4 for v in e.verts)]
    ext = bmesh.ops.extrude_edge_only(pb_, edges=ring)
    hem = [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]
    for v in hem:
        c0 = axis_point(Vector((v.co.x, v.co.y, hem_z))); v.co = c0 + (Vector((v.co.x, v.co.y, hem_z)) - c0) * float(opt.get('pants_flare', 1.0))
    loops = sum(1 for e in pb_.edges if e.is_boundary and all(abs(v.co.z - hem_z) < 1e-4 for v in e.verts))
    # (the extruded band's faces came out wound either way: their flipped normals shaded as stripes)
    bmesh.ops.recalc_face_normals(pb_, faces=pb_.faces[:])
    pb_.normal_update()
    for v in pb_.verts: v.co += v.normal * 0.003
    # (the cut ring and the hem band stay out of the smoothing: pulled between the leg and the hem, they went ragged)
    for _ in range(4): bmesh.ops.smooth_vert(pb_, verts=[v for v in pb_.verts if not v.is_boundary and v.co.z > cut_z + 0.004],
                                             factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    print('PANTS waist cut level at z', round(waist_cut, 3))
    print('PANTS hem', len(hem), 'vertices (', loops, 'edges ) cut at z', round(cut_z, 3), 'down to', round(hem_z, 3), '; cut ring', len(ring), 'edges')
    pb_.to_mesh(pt.data); pb_.free()
    for g in list(pt.vertex_groups): pt.vertex_groups.remove(g)
    on_texel(pt, old, uv0)
    pt.vertex_groups.new(name='part:pants').add(list(range(len(pt.data.vertices))), 1.0, 'REPLACE')
    name = old.name; bpy.data.objects.remove(old); pt.name = name; G['BOTTOM'] = pt
    print('PANTS', len(pick), 'body faces, colour', med.round(2).tolist())

# fill=BOTTOM (the gat's trousers): Tripo makes only what the sheet shows, so trousers under a long robe stop at the
# robe's hem; worn with a short top the hidden hips and thighs were holes (the body is hidden under the whole
# bottom). The body faces the bottom hides but its own geometry does not cover (no hit within 4 cm along the
# normal) become cloth fill_gap out (1 cm), smoothed, on one texel of the item's own lit cloth colour.
for slot in [x for x in opt.get('fill', '').split(',') if x]:
    it = G[slot]
    ib = bmesh.new(); ib.from_mesh(it.data); item_bvh = BVHTree.FromBMesh(ib); ib.free()
    lead = leading_bones(src_obj)
    region = BOTTOM_BONES if slot == 'BOTTOM' else TOP_BONES
    pick = []
    for p in src_obj.data.polygons:
        votes = {}
        for vi in p.vertices: votes[lead[vi]] = votes.get(lead[vi], 0) + 1
        if max(votes, key=votes.get) not in region or p.center.z <= boot_top: continue
        if item_bvh.ray_cast(p.center + p.normal * 0.001, p.normal, 0.04)[0] is not None: continue
        pick.append(p.index)
    fl = src_obj.copy(); fl.data = src_obj.data.copy(); bpy.context.scene.collection.objects.link(fl)
    fb = bmesh.new(); fb.from_mesh(fl.data); fb.faces.ensure_lookup_table(); keep_ = set(pick)
    bmesh.ops.delete(fb, geom=[f for f in fb.faces if f.index not in keep_], context='FACES')
    fb.normal_update()
    gap = float(opt.get('fill_gap', 0.01))
    for v in fb.verts: v.co += v.normal * gap
    for _ in range(4): bmesh.ops.smooth_vert(fb, verts=[v for v in fb.verts if not v.is_boundary], factor=0.5,
                                             use_axis_x=True, use_axis_y=True, use_axis_z=True)
    fb.to_mesh(fl.data); fb.free()
    for g in list(fl.vertex_groups): fl.vertex_groups.remove(g)
    uv0, med = lit_texel(it); on_texel(fl, it, uv0)
    fl.vertex_groups.new(name='part:fill_' + slot).add(list(range(len(fl.data.vertices))), 1.0, 'REPLACE')
    for x in bpy.data.objects: x.select_set(x in (it, fl))
    bpy.context.view_layer.objects.active = it; bpy.ops.object.join()
    print('FILL', slot, len(pick), 'body faces as cloth, colour', med.round(2).tolist())

# sleeve_drape=k (the gat's dopo): a wide sleeve made on the T-pose hangs below the horizontal arm; with the arms
# down that drape swung out behind and beside the arm as a flat wing (user saw it from the side). Beyond the
# shoulder joint, how far the sleeve parts (sleeves=N,M) hang below the arm's axis (past the arm's own radius,
# drape_r) is scaled by k. (Applied to the whole top it lifted the robe's skirt too.)
DRAPE = float(opt.get('sleeve_drape', 1.0))
if DRAPE != 1.0 and 'TOP' in G:
    r0 = float(opt.get('drape_r', 0.045)); n_ = 0
    sg = {G['TOP'].vertex_groups['part:tripo_part_' + n].index for n in opt['sleeves'].split(',')}
    for v in G['TOP'].data.vertices:
        if not any(e.group in sg for e in v.groups): continue
        side = 'Left' if v.co.x > 0 else 'Right'
        sh, hd = J[f'{side}Arm'], J[f'{side}Hand']
        if abs(v.co.x) < abs(sh.x): continue
        ax = (hd - sh).normalized(); t = (v.co - sh).dot(ax); foot = sh + ax * t
        off = v.co - foot
        if off.z < -r0:
            k = min(1.0, (abs(v.co.x) - abs(sh.x)) / 0.04)          # fading in over 4 cm past the joint
            v.co.z = foot.z - r0 + (off.z + r0) * (1 - k + k * DRAPE); n_ += 1
    print('DRAPE', n_, 'sleeve vertices, scale', DRAPE)

# seam=A>B,C;..: (the gat's dopo) where the robe's upper part (A) ends over its sleeves (B, C) its open edge stood
# 1-2 cm off them and the slit showed the inside, dark (user). Part A's open-edge vertices within seam_d (3 cm) of
# parts B, C are moved onto them (1 mm out along their surface), the rows behind them following by half and a
# quarter: the edge lies on the sleeve and the slit closes.
for spec in [x for x in opt.get('seam', '').split(';') if x]:
    if 'TOP' not in G: break
    src_n, dst_ns = spec.split('>'); it = G['TOP']
    sb_ = bmesh.new(); sb_.from_mesh(it.data); dl = sb_.verts.layers.deform.active
    gi = lambda n: it.vertex_groups['part:tripo_part_' + n].index
    a_i = gi(src_n); d_is = {gi(n) for n in dst_ns.split(',')}
    in_a = lambda v: a_i in v[dl].keys()
    dst_faces = [f for f in sb_.faces if any(g in d_is for g in f.verts[0][dl].keys())]
    tb_ = bmesh.new()
    vm = {}
    for f in dst_faces:
        for v in f.verts:
            if v not in vm: vm[v] = tb_.verts.new(v.co)
        try: tb_.faces.new([vm[v] for v in f.verts])
        except ValueError: pass
    tb_.normal_update(); dbvh = BVHTree.FromBMesh(tb_)
    sd = float(opt.get('seam_d', 0.03)); moved = {}
    for v in sb_.verts:
        if not (v.is_boundary and in_a(v)): continue
        loc, nrm, _, dist_ = dbvh.find_nearest(v.co)
        if loc is None or dist_ > sd: continue
        outn = nrm if nrm.dot(v.co - loc) >= 0 else -nrm
        moved[v] = loc + outn * 0.001 - v.co
    ring = dict(moved)
    for k_ in (0.5, 0.25):                         # (the rows behind the edge follow, less and less)
        nxt = {}
        for v, d_ in ring.items():
            for e in v.link_edges:
                u = e.other_vert(v)
                if in_a(u) and u not in moved and u not in nxt: nxt[u] = d_ * k_ / (0.5 if k_ == 0.25 else 1)
        for u, d_ in nxt.items(): moved[u] = d_
        ring = nxt
    for v, d_ in moved.items(): v.co += d_
    sb_.to_mesh(it.data); sb_.free(); tb_.free()
    print('SEAM part', src_n, 'onto', dst_ns, ':', len(moved), 'vertices moved')


# lining=1 (the gat's dopo): inside a V neck the hidden chest's sawtooth edge and the robe's grey inner layer showed
# (user: the neck looked crooked). The body round the neck's foot (within lining_r 9 cm of the neck's axis, from
# lining_down 10 cm under the neck joint) becomes a lining just off the skin, cut level lining_up (6 mm) over the joint,
# on the top's lit cloth texel: a clean inner collar.
_skin_cache = {}
def skin_texel(it):
    """The UV of item it's atlas texel nearest the body's neck skin (the median colour of the faces the Neck
    joint leads), on an even patch so the baked atlas keeps it: what neck_tone and lining_tone=skin paint with."""
    if 'uv' in _skin_cache: return _skin_cache['uv']
    cols = []
    for o in body:
        img_ = next((n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
        if not img_: continue
        w2, h2 = img_.size; PB = np.array(img_.pixels[:], np.float32).reshape(h2, w2, -1)[..., :3]
        lead = leading_bones(o); uvb = o.data.uv_layers.active.data
        for p in o.data.polygons:
            if sum(lead[vi] == 'Neck' for vi in p.vertices) * 2 <= len(p.vertices): continue
            u_ = np.mean([tuple(uvb[l].uv) for l in p.loop_indices], 0)
            cols.append(PB[min(h2 - 1, max(0, int(u_[1] * h2))), min(w2 - 1, max(0, int(u_[0] * w2)))])
    target = np.median(np.array(cols), 0) if cols else np.array([0.73, 0.52, 0.43])
    img = next(n.image for m in it.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
    st = 4; Ps = P[::st, ::st]; loc_var = np.zeros(Ps.shape[:2], np.float32)
    for dy in (-2, -1, 1, 2):
        for dx in (-2, -1, 1, 2):
            loc_var = np.maximum(loc_var, np.abs(np.roll(np.roll(Ps, dy, 0), dx, 1) - Ps).sum(2))
    dist = ((Ps - target) ** 2).sum(2) + (loc_var > 0.03) * 10
    yy, xx = np.unravel_index(int(np.argmin(dist)), dist.shape)
    _skin_cache['uv'] = ((xx * st + 0.5) / w_, (yy * st + 0.5) / h_)
    print('SKIN neck', target.round(3).tolist(), '-> texel', Ps[yy, xx].round(3).tolist(), 'from', len(cols), 'faces')
    return _skin_cache['uv']

if opt.get('lining', '0') == '1' and 'TOP' in G:
    nz, nx, ny = J['Neck'].z, J['Neck'].x, J['Neck'].y
    r_, down_, up_ = float(opt.get('lining_r', 0.09)), float(opt.get('lining_down', 0.1)), float(opt.get('lining_up', 0.006))
    # (front only, where a V opens: round the back it came through the dopo's back as grey patches, user)
    pick = [p.index for p in src_obj.data.polygons
            if nz - down_ < p.center.z < nz + up_ + 0.02 and math.hypot(p.center.x - nx, p.center.y - ny) < r_
            and p.center.y < ny - float(opt.get('lining_front', 0.01))]
    ln = src_obj.copy(); ln.data = src_obj.data.copy(); bpy.context.scene.collection.objects.link(ln)
    lb = bmesh.new(); lb.from_mesh(ln.data); lb.faces.ensure_lookup_table(); keep_ = set(pick)
    bmesh.ops.delete(lb, geom=[f for f in lb.faces if f.index not in keep_], context='FACES')
    bmesh.ops.remove_doubles(lb, verts=lb.verts, dist=1e-5)
    bmesh.ops.bisect_plane(lb, geom=lb.verts[:] + lb.edges[:] + lb.faces[:], plane_co=(0, 0, nz + up_), plane_no=(0, 0, 1), clear_outer=True)
    lb.normal_update()
    for v in lb.verts: v.co += v.normal * float(opt.get('lining_gap', 0.0003))
    # only where it stays under the top: 1 mm off the skin (lining_gap), and dropped where the top lies closer to the
    # body than that (2.5 mm out, all round the neck it came out over the dopo's collar; dropped wherever the collar
    # was near, its sides showed ragged inside the V)
    # the top's own inner layer in the V (Tripo painted a shirt there; decimated it went grey and ragged): its faces
    # in front of the neck lying within lining_cull of the body are deleted, the lining shows instead (off by default:
    # at 6 mm it took the dopo's lapels too)
    cb = bmesh.new(); cb.from_mesh(G['TOP'].data); cb.normal_update(); gone = []
    for f in (cb.faces if float(opt.get('lining_cull', 0)) > 0 else []):
        c = f.calc_center_median()
        if not (nz - down_ < c.z < nz + up_ + 0.02 and math.hypot(c.x - nx, c.y - ny) < r_ and c.y < ny - 0.01): continue
        loc, _, _, d = body_bvh.find_nearest(c)
        if loc is not None and d < float(opt.get('lining_cull', 0.006)): gone.append(f)
    # lining_skin=1: the V's inside faces Tripo painted as skin (redder than their green by lining_skin_r, 0.06) are
    # deleted, the lapels (white) kept; the lining shows behind them instead of a pink and grey patchwork
    if opt.get('lining_skin', '0') == '1':
        img = next(n.image for m in G['TOP'].data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
        w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
        uvl = cb.loops.layers.uv.active
        for f in cb.faces:
            c = f.calc_center_median()
            if not (nz - 0.08 < c.z < nz + 0.02 and math.hypot(c.x - nx, c.y - ny) < r_ and c.y < ny - 0.01): continue
            u = sum((l[uvl].uv for l in f.loops), Vector((0, 0))) / len(f.loops)
            px = P[min(h_ - 1, max(0, int(u.y * h_))), min(w_ - 1, max(0, int(u.x * w_)))]
            if px[0] - px[1] > float(opt.get('lining_skin_r', 0.06)): gone.append(f)
    bmesh.ops.delete(cb, geom=gone, context='FACES')
    # v_cut=ax,az,lx,lz,rx,rz (metres, read off a straight front render): the V's two edges were ragged, lapel teeth
    # and spikes (user: the collar is not smooth or straight). The top is cut along the two lines from the V's foot A
    # to its upper corners L and R (planes along the depth axis) and its front faces inside the wedge are deleted: two
    # straight edges, the lining showing between them.
    if opt.get('v_cut'):
        ax, az, lx, lz, rx, rz = map(float, opt['v_cut'].split(','))
        # (v_cut_up, 3 cm: how far over the corners the cut reaches; above them is the collar band round the neck,
        # cut there it broke off at the neck's sides, user)
        A = Vector((ax, 0, az)); top_z = max(lz, rz) + (0.0 if opt.get('v_paint', '0') == '1' else float(opt.get('v_cut_up', 0.03)))
        near = lambda c: az - 0.01 < c.z < top_z and c.y < ny + 0.01 and abs(c.x - ax) < 0.12
        for X, Z in ((lx, lz), (rx, rz)):
            n_ = (Vector((X, 0, Z)) - A).cross(Vector((0, 1, 0))).normalized()
            fs = [f for f in cb.faces if near(f.calc_center_median())]
            g = list({e for f in fs for e in f.edges}) + list({v for f in fs for v in f.verts}) + fs
            bmesh.ops.bisect_plane(cb, geom=g, plane_co=A, plane_no=n_)
        xl = lambda z: ax + (lx - ax) * (z - az) / (lz - az); xr = lambda z: ax + (rx - ax) * (z - az) / (rz - az)
        wedge = [f for f in cb.faces for c in [f.calc_center_median()]
                 if az < c.z < top_z and c.y < ny and xl(c.z) + 1e-5 < c.x < xr(c.z) - 1e-5]
        # (v_paint=1: kept, painted skin later; cut out, Tripo's collar band broke off at the neck's sides, user)
        if opt.get('v_paint', '0') != '1': bmesh.ops.delete(cb, geom=wedge, context='FACES')
        print('V cut', len(wedge), 'top faces inside the V; neck joint at', round(nx, 3), round(ny, 3), round(nz, 3))
    cb.to_mesh(G['TOP'].data); cb.free()
    print('LINING inner layer', len(gone), 'top faces deleted')
    tb = bmesh.new(); tb.from_mesh(G['TOP'].data); top_bvh = BVHTree.FromBMesh(tb); tb.free()
    lb.normal_update()
    dead = [f for f in lb.faces if top_bvh.ray_cast(f.calc_center_median(), -f.normal, 0.006)[0] is not None]
    # (with v_cut the lining is needed only inside the V: outside it, where the lapels lie on the skin, it came through
    # them as pink teeth along the edges)
    if opt.get('v_cut'):
        m_ = float(opt.get('v_cut_margin', 0.004))
        inside = lambda c: xl(max(c.z, az)) - m_ < c.x < xr(max(c.z, az)) + m_
        # (inside the V the top is gone, so the ray only met deeper layers there and left holes at the V's foot)
        dead = [f for f in lb.faces if not inside(f.calc_center_median())
                or (f in set(dead) and f.calc_center_median().z < az - 0.005)]
    bmesh.ops.delete(lb, geom=dead, context='FACES')
    lb.to_mesh(ln.data); lb.free()
    for g in list(ln.vertex_groups): ln.vertex_groups.remove(g)
    # (the top's middle tone: on its lit white the lapels' shaded inner edges stood out as teeth)
    # lining_tone=skin (the gat's dopo, like Tripo's own: the V shows the chest's skin running on from the neck;
    # the white "shirt" in it read as a separate band, user)
    if opt.get('lining_tone') == 'skin': on_texel(ln, G['TOP'], skin_texel(G['TOP']))
    else:
        uv0, med = lit_texel(G['TOP'], float(opt.get('lining_tone', 40))); on_texel(ln, G['TOP'], uv0)
    ln.vertex_groups.new(name='part:lining').add(list(range(len(ln.data.vertices))), 1.0, 'REPLACE')
    if opt.get('lining_tone') == 'skin' and opt.get('neck_tone', '0') == '1':
        # (in skin, with neck_tone the body's own faces under the V are shown in place instead (see neck_tone): a
        # lining 0.3 mm off them left its top edge as a pale line round the neck's foot, user)
        bpy.data.objects.remove(ln)
    else:
        for x in bpy.data.objects: x.select_set(x in (G['TOP'], ln))
        bpy.context.view_layer.objects.active = G['TOP']; bpy.ops.object.join()
    print('LINING', len(pick), 'body faces round the neck,', len(dead), 'under the top dropped; top level at z', round(nz + up_, 3))

# shoe_cut=1 (the gat's low shoes): Tripo's opening rim was ragged, a row of teeth round the ankle. The shoes are cut
# level shoe_cut_up (8 mm) over the bottom's hem line, so the rim is a clean edge the trousers go into.
if opt.get('shoe_cut', '0') == '1' and 'SHOES' in G:
    sb = bmesh.new(); sb.from_mesh(G['SHOES'].data)
    zc = boot_top + float(opt.get('shoe_cut_up', 0.008))
    bmesh.ops.bisect_plane(sb, geom=sb.verts[:] + sb.edges[:] + sb.faces[:], plane_co=(0, 0, zc), plane_no=(0, 0, 1))
    # only the collar round the ankle (within shoe_cut_r of the ankle's axis) goes: cut all round, the vamp over the
    # instep went too and the shoes looked holed (user)
    rr = float(opt.get('shoe_cut_r', 0.05)); dead = []
    for f in sb.faces:
        c = f.calc_center_median(); ft = J['LeftFoot' if c.x > 0 else 'RightFoot']
        if c.z > zc and math.hypot(c.x - ft.x, c.y - ft.y) < rr: dead.append(f)
    bmesh.ops.delete(sb, geom=dead, context='FACES')
    sb.to_mesh(G['SHOES'].data); sb.free()
    print('SHOES cut level at z', round(zc, 3))

# shoe_level=1 (the gat's low shoes, instead of shoe_cut): cut away, the rim's teeth left holes where the vamp went
# too (user). Here no face goes: the shoes' vertices over shoe_level_up (8 mm) above the bottom's hem line, within
# shoe_level_r (4.5 cm) of the ankle's axis, are pressed down to that level, so the collar is one level line.
if opt.get('shoe_level', '0') == '1' and 'SHOES' in G:
    zc = boot_top + float(opt.get('shoe_level_up', 0.008)); rr = float(opt.get('shoe_level_r', 0.045)); n_ = 0
    for v in G['SHOES'].data.vertices:
        ft = J['LeftFoot' if v.co.x > 0 else 'RightFoot']
        if v.co.z > zc and math.hypot(v.co.x - ft.x, v.co.y - ft.y) < rr: v.co.z = zc; n_ += 1
    print('SHOES', n_, 'rim vertices pressed to z', round(zc, 3))

# shoe_cap=1 (the gat's low shoes): from above, between the trousers and the rim the shoe's empty inside showed the
# ground (its inner faces are back faces, user: the feet are holed). Each shoe's opening gets a flat dark lid 1.5 mm
# under the levelled rim: the outline (convex hull) of its vertices round the ankle (shoe_level_r) at the rim's level.
if opt.get('shoe_cap', '0') == '1' and 'SHOES' in G:
    from mathutils.geometry import convex_hull_2d
    it = G['SHOES']; zc = boot_top + float(opt.get('shoe_level_up', 0.008)); rr = float(opt.get('shoe_level_r', 0.045))
    img = next(n.image for m in it.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
    uvd = it.data.uv_layers.active.data
    cs = sorted((P[min(h_ - 1, int(uvd[l].uv[1] * h_)), min(w_ - 1, int(uvd[l].uv[0] * w_))].mean(), l) for l in range(0, len(uvd), 5))
    dark_uv = tuple(uvd[cs[len(cs) // 4][1]].uv)
    capb = bmesh.new()
    for side, sg in (('Left', 1), ('Right', -1)):
        ft = J[side + 'Foot']
        pts = [(v.co.x, v.co.y) for v in it.data.vertices
               if v.co.x * sg > 0 and v.co.z > zc - float(opt.get('shoe_cap_depth', 0.006)) and math.hypot(v.co.x - ft.x, v.co.y - ft.y) < rr]
        if len(pts) < 3: continue
        hull = convex_hull_2d(pts)
        f = capb.faces.new([capb.verts.new((pts[i][0], pts[i][1], zc - 0.0015)) for i in hull])
        f.normal_update()
        if f.normal.z < 0: f.normal_flip()
    bmesh.ops.triangulate(capb, faces=capb.faces[:])
    cap = bpy.data.objects.new('cap', bpy.data.meshes.new('cap')); bpy.context.scene.collection.objects.link(cap)
    capb.to_mesh(cap.data); capb.free(); n_cap = len(cap.data.polygons)
    on_texel(cap, it, dark_uv)
    cap.vertex_groups.new(name='part:shoes').add(list(range(len(cap.data.vertices))), 1.0, 'REPLACE')
    for x in bpy.data.objects: x.select_set(x in (it, cap))
    bpy.context.view_layer.objects.active = it; bpy.ops.object.join()
    print('SHOES cap', n_cap, 'faces at z', round(zc - 0.0015, 4))

# dark_lining=SHOES (the gat's shoes): the low shoes' white inner lining showed round the ankle as white teeth.
# The slot's light faces (texel at their UV centre brighter than dark_light, 0.6) take its dark texel (the median
# of its darker half).
for slot in [x for x in opt.get('dark_lining', '').split(',') if x]:
    it = G[slot]
    img = next(n.image for m in it.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
    uvd = it.data.uv_layers.active.data
    col = lambda u: P[min(h_ - 1, int(u[1] * h_)), min(w_ - 1, int(u[0] * w_))]
    fc = {p.index: col(np.mean([tuple(uvd[l].uv) for l in p.loop_indices], 0)) for p in it.data.polygons}
    lum = {i: float(c.mean()) for i, c in fc.items()}
    # (a face is light when its centre or any corner is: white triangles with dark centres stayed at the throat)
    lum_max = {p.index: max([lum[p.index]] + [float(col(tuple(uvd[l].uv)).mean()) for l in p.loop_indices]) for p in it.data.polygons}
    dark = sorted(lum, key=lum.get)[: max(1, len(lum) // 2)]
    dmed = np.median([lum[i] for i in dark]); di = min(dark, key=lambda i: abs(lum[i] - dmed))
    duv = np.mean([tuple(uvd[l].uv) for l in it.data.polygons[di].loop_indices], 0)
    n_ = 0
    for p in it.data.polygons:
        if lum_max[p.index] > float(opt.get('dark_light', 0.6)):
            for l in p.loop_indices: uvd[l].uv = duv
            n_ += 1
    print('DARK lining', slot, n_, 'light faces to', round(float(dmed), 2))

# clean_dark=TOP (the gat's dopo): an all-white garment's dark texel blotches (a crumpled grey spot where the
# collar crosses) take its middle tone, face by face (texel at the face's UV centre darker than clean_below, 0.55)
for slot in [x for x in opt.get('clean_dark', '').split(',') if x]:
    it = G[slot]; uv_mid, _ = lit_texel(it, 40)
    img = next(n.image for m in it.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
    uvd = it.data.uv_layers.active.data; n_ = 0
    tx = lambda u: P[min(h_ - 1, max(0, int(u[1] * h_))), min(w_ - 1, max(0, int(u[0] * w_)))].mean()
    nz, nx, ny = J['Neck'].z, J['Neck'].x, J['Neck'].y
    lin_ = {g.index for g in it.vertex_groups if g.name == 'part:lining'}
    for p in it.data.polygons:
        # (the lining is left alone: in skin it read as a dark blotch and went white)
        if lin_ and any(e.group in lin_ for e in it.data.vertices[p.vertices[0]].groups): continue
        us = [tuple(uvd[l].uv) for l in p.loop_indices]
        # (corners too: a blotch's faces had light centres) and every face in the V under the neck (Tripo painted
        # skin and a grey shirt there; mixed with the lining it read ragged)
        c = p.center
        in_v = opt.get('clean_v', '0') == '1' and nz - 0.07 < c.z < nz + 0.02 and c.y < ny - 0.01                and math.hypot(c.x - nx, c.y - ny) < 0.085
        if in_v or min([tx(np.mean(us, 0))] + [tx(u) for u in us]) < float(opt.get('clean_below', 0.55)):
            for l in p.loop_indices: uvd[l].uv = uv_mid
            n_ += 1
    print('CLEAN dark', slot, n_, 'faces')

# clean_skin=TOP (the gat's dopo): Tripo painted skin on the robe round the neck (a beige ragged band under the
# back collar, user: the back of the neck looks odd). Faces whose texel is skin-like (redder than green by
# clean_skin_r, 0.06) take the robe's lit tone; the lining is left as it is.
for slot in [x for x in opt.get('clean_skin', '').split(',') if x]:
    it = G[slot]; uv_lit, _ = lit_texel(it, 60)
    img = next(n.image for m in it.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
    uvd = it.data.uv_layers.active.data; n_ = 0
    tx = lambda u: P[min(h_ - 1, max(0, int(u[1] * h_))), min(w_ - 1, max(0, int(u[0] * w_)))]
    lin = {i for g in it.vertex_groups if g.name == 'part:lining' for i in [g.index]}
    for p in it.data.polygons:
        if lin and any(e.group in lin for e in it.data.vertices[p.vertices[0]].groups): continue
        us = [tuple(uvd[l].uv) for l in p.loop_indices]
        if max(float(c[0] - c[1]) for c in [tx(np.mean(us, 0))] + [tx(u) for u in us]) > float(opt.get('clean_skin_r', 0.06)):
            for l in p.loop_indices: uvd[l].uv = uv_lit
            n_ += 1
    print('CLEAN skin', slot, n_, 'faces')

# v_paint=1 (with v_cut; the gat's dopo, like Tripo's own): the robe's inner panel inside the V, cut straight along
# the V's two lines, is kept and painted the neck's skin colour, so the collar band runs whole from the neck's back
# into the lapels and the V shows skin under the neck (a lining or the body there broke the band, user)
if opt.get('v_paint', '0') == '1' and opt.get('v_cut') and 'TOP' in G:
    ax, az, lx, lz, rx, rz = map(float, opt['v_cut'].split(','))
    xl = lambda z: ax + (lx - ax) * (z - az) / (lz - az); xr = lambda z: ax + (rx - ax) * (z - az) / (rz - az)
    it = G['TOP']; uvd = it.data.uv_layers.active.data; uv_s = skin_texel(it); ny_ = J['Neck'].y; n_ = 0
    for p in it.data.polygons:
        c = p.center
        if az < c.z < max(lz, rz) and c.y < ny_ and xl(c.z) + 1e-5 < c.x < xr(c.z) - 1e-5:
            for l in p.loop_indices: uvd[l].uv = uv_s
            n_ += 1
    print('V paint', n_, 'inner faces in skin')

# smooth_rims=SHOES (the gat's low shoes): Tripo's opening rim was a row of teeth. Each open edge loop of the slot
# is relaxed along itself (every rim vertex toward its two rim neighbours, 20 rounds): a smooth rim, the shoe kept
# whole (cut level, the vamp went too and the shoes looked holed).
for slot in [x for x in opt.get('smooth_rims', '').split(',') if x]:
    rb = bmesh.new(); rb.from_mesh(G[slot].data); bmesh.ops.remove_doubles(rb, verts=rb.verts, dist=1e-5)
    rim = [v for v in rb.verts if v.is_boundary]
    nb = {v: [e.other_vert(v) for e in v.link_edges if e.is_boundary] for v in rim}
    for _ in range(20):
        new_ = {v: (v.co + sum((u.co for u in nb[v]), Vector()) / len(nb[v])) / 2 for v in rim if len(nb[v]) == 2}
        for v, c in new_.items(): v.co = c
    rb.to_mesh(G[slot].data); rb.free()
    print('RIMS', slot, len(rim), 'rim vertices relaxed')

# make_shoes=1 (the gat's shoes): Tripo's shoes had a ragged rim (teeth round the ankle) that neither a level cut
# (it took the vamp: holed shoes) nor relaxing could clean. Shoes are made from the feet instead, like the pants:
# the feet's faces below shoe_top (3 cm) 2.5 mm out, cut level there, smoothed, on Tripo's shoe's dark texel.
if opt.get('make_shoes', '0') == '1' and 'SHOES' in G:
    old = G['SHOES']
    img = next(n.image for m in old.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
    uvd = old.data.uv_layers.active.data
    cs = [(P[min(h_ - 1, int(uvd[l].uv[1] * h_)), min(w_ - 1, int(uvd[l].uv[0] * w_))].mean(), tuple(uvd[l].uv)) for l in range(0, len(uvd), 5)]
    cs.sort(); dark_uv = cs[len(cs) // 4][1]                       # (a dark, not the darkest, shoe texel)
    shoe_top = float(opt.get('shoe_top', 0.03))
    lead = leading_bones(src_obj); pick = []
    for p in src_obj.data.polygons:
        votes = {}
        for vi in p.vertices: votes[lead[vi]] = votes.get(lead[vi], 0) + 1
        bone_ = max(votes, key=votes.get)
        if (bone_ in FOOT_BONES or bone_ in BOTTOM_BONES) and p.center.z < shoe_top + 0.015: pick.append(p.index)
    sh_ = src_obj.copy(); sh_.data = src_obj.data.copy(); bpy.context.scene.collection.objects.link(sh_)
    hb = bmesh.new(); hb.from_mesh(sh_.data); hb.faces.ensure_lookup_table(); keep_ = set(pick)
    bmesh.ops.delete(hb, geom=[f for f in hb.faces if f.index not in keep_], context='FACES')
    bmesh.ops.remove_doubles(hb, verts=hb.verts, dist=1e-5)
    hb.normal_update()
    for v in hb.verts: v.co += v.normal * float(opt.get('shoe_gap', 0.0025))
    bmesh.ops.bisect_plane(hb, geom=hb.verts[:] + hb.edges[:] + hb.faces[:], plane_co=(0, 0, shoe_top), plane_no=(0, 0, 1), clear_outer=True)
    # (smoothed hard, the sole kept flat: on the feet's own shape the toes showed through like toe socks)
    for _ in range(int(opt.get('shoe_smooth', 15))):
        bmesh.ops.smooth_vert(hb, verts=[v for v in hb.verts if not v.is_boundary and v.co.z > 0.006],
                              factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    hb.to_mesh(sh_.data); hb.free()
    for g in list(sh_.vertex_groups): sh_.vertex_groups.remove(g)
    on_texel(sh_, old, dark_uv)
    sh_.vertex_groups.new(name='part:shoes').add(list(range(len(sh_.data.vertices))), 1.0, 'REPLACE')
    name = old.name; bpy.data.objects.remove(old); sh_.name = name; G['SHOES'] = sh_
    print('SHOES made from the feet up to z', shoe_top, len(pick), 'faces')

# socks=SHOES (the gat's low shoes): the body's feet are hidden under shoes, so an open shoe showed its empty inside
# (user: the shoes look holed). The feet's faces the shoes do not cover (no shoe within 1.5 cm along the normal)
# become white socks (beoseon) 1 mm out, on the bottom item's lit cloth texel, part of the shoes.
if opt.get('socks', '0') == '1' and 'SHOES' in G:
    sb_ = bmesh.new(); sb_.from_mesh(G['SHOES'].data); shoe_bvh = BVHTree.FromBMesh(sb_); sb_.free()
    lead = leading_bones(src_obj); pick = []
    for p in src_obj.data.polygons:
        votes = {}
        for vi in p.vertices: votes[lead[vi]] = votes.get(lead[vi], 0) + 1
        bone_ = max(votes, key=votes.get)
        if not (bone_ in FOOT_BONES or (bone_ in BOTTOM_BONES and p.center.z <= boot_top)) or p.center.z < 0.006: continue
        if opt.get('make_shoes', '0') == '1':
            if p.center.z < float(opt.get('shoe_top', 0.03)) - 0.006: continue        # (the made shoes cover below)
        elif shoe_bvh.ray_cast(p.center + p.normal * 0.0005, p.normal, 0.015)[0] is not None: continue
        pick.append(p.index)
    sk = src_obj.copy(); sk.data = src_obj.data.copy(); bpy.context.scene.collection.objects.link(sk)
    kb = bmesh.new(); kb.from_mesh(sk.data); kb.faces.ensure_lookup_table(); keep_ = set(pick)
    bmesh.ops.delete(kb, geom=[f for f in kb.faces if f.index not in keep_], context='FACES')
    kb.normal_update()
    for v in kb.verts: v.co += v.normal * 0.001
    kb.to_mesh(sk.data); kb.free()
    for g in list(sk.vertex_groups): sk.vertex_groups.remove(g)
    src_it = G.get('BOTTOM') or G['SHOES']
    uv0, _ = lit_texel(src_it)
    # (the bottom's texture is the same Tripo atlas as the shoes': one material, one image)
    on_texel(sk, G['SHOES'], uv0)
    sk.vertex_groups.new(name='part:socks').add(list(range(len(sk.data.vertices))), 1.0, 'REPLACE')
    for x in bpy.data.objects: x.select_set(x in (G['SHOES'], sk))
    bpy.context.view_layer.objects.active = G['SHOES']; bpy.ops.object.join()
    print('SOCKS', len(pick), 'foot faces as white socks')

# 1. outside the body by 2 mm, where the item touches it (deeper, the body is hidden instead)
for slot, it in G.items():
    lo, to = (-0.03, 0.004) if slot == 'HAIR' else (-0.004, 0.002)
    moved = 0
    # (made pants are laid out from the body already; pushed, their hem drawn in under the shoes' rim scattered)
    made = {it.vertex_groups[g].index for g in ('part:pants', 'part:lining', 'part:socks', 'part:shoes') if g in it.vertex_groups}
    # (push_neck=0, the gat's dopo: pushed vertex by vertex, the top's collar went saw-toothed where it met the neck
    # and looked broken off, user; round the neck it is lifted smoothly instead, below)
    nk_skip = slot == 'TOP' and opt.get('push_neck', '1') == '0'
    in_nk = lambda co: co.z > J['Neck'].z - 0.06 and math.hypot(co.x - J['Neck'].x, co.y - J['Neck'].y) < 0.1
    if nk_skip:
        # (round the neck the whole collar is lifted as one: every vertex there inside the body, to 3 cm deep, needs
        # to come out to 2 mm; that need is spread to its neighbours (each takes the most of its own and its
        # neighbours' mean, 12 rounds), so the band moves out smoothly, no tooth left behind)
        nb3 = bmesh.new(); nb3.from_mesh(it.data); nb3.verts.ensure_lookup_table()
        need, dirn = {}, {}
        for v in nb3.verts:
            if not in_nk(v.co): continue
            loc, n, fi, d = body_bvh.find_nearest(v.co)
            if loc is None or d > 0.05: continue
            nf = body_fn[fi]; s_ = (v.co - loc).dot(nf)
            need[v.index] = max(0.0, to - s_) if s_ > -0.03 else 0.0; dirn[v.index] = nf
        req = dict(need); cur = dict(need)
        for _ in range(int(opt.get('push_neck_rounds', 12))):
            nxt = {}
            for i in cur:
                nbs = [e.other_vert(nb3.verts[i]).index for e in nb3.verts[i].link_edges]
                nbs = [j for j in nbs if j in cur]
                m_ = sum(cur[j] for j in nbs) / len(nbs) if nbs else 0.0
                nxt[i] = max(req[i], 0.5 * (cur[i] + m_))
            cur = nxt
        for i, m_ in cur.items():
            if m_ > 0: it.data.vertices[i].co += dirn[i] * m_; moved += 1
        nb3.free()
    for v in it.data.vertices:
        if made and any(e.group in made for e in v.groups): continue
        if nk_skip and in_nk(v.co): continue
        loc, n, fi, d = body_bvh.find_nearest(v.co)
        if loc is None or d > 0.05: continue
        nf = body_fn[fi]; s_ = (v.co - loc).dot(nf)
        if lo < s_ < to: v.co = loc + nf * to; moved += 1
    print('PUSH', slot, moved)

# 2. weights from the body, then the rules
LEG = ('LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg')
ARMS = ('LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand')
belt = J['Hips'].z + 0.035; knee = J['LeftLeg'].z; mid_x = abs(J['LeftArm'].x) * 0.8
for slot, it in G.items():
    for g in src_obj.vertex_groups:
        if g.name not in it.vertex_groups: it.vertex_groups.new(name=g.name)
    md = it.modifiers.new('dt', 'DATA_TRANSFER'); md.object = src_obj
    md.use_vert_data = True; md.data_types_verts = {'VGROUP_WEIGHTS'}; md.vert_mapping = 'POLYINTERP_NEAREST'
    md.layers_vgroup_select_src = 'ALL'; md.layers_vgroup_select_dst = 'NAME'
    bpy.context.view_layer.objects.active = it; bpy.ops.object.modifier_apply(modifier='dt')
    VG = {g.name[len('mixamorig:'):]: g for g in it.vertex_groups if g.name.startswith('mixamorig:')}
    idx = {g.index: n for n, g in VG.items()}
    def set_w(v, w):
        for e in list(v.groups):
            if e.group in idx: VG[idx[e.group]].remove([v.index])
        tot = sum(w.values()) or 1
        for n, x in w.items():
            if x > 1e-4: VG[n].add([v.index], x / tot, 'REPLACE')
    names_ = [g.name[5:] for g in it.vertex_groups if g.name.startswith('part:')]
    if slot in ('HAIR', 'FACE'):
        for v in it.data.vertices: set_w(v, {'Head': 1.0})
    else:
        for v in it.data.vertices:
            w = {idx[e.group]: e.weight for e in v.groups if e.group in idx and e.weight > 0}
            moved = sum(x for n, x in w.items() if n in ('Head', 'HeadTop_End', 'Neck'))
            if slot == 'TOP' and abs(v.co.x) < mid_x and v.co.z < J['Neck'].z:
                moved += sum(x for n, x in w.items() if n in ARMS)
                w = {n: x for n, x in w.items() if n not in ARMS}
            w = {n: x for n, x in w.items() if n not in ('Head', 'HeadTop_End', 'Neck')}
            if moved > 0: w['Spine2'] = w.get('Spine2', 0) + moved
            if slot == SKIRT and v.co.z < belt and any(n in LEG for n in w):
                t = min(1.0, max(0.0, (belt - v.co.z) / (belt - knee)))
                leg = {n: x for n, x in w.items() if n in LEG}; rest = {n: x for n, x in w.items() if n not in LEG}
                # (skirt_leg, 0.5: the legs' share at the knee. The gat's dopo at 0.5: running, the knees came out
                # through its front, user; a higher share lets the skirt part a little between the legs instead)
                SL = float(opt.get('skirt_leg', 0.5))
                nw = {'Hips': (1 - SL * t) * sum(leg.values())}
                for n, x in leg.items(): nw[n] = nw.get(n, 0) + SL * t * x
                for n, x in rest.items(): nw[n] = nw.get(n, 0) + x
                w = nw
            set_w(v, w)
        # each part's weights averaged over STIFF metres within the part
        bones = list(VG); bi = {n: k for k, n in enumerate(bones)}
        Wm = np.zeros((len(it.data.vertices), len(bones)), np.float32)
        part_of = np.full(len(it.data.vertices), '', object)
        pidx = {it.vertex_groups['part:' + n].index: n for n in names_}
        for v in it.data.vertices:
            for e in v.groups:
                if e.group in idx: Wm[v.index, bi[idx[e.group]]] = e.weight
                elif e.group in pidx: part_of[v.index] = pidx[e.group]
        Pp = np.array([tuple(v.co) for v in it.data.vertices]); Wn = Wm.copy()
        for n in names_:
            ids = np.where(part_of == n)[0]
            kd = KDTree(len(ids))
            for k, i in enumerate(ids): kd.insert(Pp[i], k)
            kd.balance()
            for i in ids:
                near = kd.find_range(Pp[i], STIFF)
                js = np.array([ids[j] for _, j, _ in near]); d = np.array([dd for _, _, dd in near])
                g_ = np.exp(-(d / (STIFF / 2)) ** 2)
                Wn[i] = (Wm[js] * g_[:, None]).sum(0) / g_.sum()
        # (seam=A>B,C: where two parts meet their weights are blended, half and half at the meeting line fading out
        # over seam_w, 3 cm: the dopo's sleeves turned with the arms and the robe with the chest, and the slit
        # between them opened at the shoulders, user)
        if slot == 'TOP':
            for spec in [x for x in opt.get('seam', '').split(';') if x]:
                a_n, b_ns = spec.split('>'); ia = np.where(part_of == 'tripo_part_' + a_n)[0]
                ib_ = np.where(np.isin(part_of, ['tripo_part_' + n for n in b_ns.split(',')]))[0]
                if not len(ia) or not len(ib_): continue
                sw = float(opt.get('seam_w', 0.03)); W0 = Wn.copy(); n_w = 0
                for xs, ys in ((ia, ib_), (ib_, ia)):
                    kd = KDTree(len(ys))
                    for k, j in enumerate(ys): kd.insert(Pp[j], k)
                    kd.balance()
                    for i in xs:
                        _, k, d_ = kd.find(Pp[i])
                        if d_ < sw:
                            t = 0.5 * (1 - d_ / sw); Wn[i] = (1 - t) * W0[i] + t * W0[ys[k]]; n_w += 1
                print('SEAM weights', a_n, '>', b_ns, n_w, 'vertices blended')
        for v in it.data.vertices:
            w = {bones[k]: float(x) for k, x in enumerate(Wn[v.index]) if x > 1e-3}
            if w: set_w(v, w)
    for n in names_: it.vertex_groups.remove(it.vertex_groups['part:' + n])
    it.parent = arm; md = it.modifiers.new('Armature', 'ARMATURE'); md.object = arm
    print('WEIGHTS', slot)

# 3. which body faces each item covers, by body region (the face's leading bone)
sleeve_x = max(abs(v.co.x) for v in G['TOP'].data.vertices) if 'TOP' in G else 0
print('COVER top to |x|', round(sleeve_x, 3), 'boot_top', round(boot_top, 3))
hair_bvh = None
if 'HAIR' in G and opt.get('hair_hides_scalp', '0') == '1':
    hb = bmesh.new(); hb.from_mesh(G['HAIR'].data); hb.transform(G['HAIR'].matrix_world); hair_bvh = BVHTree.FromBMesh(hb); hb.free()
neck_z, neck_xy = J['Neck'].z, (J['Neck'].x, J['Neck'].y)
# neck_poke=1 (the gat's dopo): the neck's foot is left showing under a top, but behind the dopo's collar it came out
# through the robe as a beige ragged band (user: the back of the neck looks odd). Those neck faces that lie outside
# the top (the top within neck_poke_in, 1.5 cm, inward along the face's normal) are covered by it too.
top_bvh_ = None
if opt.get('neck_poke', '0') == '1' and 'TOP' in G:
    _me = G['TOP'].evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    _tb = bmesh.new(); _tb.from_mesh(_me); _tb.transform(G['TOP'].matrix_world); top_bvh_ = BVHTree.FromBMesh(_tb); _tb.free()
n_poke = 0
pieces = 0
neck_tone = opt.get('neck_tone', '0') == '1' and 'TOP' in G; tone_src = []
# under_layer=1 (the gat's dopo): between the dopo's parts (the sleeves' seams at the shoulders, behind the collar)
# the hidden body left see-through gaps (user: the shoulder seams and the neck look transparent). Every body face
# the top hides becomes a white under-layer (the top's lit tone) 1 mm off the skin, skinned like the body, joined to
# the top; where the lining already lines the V it is left out. Decimated to under_layer_ratio (0.35): it is only
# ever seen through gaps.
under_layer = opt.get('under_layer', '0') == '1' and 'TOP' in G
under_src = []
_ld, _lr = float(opt.get('lining_down', 0.1)), float(opt.get('lining_r', 0.09))
in_lining = lambda c: opt.get('lining', '0') == '1' and c.y < neck_xy[1] - 0.01 and c.z > neck_z - _ld - 0.01     and math.hypot(c.x - neck_xy[0], c.y - neck_xy[1]) < _lr
for o in body:
    me = o.data; mw = o.matrix_world
    gname = {g.index: g.name[len('mixamorig:'):] for g in o.vertex_groups if g.name.startswith('mixamorig:')}
    lead = [max(((e.weight, gname[e.group]) for e in v.groups if e.group in gname), default=(0, ''))[1] for v in me.vertices]
    cover = []; tone_faces = []
    for p in me.polygons:
        c = mw @ p.center
        votes = {}
        for vi in p.vertices: votes[lead[vi]] = votes.get(lead[vi], 0) + 1
        bone_ = max(votes, key=votes.get)
        cv = set()
        if 'TOP' in G and bone_ in TOP_BONES and not (bone_.endswith('ForeArm') and abs(c.x) > sleeve_x - 0.01): cv.add('TOP')
        if c.z > neck_z - 0.005 and math.hypot(c.x - neck_xy[0], c.y - neck_xy[1]) < 0.065:
            cv.discard('TOP')
            if top_bvh_ and c.z < neck_z + 0.04:
                n = (mw.to_3x3() @ p.normal).normalized()
                if top_bvh_.ray_cast(c - n * 0.0005, -n, float(opt.get('neck_poke_in', 0.015)))[0] is not None:
                    cv.add('TOP'); n_poke += 1
        # neck_tone=1 (the gat's dopo): the neck its open collar leaves showing was banded, the body texture's fold
        # line at the neck's foot and a pinker band under it (user: one colour, please). While this top is worn
        # the neck's visible faces (the neck's own, and the foot the collar leaves) are covered and shown instead,
        # in place, in one skin colour: their mean, matched to the nearest texel of the outfit's atlas.
        # (with lining_tone=skin the V's inside too: the neck and the chest under the V, one surface in one colour)
        if neck_tone and opt.get('lining_tone') == 'skin' and opt.get('v_paint', '0') != '1' and in_lining(c) and bone_ not in ('Head', 'HeadTop_End')                 and c.z < neck_z + 0.03:
            cv.add('TOP'); tone_faces.append(p.index)
        elif neck_tone and 'TOP' not in cv and (bone_ == 'Neck' or (c.z > neck_z - 0.005 and math.hypot(c.x - neck_xy[0], c.y - neck_xy[1]) < 0.065)):
            cv.add('TOP')
            # (behind, the neck's foot came out under the collar as skin-coloured teeth: there the robe-coloured
            # under-layer takes it instead)
            if bone_ == 'Neck' or c.y < neck_xy[1]: tone_faces.append(p.index)
        if 'BOTTOM' in G and bone_ in BOTTOM_BONES and c.z > boot_top: cv.add('BOTTOM')
        if 'SHOES' in G and (bone_ in FOOT_BONES or (bone_ in BOTTOM_BONES and c.z <= boot_top)): cv.add('SHOES')
        if hair_bvh and bone_ in ('Head', 'HeadTop_End'):
            n = (mw.to_3x3() @ p.normal).normalized()
            if hair_bvh.ray_cast(c + n * 0.001, n, 0.02)[0] is not None: cv.add('HAIR')
        cover.append(cv)
    if tone_faces:          # (copied now, like the under-layer: the body's covered faces are deleted below)
        img_ = next((n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
        cols_ = []
        if img_:
            w2, h2 = img_.size; PB = np.array(img_.pixels[:], np.float32).reshape(h2, w2, -1)[..., :3]
            uvb = me.uv_layers.active.data
            for i in tone_faces:
                u_ = np.mean([tuple(uvb[l].uv) for l in me.polygons[i].loop_indices], 0)
                cols_.append(PB[min(h2 - 1, max(0, int(u_[1] * h2))), min(w2 - 1, max(0, int(u_[0] * w2)))])
        t_ = o.copy(); t_.data = o.data.copy(); bpy.context.scene.collection.objects.link(t_)
        tb2 = bmesh.new(); tb2.from_mesh(t_.data); tb2.faces.ensure_lookup_table(); keep_ = set(tone_faces)
        bmesh.ops.delete(tb2, geom=[f for f in tb2.faces if f.index not in keep_], context='FACES'); tb2.to_mesh(t_.data); tb2.free()
        tone_src.append((t_, cols_))
    if under_layer:
        ul = [i for i, cv in enumerate(cover) if 'TOP' in cv and not in_lining(mw @ me.polygons[i].center)
              and i not in set(tone_faces)]
        if ul:          # (copied now: the body's covered faces are deleted below)
            u = o.copy(); u.data = o.data.copy(); bpy.context.scene.collection.objects.link(u)
            ub = bmesh.new(); ub.from_mesh(u.data); ub.faces.ensure_lookup_table(); keep_ = set(ul)
            bmesh.ops.delete(ub, geom=[f for f in ub.faces if f.index not in keep_], context='FACES'); ub.to_mesh(u.data); ub.free()
            under_src.append((u, ul))
    groups = {}
    for i, cv in enumerate(cover): groups.setdefault(frozenset(cv), []).append(i)
    if len(groups) == 1 and frozenset() in groups: continue
    base_tokens = re.findall(r'[A-Z]+[a-z0-9]+', re.sub(r'(_\d+)?(\.\d+)?$', '', o.name)[len('body'):])
    for cv, faces in groups.items():
        if not cv: continue
        c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
        b2 = bmesh.new(); b2.from_mesh(c.data); b2.faces.ensure_lookup_table(); fs = set(faces)
        bmesh.ops.delete(b2, geom=[f for f in b2.faces if f.index not in fs], context='FACES'); b2.to_mesh(c.data); b2.free()
        c['tokens'] = '_'.join(sorted(set(base_tokens) | {f'{s}{SET}' for s in cv}))
        pieces += 1
    covered = {i for cv, faces in groups.items() if cv for i in faces}
    b2 = bmesh.new(); b2.from_mesh(me); b2.faces.ensure_lookup_table()
    bmesh.ops.delete(b2, geom=[f for f in b2.faces if f.index in covered], context='FACES'); b2.to_mesh(me); b2.free()
print('BODY pieces added', pieces, '; neck faces out through the top', n_poke)
if neck_tone and tone_src:
    uv_t = skin_texel(G['TOP'])
    made = []
    _me2 = G['TOP'].evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    _tb2 = bmesh.new(); _tb2.from_mesh(_me2); _tb2.transform(G['TOP'].matrix_world); _tbvh = BVHTree.FromBMesh(_tb2); _tb2.free()
    for t_, _ in tone_src:
        for m_ in list(t_.modifiers): t_.modifiers.remove(m_)
        if t_.data.shape_keys: t_.shape_key_clear()
        # (where the robe lies under the skin's surface, within neck_tone_in, 1.2 cm, the skin came through it as
        # patches: those faces go, the robe shows; and the body's crease round the neck's foot is smoothed out of
        # this copy, neck_tone_smooth rounds, its open edges held: one even skin, user)
        nb_ = bmesh.new(); nb_.from_mesh(t_.data); bmesh.ops.remove_doubles(nb_, verts=nb_.verts, dist=1e-5)
        for _ in range(int(opt.get('neck_tone_smooth', 12))):
            bmesh.ops.smooth_vert(nb_, verts=[v for v in nb_.verts if not v.is_boundary], factor=0.5,
                                  use_axis_x=True, use_axis_y=True, use_axis_z=True)
        nb_.normal_update(); mw_ = t_.matrix_world; nm_ = mw_.to_3x3()
        # (the chest under the V sinks neck_tone_sink, 2.5 mm, fading in over 2 cm under the neck joint: just at the
        # skin it came through the lapels as patches; dropping it near the robe opened holes along their edges)
        sink_ = float(opt.get('neck_tone_sink', 0.0025))
        for v in nb_.verts:
            k_ = min(1.0, max(0.0, (neck_z - (mw_ @ v.co).z) / 0.02))
            v.co -= v.normal * sink_ * k_
        nb_.normal_update()
        # (after that, where the robe still lies under the skin within neck_tone_in, the face goes)
        gone_ = [f for f in nb_.faces for c, n in [(mw_ @ f.calc_center_median(), (nm_ @ f.normal).normalized())]
                 if _tbvh.ray_cast(c - n * 0.0005, -n, float(opt.get('neck_tone_in', 0.012)))[0] is not None]
        bmesh.ops.delete(nb_, geom=gone_, context='FACES')
        nb_.to_mesh(t_.data); nb_.free()
        print('NECK tone', len(gone_), 'faces under the robe dropped')
        on_texel(t_, G['TOP'], uv_t); made.append(t_)
        if 'tokens' in t_.keys(): del t_['tokens']
    for x in bpy.data.objects: x.select_set(x in made or x == G['TOP'])
    bpy.context.view_layer.objects.active = G['TOP']; bpy.ops.object.join()
    print('NECK tone', sum(len(cs) for _, cs in tone_src), 'faces on the skin texel')
if under_layer and under_src:
    uv_lit, _ = lit_texel(G['TOP'], float(opt.get('under_layer_tone', 60))); made = []
    # (only where the top stands off: within under_layer_near, 1.5 cm, of the top along the normal the layer is
    # dropped, and within under_layer_in, 3 cm, inward (where the robe sinks into the body, the layer lay over it).
    # Kept everywhere, it came through the dopo's back and waist as pale ragged patches, user)
    _me = G['TOP'].evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    _tb = bmesh.new(); _tb.from_mesh(_me); _tb.transform(G['TOP'].matrix_world); _top_bvh = BVHTree.FromBMesh(_tb); _tb.free()
    near_ = float(opt.get('under_layer_near', 0.015)); n_near = 0
    for u, ul in under_src:
        ub = bmesh.new(); ub.from_mesh(u.data); ub.normal_update(); mw_ = u.matrix_world; nm_ = mw_.to_3x3()
        # (it lies under_layer_sink, 3 mm, inside the skin except round the neck: it is only for the gaps, and just
        # off the skin it came out through the robe's shoulders and back as patches)
        arm_ = lambda c: not (c.z > neck_z - 0.005 and math.hypot(c.x - neck_xy[0], c.y - neck_xy[1]) < 0.065)
        for v in ub.verts:
            v.co += v.normal * (-float(opt.get('under_layer_sink', 0.003)) if arm_(mw_ @ v.co) else float(opt.get('under_layer_gap', 0.001)))
        ub.normal_update()
        # (round the neck's foot, where neck_poke hid the neck under the collar, it always stays: dropped there,
        # the collar's inside showed through, user)
        # (nor on the shoulders and arms, past under_layer_arm_x, 0.6 of the arm joint's |x|: through the slit
        # between the robe's shoulder edge and the sleeve one looked down to nothing, user)
        keep_ = lambda c: (c.z > neck_z - 0.005 and math.hypot(c.x - neck_xy[0], c.y - neck_xy[1]) < 0.065)             or (abs(c.x) > abs(J['LeftArm'].x) * float(opt.get('under_layer_arm_x', 0.6)) and c.z > J['Spine1'].z)
        close = [f for f in ub.faces for c, n in [(mw_ @ f.calc_center_median(), (nm_ @ f.normal).normalized())]
                 if not keep_(c)
                 and _top_bvh.ray_cast(c, n, near_)[0] is not None or (not keep_(c)
                     and _top_bvh.ray_cast(c, -n, float(opt.get('under_layer_in', 0.03)))[0] is not None)]
        n_near += len(close)
        bmesh.ops.delete(ub, geom=close, context='FACES')
        ub.to_mesh(u.data); ub.free()
        for m_ in list(u.modifiers): u.modifiers.remove(m_)
        if u.data.shape_keys: u.shape_key_clear()
        md = u.modifiers.new('dec', 'DECIMATE'); md.ratio = float(opt.get('under_layer_ratio', 0.35))
        bpy.context.view_layer.objects.active = u; bpy.ops.object.modifier_apply(modifier='dec')
        on_texel(u, G['TOP'], uv_lit)
        # (each corner takes the UV of the nearest point of the top: seen through holes in the robe it carries on
        # the robe's own shading. On one flat texel it showed as pale ragged patches on the back, user)
        uvd_ = u.data.uv_layers.active.data; tuv = _me.uv_layers.active.data; mw_ = u.matrix_world
        inv_ = G['TOP'].matrix_world.inverted()
        for poly in u.data.polygons:
            # (one robe point per face, its centre's nearest: corners projected one by one landed on faces of other
            # UV islands and the face stretched across the atlas)
            loc, _, fi, _ = _top_bvh.find_nearest(mw_ @ poly.center)
            if loc is None: continue
            tp = _me.polygons[fi]
            wts = poly_3d_calc([_me.vertices[vi].co for vi in tp.vertices], inv_ @ loc)
            uv_ = sum((Vector(tuv[l].uv) * w for l, w in zip(tp.loop_indices, wts)), Vector((0, 0)))
            for li in poly.loop_indices: uvd_[li].uv = uv_
        made.append(u)
    for u in made:
        if 'tokens' in u.keys(): del u['tokens']
    for x in bpy.data.objects: x.select_set(x in made or x == G['TOP'])
    bpy.context.view_layer.objects.active = G['TOP']; bpy.ops.object.join()
    print('UNDER layer', sum(len(ul) for _, ul in under_src), 'body faces,', n_near, 'near the top dropped, joined to the top')
# 4. under_tops=1: bottom faces that a top covers become item__BOTTOM__<set>__under_TOP<x>... pieces, hidden while that
#    top is worn. The gat's made pants reach over the belly (their waist is cut level above the hidden body's top)
#    and came out through the dopo (user); worn with other tops they could do the same. Covered: a top within
#    6 cm out along the face's normal, or within 3 cm in (the pants already outside it), and more than under_hem
#    (6 cm) above that top's lowest point, so the pants still show where a hem swings open.
if opt.get('under_tops', '0') == '1' and 'BOTTOM' in G:
    dg = bpy.context.evaluated_depsgraph_get()
    tops = {}
    for o in bpy.data.objects:
        m = re.match(r'item__TOP__([a-z0-9]+)', o.name)
        if o.type != 'MESH' or not m: continue
        me = o.evaluated_get(dg).to_mesh(); tb = bmesh.new(); tb.from_mesh(me); tb.transform(o.matrix_world)
        zs = [v.co.z for v in tb.verts]
        lo_, bvh_ = min(zs), BVHTree.FromBMesh(tb)
        tops.setdefault(m.group(1), []).append((lo_, bvh_)); tb.free(); o.evaluated_get(dg).to_mesh_clear()
    it = G['BOTTOM']; mw = it.matrix_world; nm = mw.to_3x3()
    under_hem = float(opt.get('under_hem', 0.06))
    UNDER_SKIRT = float(opt.get('under_skirt', 0))
    lowest = {k: min(lo_ for lo_, _ in v) for k, v in tops.items()}
    groups = {}
    for p in it.data.polygons:
        c = mw @ p.center; n = (nm @ p.normal).normalized(); hide = set()
        for k, parts_ in tops.items():
            if c.z < lowest[k] + under_hem: continue
            # (also straight out from the body's vertical axis: on the belly and hips the pants' normals point up or
            # down past the robe, which left a ragged band of pants showing through below the dopo's sash)
            rd = Vector((c.x, c.y - J['Hips'].y, 0))
            rd = rd.normalized() if rd.length > 1e-6 else n
            for _, bvh_ in parts_:
                # under_skirt=D (the gat's dopo): walking and running, the legs swing the pants out through the robe's
                # skirt (user); under a top that reaches down there, pants with that top within D (15 cm) straight out
                # from the body's axis or along the normal are hidden too
                if UNDER_SKIRT and k == SET and (bvh_.ray_cast(c, rd, UNDER_SKIRT)[0] is not None or bvh_.ray_cast(c + n * 0.001, n, UNDER_SKIRT)[0] is not None):
                    hide.add(k); break
                if bvh_.ray_cast(c + n * 0.001, n, 0.06)[0] is not None or bvh_.ray_cast(c - n * 0.001, -n, 0.03)[0] is not None                    or (c.z > J['LeftUpLeg'].z - 0.05 and (bvh_.ray_cast(c, rd, 0.08)[0] is not None
                                                          or bvh_.ray_cast(c, -rd, 0.04)[0] is not None)):
                    hide.add(k); break
        groups.setdefault(frozenset(hide), []).append(p.index)
    for hide, faces in groups.items():
        if not hide: continue
        c_ = it.copy(); c_.data = it.data.copy(); bpy.context.scene.collection.objects.link(c_)
        b2 = bmesh.new(); b2.from_mesh(c_.data); b2.faces.ensure_lookup_table(); fs = set(faces)
        bmesh.ops.delete(b2, geom=[f for f in b2.faces if f.index not in fs], context='FACES'); b2.to_mesh(c_.data); b2.free()
        c_.name = f'item__BOTTOM__{SET}__under_' + '_'.join(f'TOP{k}' for k in sorted(hide))
        print('UNDER', c_.name, len(faces), 'faces')
    hidden = {i for hide, faces in groups.items() if hide for i in faces}
    b2 = bmesh.new(); b2.from_mesh(it.data); b2.faces.ensure_lookup_table()
    bmesh.ops.delete(b2, geom=[f for f in b2.faces if f.index in hidden], context='FACES'); b2.to_mesh(it.data); b2.free()

# unique names the viewer and to_game parse: body__<tokens>, then _1, _2 for repeats (never .001: three.js drops dots)
used, final = {}, []
for i, o in enumerate([o for o in bpy.data.objects if o.type == 'MESH' and (o.get('tokens') is not None or re.sub(r'\.\d+$', '', o.name).startswith('body'))]):
    if len(o.data.polygons) == 0: bpy.data.objects.remove(o); continue
    key = 'body__' + o['tokens'] if o.get('tokens') is not None else re.sub(r'(_\d+)?(\.\d+)?$', '', o.name)
    k = used.get(key, 0); used[key] = k + 1
    final.append((o, key if k == 0 else f'{key}_{k}')); o.name = f'tmp_piece_{i}'     # two passes: no clashes
for o, n in final: o.name = n

bpy.data.objects.remove(src_obj)
for t in ad.nla_tracks: t.mute = False
ad.action = active
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_apply=False, export_image_format='AUTO')
print('RESULT', out)
