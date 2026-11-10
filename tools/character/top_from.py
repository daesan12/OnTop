"""A set's top remade on another set's shape (S15P31B105-390: the purple dopo on the white dopo's), after fit_outfit:
-- <in.glb> <out.glb> set=s from=h [hem=0.105] [cord=0.2,0.47] [cord_loop=z cord_old=0] [collar_white=w] [borrow=BOTTOM,SHOES [shoe_smooth=N shoe_flat=z bottom_in=m]] [collar_view=deg collar_wmax=k] [cuff=0.012] [waist_back=z0,z1]
   [drop_box=x0,x1,y1,z0,z1]
Tripo's purple dopo, fit to the body, stayed ragged (its front panels, hanging tie and sleeve ends in shards; user:
clean and square like Tripo's). The white dopo is the same garment, cleanly fit; here its top becomes set's:
- `from`'s top, copied, in set's colours (set's texture, one texel each): skin where it was skin (neck_tone's neck and
  the V's chest), white on the arms past `hem` (t, metres along the rest pose's arm from the shoulder joint; cut
  straight there), purple elsewhere, its sash and bow included;
- set's own cord (its near-black faces between heights cord=z0,z1, in islands of 30 or more) is kept and moved out
  or in by how much the new robe's surface lies off the old one under it, so it sits on the new robe;
- (cuff=w) a purple band w wide round each arm at the hem, as the purple dopo's short sleeves' edge;
- (drop_box) `from`'s faces in a box (front: x0 < x < x1, y < y1, z0 < z < z1) go: its bow and tails;
- the body's pieces hidden under set's top become those hidden under `from`'s (token TOP<set> where TOP<from> is);
- set's old top goes, the new one takes its name and material.
The white collar is painted on `from`'s own (collar_white); the trousers and shoes can come from `from` too (borrow).
The purple dopo's full command is in docs/character-outfits.md ④-6."""
import bpy, bmesh, sys, re, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
opt = dict(x.split('=', 1) for x in a[2:])
SET, FROM = opt['set'], opt['from']
HEM = float(opt.get('hem', 0.105))
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bones = {b.name.split(':')[-1]: b for b in arm.data.bones}
neck = arm.matrix_world @ bones['Neck'].head_local
sides = []
for s_ in ('Left', 'Right'):
    sh = arm.matrix_world @ bones[f'{s_}Arm'].head_local; hd = arm.matrix_world @ bones[f'{s_}Hand'].head_local
    sides.append((sh, (hd - sh).normalized()))
def along(p):
    best = (-1.0, 1.0)
    for sh, ad in sides:
        t = (p - sh).dot(ad)
        if t < -0.03: continue
        r = ((p - sh) - ad * t).length
        if r < best[1]: best = (t, r)
    return best
base = lambda n: re.sub(r'(_\d+)?(\.\d+)?$', '', n)
# (torso-only weights for the cord band and the waist backing: with the arms' weights among them, the band's sides went
# with the arms let down and stood out of the robe)
TORSO = re.compile(r'(Hips|Spine\d*)$')
def torso_only(acc, names):
    t = {g: w for g, w in acc.items() if TORSO.search(names.get(g, ''))}
    return t or acc
old = next(o for o in bpy.data.objects if o.type == 'MESH' and base(o.name) == f'item__TOP__{SET}')
frm = next(o for o in bpy.data.objects if o.type == 'MESH' and base(o.name) == f'item__TOP__{FROM}')
def texture(o):
    img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; return np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3], w_, h_
P, W_, H_ = texture(old); FP, FW, FH = texture(frm)
texel = lambda T, w_, h_, u: T[min(h_ - 1, max(0, int(u[1] * h_))), min(w_ - 1, max(0, int(u[0] * w_)))]
isskin = lambda c: c[0] > c[1] > c[2] and c[0] - c[2] > 0.12 and c[1] > 0.55 * c[0]

# set's colours, and its cord
ob = bmesh.new(); ob.from_mesh(old.data); ob.transform(old.matrix_world); ob.faces.ensure_lookup_table(); ouv = ob.loops.layers.uv.active
fuv = [tuple(np.mean([tuple(l[ouv].uv) for l in f.loops], 0)) for f in ob.faces]
cols = np.array([texel(P, W_, H_, u) for u in fuv]); lum, sat = cols.mean(1), cols.max(1) - cols.min(1)
white = (lum > 0.55) & (sat < 0.15); purple = (cols[:, 2] > cols[:, 1] + 0.04) & (cols[:, 0] > cols[:, 1])
skn = np.array([isskin(c) for c in cols])
pick = lambda mask, med: fuv[int(np.flatnonzero(mask)[np.argmin(((cols[mask] - med) ** 2).sum(1))])]
white_uv = fuv[int(np.flatnonzero(white)[np.argmax(lum[white] - 3 * sat[white])])]
purple_uv = pick(purple, np.median(cols[purple], 0)); skin_uv = pick(skn, np.median(cols[skn], 0))
z0, z1 = map(float, opt.get('cord', '0.2,0.47').split(','))
dark = {f for f, l_ in zip(ob.faces, lum) if l_ < 0.12 and z0 < f.calc_center_median().z < z1}
cord = set(); seen = set()
for f in dark:
    if f in seen: continue
    isl = []; stack = [f]; seen.add(f)
    while stack:
        g = stack.pop(); isl.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h in dark and h not in seen: seen.add(h); stack.append(h)
    if len(isl) >= 30: cord.update(isl)
