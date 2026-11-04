"""Fit a Tripo outfit (made in parts on the shared body's T-pose sheet) onto the shared layered build as item set
<set>, for any outfit: -- <shared_layers.glb> <outfit_parts.glb> <out.glb> set=h map=HAIR:0,1;TOP:2,3;BOTTOM:4;SHOES:5
       [s=1.0] [dx=0 dy=0 dz=0] [head_fit=N] [fill=BOTTOM] [sleeve_drape=1.0 sleeves=N,M] [skirt=TOP] [stiff=0.03] [boot_top=auto] [hair_hides_scalp=0]

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
    # the item's own light cloth: the texel nearest the median of its brighter half
    img = next(n.image for m in it.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
    uvd = it.data.uv_layers.active.data
    cs = np.array([P[min(h_ - 1, int(uvd[li].uv[1] * h_)), min(w_ - 1, int(uvd[li].uv[0] * w_))] for li in range(0, len(uvd), 7)])
    # (its lit side: the median of the brightest fifth; the median of the brighter half read grey)
    light = cs[cs.mean(1) >= np.percentile(cs.mean(1), 80)]; med = np.median(light, 0)
    k_ = int(np.argmin(((cs - med) ** 2).sum(1))) * 7
    uv0 = tuple(uvd[k_].uv)
    fl.data.materials.clear(); fl.data.materials.append(it.data.materials[0])
    name = it.data.uv_layers.active.name
    for u in list(fl.data.uv_layers): fl.data.uv_layers.remove(u)
    lay = fl.data.uv_layers.new(name=name)
    for d in lay.data: d.uv = uv0
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

# 1. outside the body by 2 mm, where the item touches it (deeper, the body is hidden instead)
for slot, it in G.items():
    lo, to = (-0.03, 0.004) if slot == 'HAIR' else (-0.004, 0.002)
    moved = 0
    for v in it.data.vertices:
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
                nw = {'Hips': (1 - 0.5 * t) * sum(leg.values())}
                for n, x in leg.items(): nw[n] = nw.get(n, 0) + 0.5 * t * x
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
pieces = 0
for o in body:
    me = o.data; mw = o.matrix_world
    gname = {g.index: g.name[len('mixamorig:'):] for g in o.vertex_groups if g.name.startswith('mixamorig:')}
    lead = [max(((e.weight, gname[e.group]) for e in v.groups if e.group in gname), default=(0, ''))[1] for v in me.vertices]
    cover = []
    for p in me.polygons:
        c = mw @ p.center
        votes = {}
        for vi in p.vertices: votes[lead[vi]] = votes.get(lead[vi], 0) + 1
        bone_ = max(votes, key=votes.get)
        cv = set()
        if 'TOP' in G and bone_ in TOP_BONES and not (bone_.endswith('ForeArm') and abs(c.x) > sleeve_x - 0.01): cv.add('TOP')
        if c.z > neck_z - 0.005 and math.hypot(c.x - neck_xy[0], c.y - neck_xy[1]) < 0.065: cv.discard('TOP')
        if 'BOTTOM' in G and bone_ in BOTTOM_BONES and c.z > boot_top: cv.add('BOTTOM')
        if 'SHOES' in G and (bone_ in FOOT_BONES or (bone_ in BOTTOM_BONES and c.z <= boot_top)): cv.add('SHOES')
        if hair_bvh and bone_ in ('Head', 'HeadTop_End'):
            n = (mw.to_3x3() @ p.normal).normalized()
            if hair_bvh.ray_cast(c + n * 0.001, n, 0.02)[0] is not None: cv.add('HAIR')
        cover.append(cv)
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
print('BODY pieces added', pieces)
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