print('TOP cord', len(cord), 'faces of', len(dark), 'dark')
old_robe = BVHTree.FromPolygons([v.co for v in ob.verts], [[v.index for v in f.verts] for f in ob.faces if f not in cord])

# from's top, copied, recoloured
nw = frm.copy(); nw.data = frm.data.copy(); bpy.context.scene.collection.objects.link(nw)
nb = bmesh.new(); nb.from_mesh(nw.data); nb.transform(nw.matrix_world); nuv = nb.loops.layers.uv.active
for sh, ad in sides:   # a straight colour line at the hem
    near = [f for f in nb.faces if (lambda c: abs((c - sh).dot(ad) - HEM) < 0.03 and ((c - sh) - ad * (c - sh).dot(ad)).length < 0.12)(f.calc_center_median())]
    gm = list({e for f in near for e in f.edges}) + list({v for f in near for v in f.verts}) + near
    bmesh.ops.bisect_plane(nb, geom=gm, plane_co=sh + ad * HEM, plane_no=ad)
if opt.get('drop_box'):
    bx0, bx1, by1, bz0, bz1 = map(float, opt['drop_box'].split(','))
    box = [f for f in nb.faces if (lambda c: bx0 < c.x < bx1 and c.y < by1 and bz0 < c.z < bz1)(f.calc_center_median())]
    bmesh.ops.delete(nb, geom=box, context='FACES'); print('TOP dropped', len(box), 'faces in the box')
nb.faces.ensure_lookup_table()
# (collar_white=w: `from`'s own collar kept as it is and only painted: white for w from its edge by the neck (the top's
# highest cloth round the neck, under its skin), purple past that, as the robe. A new band laid over it met its cut
# edges and its raised rim in teeth, white dopo or not (user: just paint it))
CWD = float(opt.get('collar_white', 0)); col_kd = None
if CWD > 0:
    fb_ = BVHTree.FromBMesh(nb); DEG = np.arange(-180, 180, 1.0); ZE = []
    for deg in DEG:
        ph = math.radians(deg); d = Vector((math.sin(ph), -math.cos(ph), 0)); ze = None
        for zi in range(220):
            z = 0.67 - zi * 0.001; o = Vector((neck.x, neck.y, z)); hit = fb_.ray_cast(o + d * 0.3, -d, 0.3)
            if hit[0] is None or (hit[0] - o).length > 0.12: continue
            fu = np.mean([tuple(l[nuv].uv) for l in nb.faces[hit[2]].loops], 0)
            if not isskin(texel(FP, FW, FH, fu)): ze = z; break
        ZE.append(ze if ze is not None else (ZE[-1] if ZE else 0.6))
    # the edge smoothed along itself (collar_smooth rounds), from the V's foot round the back to the foot, the foot kept:
    # measured from `from`'s own edge, ragged along its triangles, the white went in waves of uneven width (user)
    ZE = np.array(ZE); foot = int(np.argmin(ZE)); seq = np.roll(ZE, -foot); seq = np.append(seq, seq[0])
    # (over the edge's upper envelope (a running max over collar_env degrees) and never under the edge itself: smoothed
    # under it, the collar's own cloth over the line came out in skin)
    EW = int(opt.get('collar_env', 5)); env = seq.copy()
    for k_ in range(1, len(seq) - 1): env[k_] = seq[max(1, k_ - EW):min(len(seq) - 1, k_ + EW + 1)].max()
    seq = env
    for _ in range(int(opt.get('collar_smooth', 40))): seq[1:-1] = (seq[:-2] + 2 * seq[1:-1] + seq[2:]) / 4
    seq = np.maximum(seq, np.append(np.roll(ZE, -foot), ZE[foot]))
    ZS = np.roll(seq[:-1], foot)
    zs_at = lambda ph: float(np.interp(math.degrees(ph), np.append(DEG, 180.0), np.append(ZS, ZS[0])))
    curve = []
    for deg, z in zip(DEG, ZS):
        ph = math.radians(deg); d = Vector((math.sin(ph), -math.cos(ph), 0)); o = Vector((neck.x, neck.y, z))
        hit = fb_.ray_cast(o + d * 0.3, -d, 0.3)
        if hit[0] is not None and (hit[0] - o).length < 0.12: curve.append(hit[0].copy())
    dense = []
    for a_, b_ in zip(curve, curve[1:] + curve[:1]):
        if (b_ - a_).length < 0.03: dense += [a_.lerp(b_, k / 8) for k in range(8)]
    col_kd = KDTree(len(dense))
    for k_, p_ in enumerate(dense): col_kd.insert(p_, k_)
    col_kd.balance()
    print('TOP collar edge smoothed; foot at', DEG[foot], 'deg z', round(float(ZE[foot]), 3), '; white', CWD)
    def sdist(co):
        ph = math.atan2(co.x - neck.x, -(co.y - neck.y)); return col_kd.find(co)[2] * (1 if co.z < zs_at(ph) else -1)
    # (collar_view=e: the white's width set by how the collar's cloth lies, so it looks one width from a camera e degrees
    # over it: where the cloth lies flat (over the shoulders) seen slantwise, as wide as needs; where it stands (round
    # the back of the neck) seen square, w. Measured as one width on the cloth, it looked thick behind and thin on the
    # shoulders (user). The cloth's slope: area-weighted |normal z| of the faces within 12 mm)
    VE = math.radians(float(opt.get('collar_view', 0))); nz_kd = None
    if VE > 0:
        cfs = [f for f in nb.faces if math.hypot(*(f.calc_center_median() - neck).xy) < 0.14 and abs(f.calc_center_median().z - neck.z) < 0.15]
        nz_kd = KDTree(len(cfs)); nz_val = []
        for k_, f in enumerate(cfs): nz_kd.insert(f.calc_center_median(), k_); nz_val.append((abs(f.normal.z), f.calc_area()))
        nz_kd.balance()
    def cw(co):
        if nz_kd is None: return CWD
        near_ = nz_kd.find_range(co, 0.012)
        if not near_: return CWD
        wsum = sum(nz_val[i][1] for _, i, _ in near_) or 1e-9
        nz = sum(nz_val[i][0] * nz_val[i][1] for _, i, _ in near_) / wsum; nh = math.sqrt(max(0.0, 1 - nz * nz))
        seen = math.sin(VE) * nz + math.cos(VE) * nh
        return CWD * math.cos(VE) / max(seen, math.cos(VE) / float(opt.get('collar_wmax', 2.0)))
    gdist = lambda co: sdist(co) / cw(co)
    def inzone(f):
        c = f.calc_center_median(); t, r = along(c)
        if (t > HEM and r < 0.12) or math.hypot(c.x - neck.x, c.y - neck.y) >= 0.13: return False
        d_ = min(col_kd.find(v.co)[2] for v in f.verts)
        if d_ < CWD + 0.008: return True
        # (farther, as far as collar_view widens it: cloth only, the V's chest skin kept)
        return VE > 0 and d_ < CWD * float(opt.get('collar_wmax', 2.0)) + 0.008 and not isskin(texel(FP, FW, FH, np.mean([tuple(l[nuv].uv) for l in f.loops], 0)))
    # the mesh cut along both edges of the white (signed distance 0 and CWD from the smooth edge, + below it), so each
    # face is one colour and the edges are the mesh's own: drawn as a ramp within the faces, the white smeared once
    # the game's build merged them into larger ones (user: the back of the neck looked blurred)
    for T in (0.0, 1.0):
        zone = [f for f in nb.faces if inzone(f)]
        sv = {v: gdist(v.co) for f in zone for v in f.verts}
        cross = [e for e in {e for f in zone for e in f.edges} if e.verts[0] in sv and e.verts[1] in sv and (sv[e.verts[0]] - T) * (sv[e.verts[1]] - T) < 0]
        newv = set()
        for e in cross:
            va, vb = e.verts; fr = (T - sv[va]) / (sv[vb] - sv[va])
            ne_, nv_ = bmesh.utils.edge_split(e, va, fr); newv.add(nv_)
        made_ = 0
        for f in list({f for v in newv for f in v.link_faces}):
            if not f.is_valid: continue
            vs = [v for v in f.verts if v in newv]
            if len(vs) == 2 and nb.edges.get(vs) is None:
                try: bmesh.ops.connect_verts(nb, verts=vs); made_ += 1
                except Exception: pass
        print('TOP collar cut at', T, ':', len(cross), 'edges split,', made_, 'faces divided')
    nb.faces.ensure_lookup_table()
n_s = n_w = n_p = 0
for f in nb.faces:
    c = f.calc_center_median(); u = np.mean([tuple(l[nuv].uv) for l in f.loops], 0)
    t, r = along(c)
    if col_kd is not None and inzone(f):
        sd = gdist(c); uv = skin_uv if sd < 0 else white_uv if sd < 1 else purple_uv
        for l in f.loops: l[nuv].uv = uv
        n_w += 1; continue
    if isskin(texel(FP, FW, FH, u)): uv = skin_uv; n_s += 1
    elif t > HEM and r < 0.12: uv = white_uv; n_w += 1
    else: uv = purple_uv; n_p += 1
    for l in f.loops: l[nuv].uv = uv
new_robe = BVHTree.FromBMesh(nb)
print('TOP recoloured: skin', n_s, 'white', n_w, 'purple', n_p)

# the cord moved onto the new robe: each vertex out or in along the horizontal from the spine by the new robe's
# surface minus the old's (smoothed over the cord), 1 mm over it
spine = Vector((neck.x, neck.y + 0.01, 0))
# the cord onto the new robe: each vertex inside it is pushed out along the horizontal from the spine till it clears it
# (lift over it), each outside it drawn in to lift over it; the moves spread to the vertices within 12 mm (the most
# outward wins) and smoothed, so the cord keeps its round section. (Moved by the old surface's height under it instead,
# it stayed buried in the white dopo's sash.)
# (cord_loop=z: the cord's band round the waist goes, except by its knot, and a new round one is laid at z over the
# new robe (below); the knot and tails rise to it from cord_from: the white dopo's sash stood over the old band)
CL = float(opt.get('cord_loop', 0))
cord_uv = fuv[int(np.argmin(np.where([f in cord for f in ob.faces], lum, 9)))]
if CL > 0:
    CF0 = float(opt.get('cord_from', 0.405))
    hang = [v.co.x for f in cord for v in f.verts if v.co.z < CF0 - 0.02 and v.co.y < spine.y - 0.04]
    KX = float(np.median(hang)) if hang else 0.0
    band = {f for f in cord if (lambda c: CF0 - 0.02 < c.z < CF0 + 0.025 and abs(c.x - KX) > float(opt.get('knot_w', 0.035)))(f.calc_center_median())}
    cord -= band
    # (and the bits of the band left apart from the knot: black flecks on the robe)
    left, seen = set(), set()
    for f in cord:
        if f in seen: continue
        isl = []; stack = [f]; seen.add(f)
        while stack:
            g = stack.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h in cord and h not in seen: seen.add(h); stack.append(h)
        if len(isl) >= int(opt.get('cord_min', 80)): left.update(isl)
    print('TOP cord bits dropped', len(cord) - len(left)); cord = left
    for v in {v for f in cord for v in f.verts}: v.co.z += CL - CF0
    print('TOP cord band dropped', len(band), 'faces; knot at x', round(KX, 3), 'raised', round(CL - CF0, 3))
    # (cord_old=0: the knot and tails go too, only the new band stays: half sunk in the robe they read as black streaks)
    if opt.get('cord_old', '1') == '0': cord = set(); print('TOP cord: old knot and tails dropped')
LIFT = float(opt.get('cord_lift', 0.002))
cvs = list({v for f in cord for v in f.verts}); need = {}
for v in cvs:
    d = Vector((v.co.x - spine.x, v.co.y - spine.y, 0))
    if d.length < 1e-4: need[v] = 0.0; continue
    d.normalize(); ho = new_robe.ray_cast(v.co + d * 0.0002, d, 0.08)
    if ho[0] is not None and ho[1].dot(d) > 0: need[v] = (ho[0] - v.co).length + LIFT       # inside: out past it
    else:
        hi = new_robe.ray_cast(v.co, -d, 0.03)
        need[v] = -max(0.0, (hi[0] - v.co).length - LIFT) if hi[0] is not None else 0.0
ckd = KDTree(len(cvs))
for k_, v in enumerate(cvs): ckd.insert(v.co, k_)
ckd.balance()
shift = {v: max(need[cvs[k_]] for _, k_, _ in ckd.find_range(v.co, float(opt.get('cord_spread', 0.012)))) for v in cvs}
sv = list(shift.values()) or [0.0]; print('TOP cord moves min/median/max', round(min(sv), 4), round(float(np.median(sv)), 4), round(max(sv), 4))
for _ in range(int(opt.get('cord_smooth', 3))):
    shift = {v: (shift[v] + sum(shift.get(e.other_vert(v), shift[v]) for e in v.link_edges)) / (1 + len(v.link_edges)) for v in cvs}
for v in cvs:
    d = Vector((v.co.x - spine.x, v.co.y - spine.y, 0))
    if d.length > 1e-4: v.co = v.co + d.normalized() * shift[v]
if CL > 0:
    NA, NS_, TR = 128, 8, float(opt.get('cord_r', 0.0035))
    ndl = nb.verts.layers.deform.verify(); nb.verts.ensure_lookup_table()
    pool = [v for v in nb.verts if v.link_faces and abs(v.co.z - CL) < 0.03]
    pk = KDTree(len(pool))
    for k_, v in enumerate(pool): pk.insert(v.co, k_)
    pk.balance()
    rr = []
    for k in range(NA):
        an = 2 * math.pi * k / NA; d = Vector((math.sin(an), -math.cos(an), 0)); o = Vector((spine.x, spine.y, CL))
        # (from the spine outward, through the robe's layers while each lies within 15 mm of the last: from outside, the
        # rays met the sleeves hanging by the waist and the band stood out at the sides)
        last, cur = None, o
        for _ in range(8):
            h = new_robe.ray_cast(cur, d, 0.2 if last is None else float(opt.get('loop_gap', 0.015)))
            if h[0] is None: break
            last = (h[0] - o).length; cur = h[0] + d * 0.0003
            if opt.get('loop_layer') == 'inner': break     # (the first layer: under the bow, which it stood out over)
        rr.append(last)
    good = [x for x in rr if x]; rr = [x if x else sum(good) / len(good) for x in rr]
    for _ in range(0 if opt.get('loop_layer') == 'inner' else 3): rr = [max(rr[k - 1], rr[k], rr[(k + 1) % NA]) for k in range(NA)]
    for _ in range(4): rr = [(rr[k - 1] + 2 * rr[k] + rr[(k + 1) % NA]) / 4 for k in range(NA)]
    ring = []
    for k in range(NA):
        an = 2 * math.pi * k / NA; d = Vector((math.sin(an), -math.cos(an), 0)); c = Vector((spine.x, spine.y, CL)) + d * (rr[k] + TR + float(opt.get('cord_off', 0.0012)))
        acc = {}; tot = 0.0
        for co, ki, dist in pk.find_n(c, 8):
            wk = 1.0 / max(dist, 1e-4); tot += wk
            for g, w in pool[ki][ndl].items(): acc[g] = acc.get(g, 0.0) + wk * w
        acc = torso_only(acc, {g.index: g.name for g in frm.vertex_groups})
        best = sorted(acc.items(), key=lambda kv: -kv[1])[:4]; sm = sum(w for _, w in best) or 1.0
        row = []
        for j in range(NS_):
            bj = 2 * math.pi * j / NS_; v = nb.verts.new(c + d * (TR * math.cos(bj)) + Vector((0, 0, TR * math.sin(bj))))
            for g, w in best: v[ndl][g] = w / sm
            row.append(v)
        ring.append(row)
    for k in range(NA):
        for j in range(NS_):
            f = nb.faces.new((ring[k][j], ring[(k + 1) % NA][j], ring[(k + 1) % NA][(j + 1) % NS_], ring[k][(j + 1) % NS_]))
            f.smooth = True
            for l in f.loops: l[nuv].uv = cord_uv
            f.normal_update(); c = f.calc_center_median(); an = 2 * math.pi * k / NA
            ctr = Vector((spine.x, spine.y, CL)) + Vector((math.sin(an), -math.cos(an), 0)) * (rr[k] + TR + float(opt.get('cord_off', 0.0012)))
            if f.normal.dot(c - ctr) < 0: f.normal_flip()
    print('TOP cord loop', NA * NS_, 'faces at z', CL)
bmesh.ops.delete(ob, geom=[f for f in ob.faces if f not in cord], context='FACES')
ob.transform(old.matrix_world.inverted()); ob.to_mesh(old.data); ob.free()
nb.transform(nw.matrix_world.inverted()); nb.to_mesh(nw.data); nb.free()

# the old top (now its cord only) joined into the new one, which takes its name and material
mat = old.data.materials[0]; name = old.name
for o in bpy.context.selected_objects: o.select_set(False)
old.select_set(True); nw.select_set(True); bpy.context.view_layer.objects.active = nw
bpy.ops.object.join()
nw.data.materials.clear(); nw.data.materials.append(mat)
for p in nw.data.polygons: p.material_index = 0
nw.name = name; nw.data.name = name

# (cuff=w) the purple band round each arm at the hem
CF = float(opt.get('cuff', 0))
if CF > 0:
    me = nw.data; bm = bmesh.new(); bm.from_mesh(me); bm.transform(nw.matrix_world)
    uvl = bm.loops.layers.uv.active; dl = bm.verts.layers.deform.verify(); bm.verts.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    pool = [v for v in bm.verts if v.link_faces and abs(along(v.co)[0] - HEM) < 0.03 and along(v.co)[1] < 0.12]
    kd = KDTree(len(pool))
    for k_, v in enumerate(pool): kd.insert(v.co, k_)
    kd.balance()
    NA, ROWS = 64, [HEM - CF, HEM - CF / 2, HEM, HEM + 0.0005]; made = 0
    for sh, ad in sides:
        e1 = ad.cross(Vector((0, 0, 1))).normalized(); e2 = ad.cross(e1).normalized()
        dirs_ = [e1 * math.cos(2 * math.pi * k / NA) + e2 * math.sin(2 * math.pi * k / NA) for k in range(NA)]
        rr = []
        for rd in dirs_:
            vals = []
            for t in (HEM - CF, HEM - CF / 2, HEM, HEM + 0.003):
                h = tree.ray_cast(sh + ad * t + rd * 0.15, -rd, 0.15)
                if h[0] is not None: vals.append((h[0] - (sh + ad * t)).length)
            rr.append(max(vals) if vals else None)
        good = [x for x in rr if x]; rr = [x if x else sum(good) / len(good) for x in rr]
        for _ in range(4): rr = [(rr[k - 1] + 2 * rr[k] + rr[(k + 1) % NA]) / 4 for k in range(NA)]
        rr = [x + float(opt.get('cuff_lift', 0.0015)) for x in rr]
        ring = []
        for j, t in enumerate(ROWS):
            row = []
            for k, rd in enumerate(dirs_):
                v = bm.verts.new(sh + ad * t + rd * (rr[k] - (0.003 if j == len(ROWS) - 1 else 0.0)))
                acc = {}; tot = 0.0
                for co, ki, dist in kd.find_n(v.co, 8):
                    wk = 1.0 / max(dist, 1e-4); tot += wk
                    for g, w in pool[ki][dl].items(): acc[g] = acc.get(g, 0.0) + wk * w
                best = sorted(acc.items(), key=lambda kv: -kv[1])[:4]; sm = sum(w for _, w in best) or 1.0
                for g, w in best: v[dl][g] = w / sm
                row.append(v)
            ring.append(row)
        for j in range(len(ROWS) - 1):
            for k in range(NA):
                f = bm.faces.new((ring[j][k], ring[j][(k + 1) % NA], ring[j + 1][(k + 1) % NA], ring[j + 1][k]))
                f.smooth = True; made += 1
                for l in f.loops: l[uvl].uv = purple_uv
                f.normal_update(); c = f.calc_center_median(); rv = (c - sh) - ad * (c - sh).dot(ad)
                if j < len(ROWS) - 2 and f.normal.dot(rv) < 0: f.normal_flip()
                if j == len(ROWS) - 2 and f.normal.dot(ad) < 0: f.normal_flip()
    bm.transform(nw.matrix_world.inverted()); bm.to_mesh(me); bm.free()
    print('TOP cuff band', made, 'faces')

# (waist_back=z0,z1: a purple band on the body round the waist between those heights, under the robe: the white
# dopo's sash met its robe in a slit at the back, and with the body hidden under the top the background showed through)
if opt.get('waist_back'):
    wz0, wz1 = map(float, opt['waist_back'].split(','))
    body_bm = bmesh.new()
    for o in bpy.data.objects:
        if o.type == 'MESH' and base(o.name).startswith('body'):
            t_ = bmesh.new(); t_.from_mesh(o.data); t_.transform(o.matrix_world); m_ = bpy.data.meshes.new('t'); t_.to_mesh(m_); t_.free(); body_bm.from_mesh(m_); bpy.data.meshes.remove(m_)
    body_tree = BVHTree.FromBMesh(body_bm)
    me = nw.data; bm = bmesh.new(); bm.from_mesh(me); bm.transform(nw.matrix_world)
    uvl = bm.loops.layers.uv.active; dl = bm.verts.layers.deform.verify(); bm.verts.ensure_lookup_table()
    pool = [v for v in bm.verts if v.link_faces and wz0 - 0.03 < v.co.z < wz1 + 0.03]
    kd = KDTree(len(pool))
    for k_, v in enumerate(pool): kd.insert(v.co, k_)
    kd.balance()
    NA, ROWS = 96, [wz0 + (wz1 - wz0) * j / 3 for j in range(4)]; ring = []
    for z in ROWS:
        row = []
        for k in range(NA):
            an = 2 * math.pi * k / NA; d = Vector((math.sin(an), -math.cos(an), 0)); o = Vector((spine.x, spine.y, z))
            h = body_tree.ray_cast(o, d, 0.3)
            p = (h[0] if h[0] is not None else o + d * 0.1) + d * 0.0008
            v = bm.verts.new(p); acc = {}; tot = 0.0
            for co, ki, dist in kd.find_n(p, 8):
                wk = 1.0 / max(dist, 1e-4); tot += wk
                for g, w in pool[ki][dl].items(): acc[g] = acc.get(g, 0.0) + wk * w
            acc = torso_only(acc, {g.index: g.name for g in nw.vertex_groups})
            best = sorted(acc.items(), key=lambda kv: -kv[1])[:4]; sm = sum(w for _, w in best) or 1.0
            for g, w in best: v[dl][g] = w / sm
            row.append(v)
        ring.append(row)
    for j in range(len(ROWS) - 1):
        for k in range(NA):
            f = bm.faces.new((ring[j][k], ring[j][(k + 1) % NA], ring[j + 1][(k + 1) % NA], ring[j + 1][k])); f.smooth = True
            for l in f.loops: l[uvl].uv = purple_uv
            f.normal_update(); c = f.calc_center_median()
            if f.normal.dot(Vector((c.x - spine.x, c.y - spine.y, 0))) < 0: f.normal_flip()
    bm.transform(nw.matrix_world.inverted()); bm.to_mesh(me); bm.free()
    print('TOP waist backing', NA * 3, 'faces')

# (borrow=BOTTOM,SHOES: those items of `from` copied in as set's, their pieces under tops too (hidden under set's top
# where under from's); set's own go. Tripo's trousers' hems and shoes, fit to the body, were ragged (user))
BORROW = [x for x in opt.get('borrow', '').split(',') if x]
for slot in BORROW:
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and re.match(rf'item__{slot}__{SET}(__|$)', base(o.name)): bpy.data.objects.remove(o)
    n_c = 0
    for o in list(bpy.data.objects):
        if o.type != 'MESH' or not re.match(rf'item__{slot}__{FROM}(__|$)', base(o.name)): continue
        c_ = o.copy(); c_.data = o.data.copy(); bpy.context.scene.collection.objects.link(c_)
        nm = base(o.name).replace(f'item__{slot}__{FROM}', f'item__{slot}__{SET}', 1)
        m_ = re.search(r'__under_(\w+)$', nm)
        if m_:
            tok = set(re.findall(r'[A-Z]+[a-z0-9]+', m_.group(1)))
            if f'TOP{FROM}' in tok: tok.add(f'TOP{SET}')
            nm = nm[:m_.start()] + '__under_' + '_'.join(sorted(tok))
        c_.name = nm; c_.data.name = nm; n_c += 1
        # (shoe_smooth=N: the borrowed shoes' crumpled Tripo creases smoothed, N rounds keeping volume, the piece's own
        # border fixed so it still meets its neighbours; welded first so the shards smooth as one surface. "신발이
        # 매끄럽지 못한 느낌" (user))
        if slot == 'SHOES' and int(opt.get('shoe_smooth', 0)):
            sb = bmesh.new(); sb.from_mesh(c_.data)
            bmesh.ops.remove_doubles(sb, verts=sb.verts, dist=float(opt.get('shoe_weld', 0.0008)))
            for _ in range(int(opt['shoe_smooth'])):
                inner = [v for v in sb.verts if not v.is_boundary]
                bmesh.ops.smooth_laplacian_vert(sb, verts=inner, lambda_factor=float(opt.get('shoe_lambda', 0.5)),
                                                lambda_border=0.0, use_x=True, use_y=True, use_z=True, preserve_volume=True)
            for f in sb.faces: f.smooth = True
            sb.to_mesh(c_.data); sb.free()
        # (shoe_remesh=v: the borrowed shoes rebuilt as one surface: voxel-remeshed at v (its overlapping Tripo shards and
        # creases melt into one skin), smoothed shoe_smooth rounds, decimated back to about their old count; the bones'
        # weights carried over from the old shoes (nearest face, interpolated). Smoothing the shards alone left their
        # creases (user: "신발이 아직 거친면이 있음"))
        SZ = float(opt.get('shoe_flat', 0)); shoe_pick = None
        if slot == 'SHOES' and SZ > 0:
            # (the two colours: the median texel of the sole's light faces under SZ, of the upper's dark ones over it)
            simg = next(n.image for m in c_.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
            SW, SH = simg.size; SP = np.array(simg.pixels[:], np.float32).reshape(SH, SW, -1)[..., :3]
            sb = bmesh.new(); sb.from_mesh(c_.data); sb.transform(c_.matrix_world); suv = sb.loops.layers.uv.active
            cls = {True: [], False: []}
            for f in sb.faces:
                u = np.mean([tuple(l[suv].uv) for l in f.loops], 0); z = f.calc_center_median().z
                col = SP[min(SH - 1, max(0, int(u[1] * SH))), min(SW - 1, max(0, int(u[0] * SW)))]
                if 0.004 < z < SZ and col.mean() > 0.25: cls[True].append((u, col))
                elif z > SZ + 0.005 and col.mean() < 0.25: cls[False].append((u, col))
            sb.free(); shoe_pick = {}
            for k_, lst in cls.items():
                cols = np.array([c for _, c in lst]); med = np.median(cols, 0)
                shoe_pick[k_] = lst[int(np.argmin(((cols - med) ** 2).sum(1)))][0]; print('TOP shoe colour', 'sole' if k_ else 'upper', np.round(med, 3))
        if slot == 'SHOES' and float(opt.get('shoe_remesh', 0)) > 0:
            n_old = len(c_.data.polygons); print('TOP shoe object scale', [round(x, 4) for x in c_.matrix_world.to_scale()])
            tmp = bpy.data.objects.new('shoe_tmp', c_.data.copy()); bpy.context.scene.collection.objects.link(tmp)
            tmp.matrix_world = c_.matrix_world.copy()
            for vg in c_.vertex_groups: tmp.vertex_groups.new(name=vg.name)
            # (given a thickness first: the shards are open sheets, and the voxels lost most of the right shoe's)
            so_ = tmp.modifiers.new('so', 'SOLIDIFY'); so_.thickness = float(opt.get('shoe_thick', 0.004)); so_.offset = 0.0
            rm = tmp.modifiers.new('rm', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = float(opt['shoe_remesh']) / max(1e-6, c_.matrix_world.to_scale().x)
            bpy.context.view_layer.objects.active = tmp; bpy.ops.object.select_all(action='DESELECT'); tmp.select_set(True)
            bpy.ops.object.modifier_apply(modifier='so'); bpy.ops.object.modifier_apply(modifier='rm')
            sb = bmesh.new(); sb.from_mesh(tmp.data)
            for _ in range(int(opt.get('shoe_rsmooth', opt.get('shoe_smooth', 4)))):
                bmesh.ops.smooth_laplacian_vert(sb, verts=sb.verts, lambda_factor=0.5, lambda_border=0.0, use_x=True, use_y=True, use_z=True, preserve_volume=True)
            sb.to_mesh(tmp.data); sb.free()
            dm = tmp.modifiers.new('dm', 'DECIMATE'); dm.ratio = min(1.0, n_old * 1.2 / max(1, len(tmp.data.polygons)))
            bpy.ops.object.modifier_apply(modifier='dm')
            # (weights: inverse-distance blend of the old shoes' 4 nearest vertices, in the mesh's own space. A data
            # transfer modifier gave the right shoe the left foot's)
            okd = KDTree(len(c_.data.vertices))
            for v in c_.data.vertices: okd.insert(v.co, v.index)
            okd.balance(); ow = [{g.group: g.weight for g in v.groups} for v in c_.data.vertices]
            gl = list(tmp.vertex_groups)
            for v in tmp.data.vertices:
                acc = {}
                for co_, idx, d_ in okd.find_n(v.co, 4):
                    k_ = 1.0 / max(d_, 1e-5)
                    for g, w in ow[idx].items(): acc[g] = acc.get(g, 0.0) + w * k_
                    tot = None
                top = sorted(acc.items(), key=lambda x: -x[1])[:4]; sm = sum(w for _, w in top) or 1.0
                for g, w in top: gl[g].add([v.index], w / sm, 'REPLACE')
            for pg in tmp.data.polygons: pg.use_smooth = True
            if not tmp.data.uv_layers: tmp.data.uv_layers.new(name='UVMap')
            old_me = c_.data; tmp.data.materials.clear()
            for m in old_me.materials: tmp.data.materials.append(m)
            c_.data = tmp.data; bpy.data.objects.remove(tmp)
            print('TOP borrowed shoes remeshed:', n_old, '->', len(c_.data.polygons), 'faces')
        # (shoe_flat=z: the borrowed shoes in two flat colours as the robe: the sole up to z (cut straight there), the
        # rest the upper's. Its texture's light and dark blotches read as a rough surface (user: "신발이 아직 거친면이 있음"))
        if shoe_pick:
            mw = c_.matrix_world; mi = mw.inverted()
            sb = bmesh.new(); sb.from_mesh(c_.data); sb.transform(mw); suv = sb.loops.layers.uv.active
            bmesh.ops.bisect_plane(sb, geom=list(sb.verts) + list(sb.edges) + list(sb.faces), plane_co=(0, 0, SZ), plane_no=(0, 0, 1))
            n_sole = 0
            for f in sb.faces:
                k_ = f.calc_center_median().z < SZ; n_sole += k_
                for l in f.loops: l[suv].uv = shoe_pick[k_]
            sb.transform(mi); sb.to_mesh(c_.data); sb.free()
            print('TOP borrowed shoes flat: sole', n_sole, 'faces of', len(c_.data.polygons))
        # (bottom_in=m: the borrowed trousers drawn in under set's robe: each vertex the robe's surface lies inside of
        # (a ray in toward the spine meets it) or less than m outside of (a ray out meets it within m) goes in along the
        # horizontal to m under it. Under the white robe they poked through unseen; under the purple, white patches (user's
        # earlier "구멍" complaint))
        BI = float(opt.get('bottom_in', 0))
        if slot == 'BOTTOM' and BI > 0:
            mw = c_.matrix_world; mi = mw.inverted(); moved = 0
            for v in c_.data.vertices:
                p = mw @ v.co; h = Vector((p.x - spine.x, p.y - spine.y, 0)); r = h.length
                if r < 1e-4 or p.z < 0.02: continue
                d = h / r; hit_in = new_robe.ray_cast(p, -d, r)
                if hit_in[0] is not None: tgt = r - hit_in[3] - BI
                else:
                    hit_out = new_robe.ray_cast(p, d, BI)
                    if hit_out[0] is None: continue
                    tgt = r + hit_out[3] - BI
                if tgt < r: v.co = mi @ (p - d * (r - max(tgt, 0.02))); moved += 1
            print('TOP borrowed', base(c_.name), 'drawn in under the robe:', moved, 'verts')
    print('TOP borrowed', slot, n_c, 'pieces from', FROM)
# the body hidden under set's top (and borrowed items) as under from's
renamed = 0
for slot in ['TOP'] + BORROW:
    TS, TF = f'{slot}{SET}', f'{slot}{FROM}'
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        m = re.match(r'^body(?:__(\w+?))?((?:_\d+)?(?:\.\d+)?)$', o.name)
        if not m: continue
        tok = set(re.findall(r'[A-Z]+[a-z0-9]+', m.group(1) or ''))
        want = (tok | {TS}) if TF in tok else (tok - {TS})
        if want != tok:
            o.name = 'body' + ('__' + '_'.join(sorted(want)) if want else '') + m.group(2); renamed += 1
print('TOP body pieces retagged', renamed)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_apply=False, export_image_format='AUTO')
