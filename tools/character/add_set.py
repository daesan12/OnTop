"""Add the general's outfit to the shared layered build as item set g: -- <shared_layers.glb> <general_parts.glb> <out.glb> [s=1.2]

Reference for new outfits (docs/character-outfits.md): the common steps are the scale onto the body, parts to slots
(SLOT_PARTS), the push-out, weights from the body, covered body pieces and their names. Most options below are
fixes for the general alone (cap, cords, collar lining, under-tunic, shoulder plates, arm rings, helmet paint) and
pick Tripo parts by their numbers (tripo_part_N), so on another outfit's parts they would edit the wrong pieces:
a new outfit starts from a copy with SLOT_PARTS and set= changed and those blocks removed or switched off.

The base body files that build_layers.py starts from are gone, so the set goes onto the finished build instead:
- the Tripo general, scaled by s, lies on the shared body (overlay.py); its parts become the five slots:
  HAIR the helmet, plus the black cap, red cords and tassels taken from its head (its face skin is dropped),
  FACE the sunglasses, TOP the armour, belt and forearm guards, BOTTOM the trousers and skirt panels,
  SHOES the boots; its own hands are dropped (the body's are used);
- items are pushed 2 mm outside the body and take its weights by nearest surface; the helmet, cap and glasses
  follow the head alone; the skirt panels hang from the hips (half the copied leg weights at the knee);
- body faces an item covers are split into pieces whose names gain that item (body__..._TOPg), hidden while it
  is worn. Covered goes by body region (each face's leading bone): the top hides the trunk and arms to the
  forearm guards' ends but never the neck, the trousers the hips and legs above the boots' rim, the boots the
  rest, the helmet the scalp under its cap; the glasses hide nothing. A dark lining inside the collar stands in
  for the hidden chest there.
Everything already in the build (items, body pieces, armature, actions) is kept as it is.
"""
import bpy, bmesh, sys, re, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

a = sys.argv[sys.argv.index('--') + 1:]
src, gen_path, out = a[0], a[1], a[2]
opt = dict(x.split('=') for x in a[3:])
S = float(opt.get('s', 1.2)); SET = opt.get('set', 'g')
SLOT_PARTS = {'HAIR': ['tripo_part_0', 'tripo_part_14'], 'FACE': ['tripo_part_7'],
              'TOP': ['tripo_part_1', 'tripo_part_6', 'tripo_part_8', 'tripo_part_9'],
              'BOTTOM': ['tripo_part_5', 'tripo_part_3', 'tripo_part_10'], 'SHOES': ['tripo_part_2', 'tripo_part_13']}
HEAD_PART, PANELS = 'tripo_part_4', ('tripo_part_3', 'tripo_part_10')

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
src_obj = None
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

# the general's parts, scaled onto the body
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=gen_path)
new = [o for o in bpy.data.objects if o not in before]
parts = {}
for o in new:
    if o.type != 'MESH': continue
    o.data.transform(Matrix.Diagonal((S, S, S, 1)) @ o.matrix_world); o.parent = None; o.matrix_world = Matrix()
    parts[re.sub(r'\.\d+$', '', o.name)] = o
for o in new:
    if o.type != 'MESH': bpy.data.objects.remove(o)

def tex_colour(o):
    """Per-face texture colour (at the face's UV centre) of a part's base-colour image."""
    img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w, h = img.size; px = np.array(img.pixels[:], np.float32).reshape(h, w, 4)
    uv = o.data.uv_layers.active.data; out = []
    for p in o.data.polygons:
        u = sum((uv[li].uv for li in p.loop_indices), Vector((0, 0))) / p.loop_total
        out.append(px[min(h - 1, max(0, int(u.y * h))), min(w - 1, max(0, int(u.x * w))), :3])
    return np.array(out)

# from the Tripo head: the black cap (dark, above the glasses or behind the ears), the red cords and the tassels
head = parts.pop(HEAD_PART)
C = tex_colour(head)
glasses_top = max(v.co.z for v in parts['tripo_part_7'].data.vertices)
ear_y = J['Head'].y
keep = []
for p, c in zip(head.data.polygons, C):
    r, g, b = c; mx, mn = c.max(), c.min(); z, y = p.center.z, p.center.y
    dark = mx < 0.16
    red = r > 0.25 and r > 1.8 * g and r > 1.8 * b
    gold = r > 0.35 and g > 0.22 and b < 0.6 * g and not (r > 0.6 and g > 0.45 and b > 0.35)   # not skin
    skin = r > 0.6 and g > 0.42 and b > 0.32
    if skin: continue
    # its black cap is rebuilt from the body below (picked by colour, its edges came out toothed)
    if red or (gold and z < J['Head'].z): keep.append(p.index)
bm = bmesh.new(); bm.from_mesh(head.data); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in set(keep)], context='FACES')
# the cords' ragged fringe (user: black marks by the face): below the head joint, sliver faces (shortest edge under
# a fifth of the longest) and the small islands they leave (under cord_island faces) are removed, so the cords hang
# as clean ribbons
hz_ = J['Head'].z; gone_ = 0
for _ in range(3):
    sl = [f for f in bm.faces if f.calc_center_median().z < hz_ and min(e.calc_length() for e in f.edges) < 0.2 * max(e.calc_length() for e in f.edges)]
    bmesh.ops.delete(bm, geom=sl, context='FACES'); gone_ += len(sl)
seen_ = set(); small = []
for f0 in bm.faces:
    if f0 in seen_: continue
    isl, st = [], [f0]
    while st:
        f = st.pop()
        if f in seen_: continue
        seen_.add(f); isl.append(f)
        for e in f.edges:
            for g in e.link_faces:
                if g not in seen_: st.append(g)
    if len(isl) < int(opt.get('cord_island', 25)) and all(f.calc_center_median().z < hz_ for f in isl): small += isl
bmesh.ops.delete(bm, geom=small, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
print('CORDS fringe removed', gone_, 'slivers,', len(small), 'island faces')
# the cords' ragged edges stood out as dark slivers by the cheeks (user). Each cord (an island below the head
# joint) is measured along its length in 6 mm slices; across its width (its second principal axis) faces beyond the
# slice's 15th-85th percentile band (plus cord_edge, 1 mm) are cut, leaving a clean ribbon
seen_ = set(); trimmed = []
for f0 in list(bm.faces):
    if f0 in seen_: continue
    isl, st = [], [f0]
    while st:
        f = st.pop()
        if f in seen_: continue
        seen_.add(f); isl.append(f)
        for e in f.edges:
            for g in e.link_faces:
                if g not in seen_: st.append(g)
    # the cords between the crown band and the tassels' knots (z cord_lo..cord_hi)
    low = [f for f in isl if float(opt.get('cord_lo', 0.6)) < f.calc_center_median().z < float(opt.get('cord_hi', 0.775))]
    if len(low) < 30 or opt.get('cord_trim', '0') != '1': continue
    C_ = np.array([f.calc_center_median()[:] for f in low]); m_ = C_.mean(0)
    U_, S_, Vt_ = np.linalg.svd(C_ - m_, full_matrices=False)
    t_ = (C_ - m_) @ Vt_[0]; w_ = (C_ - m_) @ Vt_[1]
    for b0 in np.arange(t_.min(), t_.max() + 0.006, 0.006):
        sel = (t_ >= b0) & (t_ < b0 + 0.006)
        if sel.sum() < 4: continue
        lo_, hi_ = np.percentile(w_[sel], [15, 85]); e_ = float(opt.get('cord_edge', 0.001))
        trimmed += [low[i] for i in np.flatnonzero(sel & ((w_ < lo_ - e_) | (w_ > hi_ + e_)))]
bmesh.ops.delete(bm, geom=list(set(trimmed)), context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
print('CORDS edges trimmed', len(set(trimmed)), 'faces')
bm.to_mesh(head.data); bm.free()
print('HEAD kept', len(head.data.polygons), 'faces of cap, cords, tassels')
parts['tripo_cap'] = head; SLOT_PARTS['HAIR'].append('tripo_cap')

# the black cap under the helmet: the body's own scalp 1.5 mm out, every edge a plane cut
#   above the helmet band (BAND_Z); behind the ears (CAP_BACK_Y, the ears end at y 0.054) down to the nape (NAPE_Z)
#   The band slopes: its lower edge is z 0.789 at the front and 0.754 at the back (probe_band.py), so the cut is
#   the plane z = BAND_Z - BAND_SLOPE * y, 8 mm up into the band (a level cut showed a black strip on the forehead).
BAND_Z, BAND_SLOPE = float(opt.get('band_z', 0.7795)), float(opt.get('band_slope', 0.1))
CAP_BACK_Y, NAPE_Z = float(opt.get('back_y', 0.07)), float(opt.get('nape_z', 0.645))
cap = src_obj.copy(); cap.data = src_obj.data.copy(); bpy.context.scene.collection.objects.link(cap)
bm = bmesh.new(); bm.from_mesh(cap.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z < NAPE_Z - 0.02], context='FACES')
for co_, no_ in (((0, 0, BAND_Z), (0, BAND_SLOPE, 1)), ((0, CAP_BACK_Y, 0), (0, 1, 0)), ((0, 0, NAPE_Z), (0, 0, 1))):
    g = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=g, plane_co=co_, plane_no=no_)
inside = lambda c, m=0.0: c.z > BAND_Z - BAND_SLOPE * c.y + m or (c.y > CAP_BACK_Y + m and c.z > NAPE_Z + m)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if not inside(f.calc_center_median())], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.normal_update()
for v in bm.verts: v.co += v.normal * 0.0015
bm.to_mesh(cap.data); bm.free()
for g in list(cap.vertex_groups): cap.vertex_groups.remove(g)
cap.data.materials.clear()
img = bpy.data.images.new('cap_black', 4, 4); img.pixels = [0.045, 0.04, 0.045, 1.0] * 16; img.pack()
mat = bpy.data.materials.new('cap_black'); mat.use_nodes = True
tn = mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); mat.node_tree.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.6
cap.data.materials.append(mat)
uvl = cap.data.uv_layers.active or cap.data.uv_layers.new()
for d in uvl.data: d.uv = (0.5, 0.5)
# the cap joins the helmet's other parts, which carry their own UV layer name: match it
gen_uv = parts['tripo_part_0'].data.uv_layers.active.name; uvl.name = gen_uv
for n in [u.name for u in cap.data.uv_layers if u.name != gen_uv]: cap.data.uv_layers.remove(cap.data.uv_layers[n])
parts['body_cap'] = cap; SLOT_PARTS['HAIR'].append('body_cap')
print('CAP', len(cap.data.polygons), 'faces')

# a dark lining inside the stand-up collar: the body round the neck's foot 2.5 mm out, so looking up under the
# chin or down past the collar there is cloth, not the hollow where the hidden chest was
NZ, NXY = J['Neck'].z, Vector((J['Neck'].x, J['Neck'].y))
lin = src_obj.copy(); lin.data = src_obj.data.copy(); bpy.context.scene.collection.objects.link(lin)
bm = bmesh.new(); bm.from_mesh(lin.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
LT = NZ + float(opt.get('lining_up', 0.022))
ring = lambda c: NZ - float(opt.get('lining_down', 0.1)) < c.z < LT + 0.01 and (Vector((c.x, c.y)) - NXY).length < float(opt.get('lining_r', 0.09))   # down the whole V
bmesh.ops.delete(bm, geom=[f for f in bm.faces if not ring(f.calc_center_median())], context='FACES')
# a clean neckline (user: tidy the inner shirt's neck; the face-by-face edge was a sawtooth): cut level at LT
bmesh.ops.bisect_plane(bm, geom=list({*bm.faces, *bm.edges, *bm.verts}), plane_co=(0, 0, LT), plane_no=(0, 0, 1))
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z > LT], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.normal_update()
for v in bm.verts: v.co += v.normal * 0.0025
bm.to_mesh(lin.data); bm.free()
for g in list(lin.vertex_groups): lin.vertex_groups.remove(g)
lin.data.materials.clear()
# lining_rgb (default the lapels' red lining, darkened): near-black (0.09) showed as a black border between the
# lapels (user)
LR = [float(x) for x in opt.get('lining_rgb', '0.52,0.17,0.1').split(',')]
img = bpy.data.images.new('collar_lining', 4, 4); img.pixels = [*LR, 1.0] * 16; img.pack()
mat = bpy.data.materials.new('collar_lining'); mat.use_nodes = True
tn = mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); mat.node_tree.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
lin.data.materials.append(mat)
uvl = lin.data.uv_layers.active or lin.data.uv_layers.new()
for d in uvl.data: d.uv = (0.5, 0.5)
top_uv = parts['tripo_part_1'].data.uv_layers.active.name; uvl.name = top_uv
for n in [u.name for u in lin.data.uv_layers if u.name != top_uv]: lin.data.uv_layers.remove(lin.data.uv_layers[n])
parts['collar_lining'] = lin; SLOT_PARTS['TOP'].append('collar_lining')
print('LINING', len(lin.data.polygons), 'faces')

# a black under-tunic: the body's own trunk, shoulders and arms (to the forearm guards' ends) 1.2 mm out, under
# the armour (pushed to 2 mm). It moves exactly as the skin does, so where the stiff plates open a gap as the arms
# move, the gap shows black cloth, not the hollow where the hidden body was (the shoulders showed holes).
TUNIC_BONES = {'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'}
guard_end = max(abs(v.co.x) for n in ('tripo_part_8', 'tripo_part_9') for v in parts[n].data.vertices)
tun = src_obj.copy(); tun.data = src_obj.data.copy(); bpy.context.scene.collection.objects.link(tun)
gname = {g.index: g.name[len('mixamorig:'):] for g in tun.vertex_groups if g.name.startswith('mixamorig:')}
lead_v = [max(((e.weight, gname[e.group]) for e in v.groups if e.group in gname), default=(0, ''))[1] for v in tun.data.vertices]
bm = bmesh.new(); bm.from_mesh(tun.data)
def tunic_face(f):
    votes = {}
    for v in f.verts: votes[lead_v[v.index]] = votes.get(lead_v[v.index], 0) + 1
    b_ = max(votes, key=votes.get); c = f.calc_center_median()
    if b_ not in TUNIC_BONES or abs(c.x) > guard_end - 0.005: return False
    return not (c.z > NZ - 0.005 and (Vector((c.x, c.y)) - NXY).length < 0.065)      # the neck stays bare
bmesh.ops.delete(bm, geom=[f for f in bm.faces if not tunic_face(f)], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.normal_update()
for v in bm.verts: v.co += v.normal * 0.0012
# the tunic is cut across the arms where the guards' rings change (ring_a, ring_b), so its colours meet in round
# rings too (a face-by-face split had left sawtooth edges)
RA_, RB_ = float(opt.get('ring_a', 0.205)), float(opt.get('ring_b', 0.225))
for b0 in (RA_, RB_):
    for sg in (1, -1):
        bmesh.ops.bisect_plane(bm, geom=list({*bm.faces, *bm.edges, *bm.verts}), plane_co=(sg * b0, 0, 0), plane_no=(1, 0, 0))
bm.to_mesh(tun.data); bm.free()
# sleeve=gold: the upper arm's tunic faces (and the armpits') take the breastplate's own material at one gold texel;
# sleeve=black leaves the tunic all black; sleeve=rings (the default) is below.
SLEEVE = opt.get('sleeve', 'rings')
gname = {g.index: g.name[len('mixamorig:'):] for g in tun.vertex_groups if g.name.startswith('mixamorig:')}
lead_v = [max(((e.weight, gname[e.group]) for e in v.groups if e.group in gname), default=(0, ''))[1] for v in tun.data.vertices]
def sleeve_face(p):
    votes = {}
    for i in p.vertices: votes[lead_v[i]] = votes.get(lead_v[i], 0) + 1
    b_ = max(votes, key=votes.get)
    return b_ in ('LeftArm', 'RightArm') or abs(p.center.x) > float(opt.get('sleeve_x', 0.085))   # the armpits too
sleeve_faces = [p.index for p in tun.data.polygons if sleeve_face(p)] if SLEEVE == 'gold' else []
# sleeve=rings (default; user: the black had grown into the whole upper arm, and the rings were uneven): the arms'
# tunic (upper arm and forearm, outside the collar) is gold except between ring_a and ring_b, where it is the black
# band under the guards' own band, so wherever the armour has gaps the arm still shows the same round rings
def ring_face(p):
    votes = {}
    for i in p.vertices: votes[lead_v[i]] = votes.get(lead_v[i], 0) + 1
    x = abs(p.center.x)
    return max(votes, key=votes.get) in ('LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm') and x > 0.08 and not RA_ <= x < RB_
if SLEEVE == 'rings': sleeve_faces = [p.index for p in tun.data.polygons if ring_face(p)]

for g in list(tun.vertex_groups): tun.vertex_groups.remove(g)
tun.data.materials.clear()
# tunic_tone: near-black (0.05) took no light and read as holes wherever it showed; a dark charcoal still reads black
# but shades like cloth
TONE = float(opt.get('tunic_tone', 0.13))
img = bpy.data.images.new('under_tunic', 4, 4); img.pixels = [TONE, TONE * 0.82, TONE * 0.7, 1.0] * 16; img.pack()     # warm, toward the gold
mat = bpy.data.materials.new('under_tunic'); mat.use_nodes = True
tn = mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); mat.node_tree.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
tun.data.materials.append(mat)
uvl = tun.data.uv_layers.active or tun.data.uv_layers.new()
for d in uvl.data: d.uv = (0.5, 0.5)
uvl.name = top_uv
for n in [u.name for u in tun.data.uv_layers if u.name != top_uv]: tun.data.uv_layers.remove(tun.data.uv_layers[n])
# sleeve_paint (default 0.3): Tripo painted the sleeve between each shoulder plate and forearm guard dark between
# its gold strips, and the breastplate's flanks under the arms and the forearm guards' fronts dark too; with the arms
# down those read as carved-out hollows at both sides (user; the black inside is wanted). In the texture, inside the
# UV islands of the breastplate's faces outside the collar below the plates and of the guards' faces turned away from
# the arm's axis, pixels darker than sleeve_paint fade into the plates' median gold, shaded by their old brightness
# so the relief stays. (Repainting whole faces left sawtooth edges.) The guards' insides and the tunic stay dark.
PAINT = float(opt.get('sleeve_paint', 0.3))
BAND_FROM = float(opt.get('band_from', 0.15))   # the forearm guards' start: the black band begins here
if sleeve_faces or PAINT > 0:   # (sleeve_faces: the gold tunic faces, the cuff's included)
    bp = parts['tripo_part_1']; bmat = bp.data.materials[0]
    bimg = next(n.image for n in bmat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    bw, bh = bimg.size; px = np.array(bimg.pixels[:], dtype=np.float32).reshape(bh, bw, 4)
    texels = lambda u: px[np.clip((u[:, 1] * bh).astype(int), 0, bh - 1), np.clip((u[:, 0] * bw).astype(int), 0, bw - 1), :3]
    buv = bp.data.uv_layers.active.data
    # the plate faces' texels (outside the collar, above the sleeves); the one nearest their median colour
    cand = np.array([buv[li].uv[:] for p in bp.data.polygons if abs(p.center.x) > 0.08 and p.center.z > 0.535 for li in p.loop_indices])
    cols = texels(cand)
    gold_uv = cand[int(np.argmin(np.linalg.norm(cols - np.median(cols, 0), axis=1)))]
    # tone (user: the filled gold read too strong a yellow against the black around it): the fills take an antique
    # gold instead, the plates' median gold mixed fill_dark (0.3) toward the warm dark tunic and fill_desat (0.25)
    # toward grey, and the patches the plate texel nearest it, so they sit between the gold strips and the black
    gold = np.median(cols, 0).astype(np.float32)
    K, DS = float(opt.get('fill_dark', 0.3)), float(opt.get('fill_desat', 0.25))
    warm_dark = np.array([0.13, 0.105, 0.09], np.float32)
    antique = gold * (1 - K) + warm_dark * K
    antique = antique * (1 - DS) + antique.mean() * DS
    antique_uv = cand[int(np.argmin(np.linalg.norm(cols - antique, axis=1)))]
    # the guards' gold rings: the plates' own gold a shade down (ring_gold 0.85), so they match the plates above
    ring_uv = cand[int(np.argmin(np.linalg.norm(cols - gold * float(opt.get('ring_gold', 0.85)), axis=1)))]
    # the sleeves' gold: brighter than the plates' median (sleeve_glow 1.2; user: match the bright plates), as the
    # plain sleeve has none of the plates' painted highlights
    SG = float(opt.get('sleeve_glow', 1.2))
    bright_uv = cand[int(np.argmin(np.linalg.norm(cols - np.clip(gold * SG, 0, 1), axis=1)))]
    print('FILL tone gold', np.round(gold, 3), 'antique', np.round(antique, 3), 'patch texel', np.round(cols[int(np.argmin(np.linalg.norm(cols - antique, axis=1)))], 3))
# arm_gold (default on; user: the gold beside the black band should shine like the plates, not be one flat colour):
# the arm's gold (the tunic sleeve above and below the band, the guards' gold rings) takes its own small texture,
# wrapped round the arm: u is the angle about the arm's axis, v the distance along it. The texture is the plates'
# gold with a broad soft highlight and a narrower second one round the arm, fine brushed streaks along it, and a
# bright bevel with a thin dark line where the gold meets the black band on each side.
RA_G, RB_G = float(opt.get('ring_a', 0.205)), float(opt.get('ring_b', 0.225))
V0, V1 = 0.08, 0.30
ARM_MAT = None
if opt.get('arm_gold', '1') == '1':
    W_, H_ = 256, 512; rng = np.random.default_rng(7)
    uu = (np.arange(W_) + 0.5) / W_; vv = (np.arange(H_) + 0.5) / H_
    ang = uu * 2 * np.pi
    hl = 0.78 + 0.42 * np.maximum(0, np.cos(ang - 0.6)) ** 2 + 0.22 * np.maximum(0, np.cos(ang + 2.2)) ** 6
    streak = rng.normal(0, 1, W_); streak = np.convolve(streak, np.ones(3) / 3, 'same') * 0.05
    xx = V0 + vv * (V1 - V0)                                              # |x| along the arm
    d = np.minimum(np.abs(xx - RA_G), np.abs(xx - RB_G))
    out_ = (xx < RA_G) | (xx >= RB_G)
    bevel = np.where(out_ & (d < 0.004), 0.28 * (1 - d / 0.004), 0.0) - np.where(out_ & (d < 0.0012), 0.35, 0.0)
    lum = hl[None, :] + streak[None, :] + bevel[:, None] + rng.normal(0, 0.015, (H_, W_))
    base = np.clip(gold * 1.08, 0, 1).astype(np.float32)
    rgb = np.clip(base[None, None, :] * lum[..., None] + np.maximum(0, lum - 1.05)[..., None] * 0.6, 0, 1)
    img_ = bpy.data.images.new('arm_gold', W_, H_)
    img_.pixels.foreach_set(np.concatenate([rgb, np.ones((H_, W_, 1))], -1).astype(np.float32).ravel()); img_.pack()
    ARM_MAT = bpy.data.materials.new('arm_gold'); ARM_MAT.use_nodes = True
    tn_ = ARM_MAT.node_tree.nodes.new('ShaderNodeTexImage'); tn_.image = img_; tn_.extension = 'REPEAT'
    bs_ = next(n for n in ARM_MAT.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    ARM_MAT.node_tree.links.new(tn_.outputs['Color'], bs_.inputs['Base Color'])
    print('ARM gold texture', W_, H_, 'base', np.round(base, 3))
def arm_uvs(cos):
    """Cylindrical (u, v) for one face's corner positions, unwrapped across the angle seam."""
    out = []
    for c in cos:
        a0 = J['LeftArm' if c.x > 0 else 'RightArm']
        u = (math.atan2(c.z - a0.z, c.y - a0.y) / (2 * math.pi)) % 1.0
        out.append([u, (abs(c.x) - V0) / (V1 - V0)])
    us = [q[0] for q in out]
    if max(us) - min(us) > 0.5:
        for q in out:
            if q[0] < 0.5: q[0] += 1.0
    return out
if sleeve_faces:
    tun.data.materials.append(bmat); k = len(tun.data.materials) - 1
    if ARM_MAT is not None: tun.data.materials.append(ARM_MAT); ka = len(tun.data.materials) - 1
    for i in sleeve_faces:
        p = tun.data.polygons[i]
        if ARM_MAT is not None and SLEEVE == 'rings':
            p.material_index = ka
            for li, q in zip(p.loop_indices, arm_uvs([tun.data.vertices[tun.data.loops[li].vertex_index].co for li in p.loop_indices])):
                uvl.data[li].uv = q
            continue
        p.material_index = k
        for li in p.loop_indices: uvl.data[li].uv = bright_uv
    print('SLEEVE gold', len(sleeve_faces), 'faces, texel', np.round(np.median(cols, 0), 3))
if PAINT > 0:
    axes = {sgn: (J[f'{side}Arm'], (J[f'{side}ForeArm'] - J[f'{side}Arm']).normalized()) for sgn, side in ((1, 'Left'), (-1, 'Right'))}
    mask = np.zeros((bh, bw), bool); faces = 0
    def raster(uv):
        pts = uv * (bw, bh)
        for t in range(1, len(pts) - 1):
            tri = pts[[0, t, t + 1]]
            x0, y0 = np.floor(tri.min(0)).astype(int); x1, y1 = np.ceil(tri.max(0)).astype(int) + 1
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, bw), min(y1, bh)
            if x1 <= x0 or y1 <= y0: continue
            gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            ed = [(tri[(k + 1) % 3, 0] - tri[k, 0]) * (gy - tri[k, 1]) - (tri[(k + 1) % 3, 1] - tri[k, 1]) * (gx - tri[k, 0]) for k in range(3)]
            mask[y0:y1, x0:x1] |= ((ed[0] >= 0) & (ed[1] >= 0) & (ed[2] >= 0)) | ((ed[0] <= 0) & (ed[1] <= 0) & (ed[2] <= 0))
    # the guards are left alone: their black bands between gold rims are the design (user)
    for n in ('tripo_part_1',):
        o = parts[n]; ouv = o.data.uv_layers.active.data
        for p in o.data.polygons:
            c = p.center
            if n == 'tripo_part_1':
                if not (0.08 < abs(c.x) <= BAND_FROM and c.z <= 0.535): continue   # sleeves and flanks; not the band zone
            else:                                                         # the guards: their outer faces only
                j, ax = axes[1 if (c.x > 0) == (axes[1][0].x > 0) else -1]
                r = (c - j) - ax * (c - j).dot(ax)
                if r.length < 1e-6 or p.normal.dot(r.normalized()) < 0.3: continue
            raster(np.array([ouv[li].uv[:] for li in p.loop_indices])); faces += 1
    for _ in range(2):                                                    # 2 px past the island edges (filtering)
        mask |= np.roll(mask, 1, 0) | np.roll(mask, -1, 0) | np.roll(mask, 1, 1) | np.roll(mask, -1, 1)
    v = px[..., :3].max(-1)
    t = np.clip((PAINT - v) / (PAINT * 0.9), 0, 1) * mask              # a wide ramp: no hard rim on the black
    FLOOR = float(opt.get('paint_floor', 0.8))                        # 0.55 looked dull (user)
    shade = antique * (FLOOR + (1 - FLOOR) * np.clip(v / PAINT, 0, 1))[..., None]
    px[..., :3] = px[..., :3] * (1 - t[..., None]) + shade * t[..., None]
    bimg.pixels.foreach_set(px.ravel()); bimg.update(); bimg.pack()
    print('SLEEVE paint', faces, 'faces,', int((t > 0).sum()), 'texels toward gold')
parts['under_tunic'] = tun; SLOT_PARTS['TOP'].insert(0, 'under_tunic')
print('TUNIC', len(tun.data.polygons), 'faces, to x', round(guard_end, 3))
for n in ('tripo_part_11', 'tripo_part_12', 'tripo_part_15'):
    if n in parts: bpy.data.objects.remove(parts.pop(n))

# Tripo left small holes in its parts (the breastplate has one on top of each shoulder, 13 cm round, and one in an
# armpit), which used to show the body and now showed the tunic as black patches. Each part is welded (the import
# splits it along UV seams) and every open loop of at most 30 edges is filled, the new faces taking the UVs their
# corners already have, so they carry the plate's own colour.
GUARD_FILL = int(opt.get('guard_fill', 80)); big = []
def fill_small_holes(o, max_edges=30, guard=False):
    img = next((n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
    w_, h_ = img.size if img else (1, 1)
    def texel(c):
        if img is None: return (0, 0, 0)
        i = (min(h_ - 1, max(0, int(c.y * h_))) * w_ + min(w_ - 1, max(0, int(c.x * w_)))) * 4
        return tuple(img.pixels[i:i + 3])
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    uv = bm.loops.layers.uv.active
    old = set(bm.faces)
    bnd = [e for e in bm.edges if e.is_boundary]
    seen, fill, rim = set(), [], []
    if guard and uv:
        P = globals().get('px')
        if P is None: P = np.array(img.pixels[:], dtype=np.float32).reshape(h_, w_, 4)
        tex = lambda u: P[min(h_ - 1, max(0, int(u.y * h_))), min(w_ - 1, max(0, int(u.x * w_))), :3]
    for e in bnd:
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
        else:
            # guard_fill (default 80 edges): each forearm guard is an open shell, slit along one side (a 54-59 cm rim
            # out at |x| 0.19), and with the arms down the black tunic showed through the slit as a hole by the
            # elbow (user). Loops out past |x| 0.15 up to guard_fill edges are closed too.
            cx = sum(abs(v.co.x) for x in comp for v in x.verts) / (2 * len(comp))
            if guard and cx > 0.15 and len(comp) <= GUARD_FILL:
                fill += comp; big.append(len(comp))
                for v in {v for x in comp for v in x.verts}:                # (x, colour, uv) beside the slit
                    ls = list(v.link_loops)
                    if ls: rim.append((abs(v.co.x), np.mean([tex(l[uv].uv) for l in ls], 0), ls[0][uv].uv.copy()))
    res = bmesh.ops.holes_fill(bm, edges=fill, sides=max(max_edges, GUARD_FILL) + 1) if fill else {'faces': []}
    new = [f for f in bm.faces if f not in old]
    if any(len(f.verts) > 4 for f in new):
        bmesh.ops.triangulate(bm, faces=[f for f in new if len(f.verts) > 4], quad_method='BEAUTY', ngon_method='BEAUTY')
        new = [f for f in bm.faces if f not in old]
    # The guard patches were long fans of flat triangles, each with its own corner's colour: they showed as a
    # triangle pattern (user). Their inner edges are split and the inner points relaxed, so the patch curves with
    # its rim, and it is smooth-shaded.
    newset = set(new)
    inner = [e for e in bm.edges if len(e.link_faces) == 2 and all(f in newset for f in e.link_faces)]
    if inner:
        bmesh.ops.subdivide_edges(bm, edges=inner, cuts=1, use_grid_fill=True)
        new = [f for f in bm.faces if f not in old]; newset = set(new)
        free = [v for v in {v for f in new for v in f.verts} if all(f in newset for f in v.link_faces)]
        for _ in range(12): bmesh.ops.smooth_vert(bm, verts=free, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    # Guard rings (user: the bands looked smeared, the Tripo texture being blurred and the patch edge ragged; they
    # want clean rings round the arm). The whole guard, patch included, is cut by planes across the arm (|x| along
    # the T-pose arm) at ring_a and ring_b, and every face takes one texel by where it lies: gold up to ring_a, the
    # black band to ring_b, gold beyond. The texels are the medians of the dark and the gold points on both guards'
    # slit rims. The relief keeps its shading; the blurred paint is gone.
    ringed, bands = False, None
    if guard and uv and rim:
        cs = np.array([c for _, c, _ in (RIM_ALL or rim)]); us = [u for _, _, u in (RIM_ALL or rim)]
        dk = cs.max(1) < 0.3
        med = lambda m: us[int(np.flatnonzero(m)[np.argmin(np.linalg.norm(cs[m] - np.median(cs[m], 0), axis=1))])]
        dark_uv, gold_uv_g = med(dk), med(cs.max(1) > 0.5)
        if globals().get('ring_uv') is not None: gold_uv_g = Vector(ring_uv)
        RA, RB = float(opt.get('ring_a', 0.205)), float(opt.get('ring_b', 0.225))   # just below the plate (user's pick 4)
        bm.faces.index_update(); patch_ids = {f.index for f in new}
        tag = bm.faces.layers.int.new('patch')                            # (a new layer drops the face handles)
        bm.faces.ensure_lookup_table()
        for i in patch_ids: bm.faces[i][tag] = 1
        sgn = 1 if sum(v.co.x for v in bm.verts) > 0 else -1
        for b0 in (RA, RB):
            gm = list({*bm.faces, *bm.edges, *bm.verts})
            bmesh.ops.bisect_plane(bm, geom=gm, plane_co=(sgn * b0, 0, 0), plane_no=(1, 0, 0))
        # The gold parts shine like the plates (user): the guard's own faces there keep their texture, its dark
        # paint filled with the plates' gold and the rest shifted to the plates' gold (highlights kept); the
        # patch's gold faces take the plates' median texel; the band is one dark texel.
        bright = Vector(globals()['bright_uv']) if globals().get('bright_uv') is not None else gold_uv_g
        # guard_top=drop: the guard's elbow end above the band is a spiky fringe whose teeth showed the black tunic
        # as jagged smears (user: make it smooth); it is deleted, so above the band the arm is the smooth black
        # sleeve under the plate's gold edge
        if opt.get('guard_top', 'drop') == 'drop':
            top = [f for f in bm.faces if abs(f.calc_center_median().x) < RA]
            bmesh.ops.delete(bm, geom=top, context='FACES')
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
            print('GUARD top dropped', len(top), 'faces')
        gm_ = globals()['mask']; gm_[:] = False; nd = 0                    # the paint step's raster target
        if ARM_MAT is not None:
            if ARM_MAT.name not in o.data.materials: o.data.materials.append(ARM_MAT)
            ka = list(o.data.materials).index(ARM_MAT)
        for f in bm.faces:
            x = abs(f.calc_center_median().x)
            if RA <= x < RB: u = dark_uv; nd += 1
            elif ARM_MAT is not None:                                       # the guards' gold: the arm's gold
                f.material_index = ka
                for l, q in zip(f.loops, arm_uvs([l.vert.co for l in f.loops])): l[uv].uv = q
                continue
            elif f[tag]: u = bright
            else:
                raster(np.array([l[uv].uv[:] for l in f.loops])); continue
            for l in f.loops: l[uv].uv = u
        for _ in range(2): gm_ |= np.roll(gm_, 1, 0) | np.roll(gm_, -1, 0) | np.roll(gm_, 1, 1) | np.roll(gm_, -1, 1)
        dy, dx = min(h_ - 1, int(dark_uv.y * h_)), min(w_ - 1, int(dark_uv.x * w_))
        gm_[max(0, dy - 3):dy + 4, max(0, dx - 3):dx + 4] = False         # the band's dark texel stays dark
        gz = px[gm_, :3]; lit = gz[gz.max(1) > 0.35]
        ratio = np.clip(gold * SG, 0, 1) / np.median(lit, 0) if len(lit) else np.ones(3, np.float32)
        v_ = gz.max(1, keepdims=True); GT = float(opt.get('guard_dark', 0.5))   # 0.35 left black teeth (user)
        fill_ = gold * (0.85 + 0.15 * np.clip(v_ / GT, 0, 1))                   # the dark paint, filled
        t_ = np.clip((GT - v_) / (GT * 0.5), 0, 1)
        px[gm_, :3] = np.clip(gz * ratio * (1 - t_) + fill_ * t_, 0, 1)
        bimg.pixels.foreach_set(px.ravel()); bimg.update(); bimg.pack()
        print('GUARD ring faces', len(bm.faces), 'band', nd, 'gold texels', int(gm_.sum()), 'tint', np.round(ratio, 2))
        new = [f for f in bm.faces if f[tag]]; newset = set(new)
        for f in new: f.smooth = True
        ringed = True
        print('GUARD rings', o.name, 'gold <', RA, '<= black <', RB, '<= gold; dark texel', np.round(tex(dark_uv), 3), 'gold texel', np.round(tex(gold_uv_g), 3))
    # one colour per patch (its corners' UVs can lie on different islands, and spread across them the texture
    # smeared into streaks; per face, neighbouring triangles took different corners' colours): of the colours at the
    # patch's rim, the one nearest their median (a corner on a dark seam gave a brown patch). A large patch (a guard
    # slit) takes the plates' gold instead, its rim being half dark.
    seen_f = set()
    for f0 in ([] if ringed else new):
        if f0 in seen_f: continue
        group, stack = [], [f0]
        while stack:
            f = stack.pop()
            if f in seen_f: continue
            seen_f.add(f); group.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g in newset and g not in seen_f: stack.append(g)
        for f in group: f.smooth = True
        if not uv: continue
        best = None
        if bands is not None and len(group) > 40:
            nd = 0
            for f in group:
                bu = bands(f.calc_center_median().x); nd += texel(bu)[0] < 0.3
                for l in f.loops: l[uv].uv = bu
            print('BAND patch', o.name, len(group), 'faces,', nd, 'dark')
            continue
        if len(group) > 40 and globals().get('antique_uv') is not None: best = Vector(antique_uv)
        else:
            cands = [x[uv].uv.copy() for f in group for l in f.loops for x in l.vert.link_loops if x.face in old]
            if cands:
                cols = np.array([texel(c) for c in cands]); med = np.median(cols, 0)
                best = cands[int(np.argmin(np.linalg.norm(cols - med, axis=1)))]
        if best is not None:
            for f in group:
                for l in f.loops: l[uv].uv = best
    if new: bmesh.ops.recalc_face_normals(bm, faces=new)
    bm.to_mesh(o.data); bm.free()
    return len(new)
# both guards' slit rims, gathered first, so the bands the patches take are the same on both arms
RIM_ALL = []
def guard_rim(o):
    img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = globals().get('px')
    if P is None: P = np.array(img.pixels[:], dtype=np.float32).reshape(h_, w_, 4)
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); uv = bm.loops.layers.uv.active
    seen = set()
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
        if 30 < len(comp) <= GUARD_FILL and sum(abs(v.co.x) for x in comp for v in x.verts) / (2 * len(comp)) > 0.15:
            for v in {v for x in comp for v in x.verts}:
                ls = list(v.link_loops)
                if ls: RIM_ALL.append((abs(v.co.x), np.mean([P[min(h_ - 1, max(0, int(l[uv].uv.y * h_))), min(w_ - 1, max(0, int(l[uv].uv.x * w_))), :3] for l in ls], 0), ls[0][uv].uv.copy()))
    bm.free()
for n in ('tripo_part_8', 'tripo_part_9'):
    if n in parts: guard_rim(parts[n])
for n, o in sorted(parts.items(), key=lambda kv: kv[0] not in ('tripo_part_8', 'tripo_part_9')):
    if n.startswith('tripo_part_'):
        k = fill_small_holes(o, guard=n in ('tripo_part_8', 'tripo_part_9'))
        if k: print('FILLED', n, k, 'faces', 'big loops', big); big.clear()

# Rigid shoulder plates (plate_mode=rigid, the default): every face of the breastplate part outside the collar
# (|x| > PLATE_X) and above the sleeves (z > PLATE_Z) is a shoulder plate. It is cut loose from the rest along
# that boundary, so no band of faces stretches between plate and chest, and it rides the upper arm alone, as one
# hard piece; the gap it opens shows the black under-tunic. (Selecting the plate by distance from the arm axis
# had caught only its middle band plus the chest sides under the arms, so it bent and clung to the shoulder.)
# plate_mode=shoulder (the default; the user: cut loose they looked split, they want the plates whole and spread):
# the same plates stay joined to the chest at the collar and are cut loose only from the sleeves below them; they
# ride the collarbone, which does not turn when the arms go down, so they keep the spread shape they were made
# with, only drooped PLATE_DROOP degrees, the droop fading in over the first 4 cm out from the collar so the joint
# to the chest stays whole. The arm moves under them.
PLATE_MODE = opt.get('plate_mode', 'shoulder')
PLATE_X, PLATE_Z = float(opt.get('plate_x', 0.08)), float(opt.get('plate_z', 0.535))
PLATE_DROOP = math.radians(float(opt.get('plate_droop', 15)))
if PLATE_MODE in ('rigid', 'shoulder'):
    o = parts['tripo_part_1']
    bm = bmesh.new(); bm.from_mesh(o.data)
    # straight cuts first (picking whole faces by their centres left a toothed edge by the collar)
    for co_, no_ in (((PLATE_X, 0, 0), (1, 0, 0)), ((-PLATE_X, 0, 0), (1, 0, 0)), ((0, 0, PLATE_Z), (0, 0, 1))):
        g = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=g, plane_co=co_, plane_no=no_)
    bm.faces.ensure_lookup_table()
    side = {}
    for f in bm.faces:
        c = f.calc_center_median()
        side[f] = 'L' if (c.x > PLATE_X and c.z > PLATE_Z) else 'R' if (c.x < -PLATE_X and c.z > PLATE_Z) else ''
    if PLATE_MODE == 'shoulder':
        # only from what lies below (the sleeves): the joint to the chest by the collar stays whole
        cut = [e for e in bm.edges if len({side[f] for f in e.link_faces}) > 1
               and any(not side[f] and f.calc_center_median().z <= PLATE_Z for f in e.link_faces)]
    else:
        cut = [e for e in bm.edges if len({side[f] for f in e.link_faces}) > 1]
    bmesh.ops.split_edges(bm, edges=cut)
    bm.verts.ensure_lookup_table()
    marks = {'L': set(), 'R': set()}
    for f in bm.faces:
        s_ = side.get(f, '')
        if s_:
            for v in f.verts: marks[s_].add(v.index)
    # 0.3 mm proud of where they were cut: to_game.py welds coincident vertices, which would sew them back on
    bm.normal_update()
    for v in bm.verts:
        if v.index in marks['L'] or v.index in marks['R']: v.co += v.normal * 0.0003
    # the lift (the user: they sat too tight on the shoulder): each plate pushed PLATE_LIFT straight out from the
    # upper arm's axis (up over the top, forward and back at the sides), keeping its shape, fading in over the
    # first 4 cm from the collar like the droop, so it stands off the shoulder as a shell
    PLATE_LIFT = float(opt.get('plate_lift', 0.025))
    if PLATE_MODE == 'shoulder' and PLATE_LIFT:
        for s_, sg, S in (('L', 1, 'Left'), ('R', -1, 'Right')):
            a0 = J[f'{S}Arm']
            for i in marks[s_]:
                v = bm.verts[i]; d = sg * v.co.x - PLATE_X
                k = min(1.0, max(0.0, d / 0.04)); k = k * k * (3 - 2 * k)
                r = Vector((0, v.co.y - a0.y, v.co.z - a0.z))
                if r.length > 1e-6: v.co += r.normalized() * (PLATE_LIFT * k)
    if PLATE_MODE == 'shoulder' and PLATE_DROOP:
        # the droop: about a front-to-back line at the collar edge, fading in over the first 4 cm (no crack there)
        for s_, sg in (('L', 1), ('R', -1)):
            for i in marks[s_]:
                v = bm.verts[i]; d = sg * v.co.x - PLATE_X
                k = min(1.0, max(0.0, d / 0.04)); k = k * k * (3 - 2 * k)
                piv = Vector((sg * PLATE_X, v.co.y, PLATE_Z + 0.06))
                v.co = piv + Matrix.Rotation(sg * PLATE_DROOP * k, 3, 'Y') @ (v.co - piv)
    bm.to_mesh(o.data); bm.free()
    for s_, ids in marks.items():
        o.vertex_groups.new(name='plate_' + s_).add(sorted(ids), 1.0, 'REPLACE')
    print('RIGID PLATES', {k: len(v) for k, v in marks.items()}, 'cut edges', len(cut))
    # the left plate's outer tongue (|x| > plate_tip, 0.25, by the arm's front) hung below the drooped plate as a
    # pointed flap over the black band (user); its faces are removed on both plates
    PT = float(opt.get('plate_tip', 0.25))
    if PT:
        bm = bmesh.new(); bm.from_mesh(o.data)
        tip = [f for f in bm.faces if abs(f.calc_center_median().x) > PT and f.calc_center_median().z > PLATE_Z - 0.01]
        bmesh.ops.delete(bm, geom=tip, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(o.data); bm.free(); print('PLATE tips removed', len(tip), 'faces')

# sleeve_fill (default 4.5 cm): between the shoulder plate and the forearm guard the Tripo sleeve is a few gold
# strips standing off the arm, and under the lifted plate there is a 2.5 cm pocket; the 1.2 mm tunic under them read
# as carved-out hollows at both sides (user: fill them, keep the inside black). After the plates are cut, lifted and
# drooped, the tunic's upper-arm vertices are raised along their normals to sleeve_gap (6 mm, room for the arm's
# swing under the collarbone-held plate) under the armour above them (a ray along the normal, else the nearest armour
# surface projected on it), at most sleeve_fill, the raise smoothed over the arm and tapering to nothing where the
# arm meets the trunk and the forearm, so black cloth fills the sleeve up to the armour.
FILL, GAP = float(opt.get('sleeve_fill', 0.045)), float(opt.get('sleeve_gap', 0.006))
if FILL > 0:
    armour = [parts[n] for n in ('tripo_part_1', 'tripo_part_6', 'tripo_part_8', 'tripo_part_9') if n in parts]
    vs, fs = [], []
    for o in armour:
        k0 = len(vs); vs += [v.co.copy() for v in o.data.vertices]; fs += [[k0 + i for i in p.vertices] for p in o.data.polygons]
    tree = BVHTree.FromPolygons(vs, fs)
    me = tun.data; arm_v = [i for i, b_ in enumerate(lead_v) if b_ in ('LeftArm', 'RightArm')]
    off = np.zeros(len(me.vertices))
    for i in arm_v:
        v = me.vertices[i]; n = v.normal
        hit = tree.ray_cast(v.co + n * 1e-4, n, 0.08)
        if hit[0] is not None: d = hit[3]
        else:
            loc = tree.find_nearest(v.co, 0.08)[0]
            d = (loc - v.co).dot(n) if loc is not None else 0.0
        off[i] = min(max(d - GAP, 0.0), FILL)
    nb = [[] for _ in me.vertices]
    for e in me.edges: a_, b_ = e.vertices; nb[a_].append(b_); nb[b_].append(a_)
    on = np.zeros(len(me.vertices), bool); on[arm_v] = True
    for _ in range(int(opt.get('sleeve_smooth', 8))):
        new = off.copy()
        for i in arm_v: new[i] = (off[i] + sum(off[j] if on[j] else 0.0 for j in nb[i])) / (1 + len(nb[i]))
        off = new
    for i in arm_v: me.vertices[i].co += me.vertices[i].normal * off[i]
    print('SLEEVE fill', len(arm_v), 'verts, raise mean', round(float(off[arm_v].mean()) * 1000, 1), 'mm, max', round(float(off.max()) * 1000, 1), 'mm')
# sleeve_strips=drop: the breastplate's sleeve between the plate and the guard is a few ragged gold strips, and the
# black tunic between them showed as spiky smears (user: make it smooth). Its faces within 5.5 cm of the upper arm's
# axis (outside the collar, below the plates, up to the guard's start) are deleted after the tunic was raised to
# their level, leaving the smooth raised black sleeve (the default). keep leaves them.
if opt.get('sleeve_strips', 'drop') == 'drop':
    bp = parts['tripo_part_1']; bm = bmesh.new(); bm.from_mesh(bp.data); gone = []
    for f in bm.faces:
        c = f.calc_center_median()
        if not (0.08 < abs(c.x) <= BAND_FROM and c.z <= 0.535): continue
        a0 = J['LeftArm' if c.x > 0 else 'RightArm']
        if math.hypot(c.y - a0.y, c.z - a0.z) < float(opt.get('strip_r', 0.075)): gone.append(f)
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(bp.data); bm.free()
    print('SLEEVE strips dropped', len(gone), 'faces')

# Helmet clean-up (user: the cap must be plain black, the gold ornaments clean, no black on the face's side).
# - helmet_dome: the helmet's dark faces (texel max < helmet_paint, 0.3), the dome under the flames, all take one
#   black texel, so the cap is one even black (its paint had streaks, and white and gold bled into it in the game).
# - The gold faces' own dark texels (a brown smudge round the top knob's foot, blotches on the flames) fade into the
#   helmet's median gold; the silver horns are left alone.
# - The red cords: their dark texels fade into the cords' median red (black marks by the cheeks).
HP = float(opt.get('helmet_paint', 0.3))
def face_cols(o):
    ouv = o.data.uv_layers.active.data
    return np.array([px[np.clip((np.array([ouv[li].uv[1] for li in p.loop_indices]) * bh).astype(int), 0, bh - 1),
                        np.clip((np.array([ouv[li].uv[0] for li in p.loop_indices]) * bw).astype(int), 0, bw - 1), :3].mean(0)
                     for p in o.data.polygons])
def paint_toward(objs, sel, target, floor=0.75):
    globals()['mask'][:] = False
    for o, keep in zip(objs, sel):
        ouv = o.data.uv_layers.active.data
        for p, k in zip(o.data.polygons, keep):
            if k: raster(np.array([ouv[li].uv[:] for li in p.loop_indices]))
    m_ = globals()['mask']
    for _ in range(2): m_ |= np.roll(m_, 1, 0) | np.roll(m_, -1, 0) | np.roll(m_, 1, 1) | np.roll(m_, -1, 1)
    z_ = px[m_, :3]; v_ = z_.max(1, keepdims=True)
    t_ = np.clip((HP - v_) / (HP * 0.6), 0, 1)
    px[m_, :3] = z_ * (1 - t_) + target * (floor + (1 - floor) * np.clip(v_ / HP, 0, 1)) * t_
    return int((t_ > 0).sum())
if HP > 0:
    hparts = [parts[n] for n in ('tripo_part_0', 'tripo_part_14') if n in parts]
    cols_h = [face_cols(o) for o in hparts]
    dark_h = [c.max(1) < HP for c in cols_h]
    silver_h = [(c.max(1) > 0.45) & (c.max(1) - c.min(1) < 0.12) for c in cols_h]
    allc = np.concatenate(cols_h); hgold = np.median(allc[(allc.max(1) > 0.4) & (allc.max(1) - allc.min(1) > 0.2)], 0)
    if opt.get('helmet_dome', '1') == '1':
        dc = np.concatenate([c[d] for c, d in zip(cols_h, dark_h)])
        o0 = hparts[0]; uv0 = o0.data.uv_layers.active.data
        cands = [(tuple(np.mean([uv0[li].uv[:] for li in p.loop_indices], 0)), cols_h[0][i]) for i, p in enumerate(o0.data.polygons) if (dark_h[0][i] or opt.get('dome_debug')) and p.area > 2e-5]
        target = np.array([0.05, 0.045, 0.045], np.float32) if opt.get('dome_debug') is None else np.array([0.9, 0.1, 0.1], np.float32)   # as dark as the cap under it
        black_uv = min(cands, key=lambda q: np.linalg.norm(q[1] - target))[0]
        # the horns' roots lie flat on the dome (white flaps on the cap in the game): silver faces within 8 mm of
        # the dome's surface (a sphere fitted to the dark faces) are cap too
        # the dome's own height over the scalp: the median distance of the dark faces from the body's surface;
        # dark faces standing well off it (the knob's foot, the flames' backs) are ornament and go gold, silver faces
        # lying on it (the horns' roots) go black
        dist, tilt = [], []
        for o in hparts:
            dx, tx = [], []
            for p in o.data.polygons:
                loc, nrm, _, dd_ = body_bvh.find_nearest(p.center)
                dx.append(dd_ if dd_ is not None else 1.0); tx.append(abs(p.normal.dot(nrm)) if nrm is not None else 1.0)
            dist.append(np.array(dx)); tilt.append(np.array(tx))
        dd = np.concatenate([x[d] for x, d in zip(dist, dark_h)]); h0 = float(np.median(dd))
        lift_h = []
        for d, sv, x, tl in zip(dark_h, silver_h, dist, tilt):
            # off the dome: standing out from the scalp and turned away from it (the knob's foot, flame backs)
            off = d & (x > h0 + float(opt.get('dome_shell', 0.004))) & (tl < float(opt.get('dome_tilt', 0.6)))
            d[sv & (x < h0 + float(opt.get('horn_root', 0.012)))] = True
            # greyish faces lying on the dome (a grey halo round the knob's foot): cap too
            c_ = cols_h[len(lift_h)]
            d[(x < 0.04) & (tl > 0.6) & (c_.max(1) < 0.65) & ((c_.max(1) - c_.min(1)) < float(opt.get('dome_grey', 0.22))) & ~sv] = True
            # gold slivers lying on the dome (the flames' ragged backs and the knob's skirt teeth showed as gold
            # shards on the black cap, user): any non-silver face as close to the scalp as the dome itself and
            # lying along it is cap
            above = np.array([p.center.z > BAND_Z - BAND_SLOPE * p.center.y + float(opt.get('band_h', 0.04)) for p in hparts[len(lift_h)].data.polygons])
            # only small pieces: flush gold faces are grouped by shared vertices, and a group under flush_area
            # (1.5 cm²) is a shard; bigger groups are the flames' own low relief and stay gold
            cand_ = (x < h0 + float(opt.get('dome_flush', 0.003))) & (tl > 0.8) & ~sv & above & ~d
            P_ = hparts[len(lift_h)].data.polygons; idx_ = np.flatnonzero(cand_)
            vmap = {}
            for i in idx_:
                for v in P_[i].vertices: vmap.setdefault(v, []).append(i)
            seen_g = set(); shards = 0
            for i0 in idx_:
                if i0 in seen_g: continue
                grp_, st_ = [], [i0]
                while st_:
                    i = st_.pop()
                    if i in seen_g: continue
                    seen_g.add(i); grp_.append(i)
                    for v in P_[i].vertices: st_ += [j for j in vmap[v] if j not in seen_g]
                if sum(P_[i].area for i in grp_) < float(opt.get('flush_area', 1.5e-4)):
                    d[grp_] = True; shards += len(grp_)
            print('HELMET flush shards to black', shards, 'of', len(idx_), 'flush gold faces')
            # the knob's foot: teeth of its skirt lie on the dome round it (gold triangles by the knob, user); any
            # face within knob_r of the knob's axis and no higher off the scalp than knob_low is cap
            o_k = hparts[len(lift_h)]
            if len(lift_h) == 0:
                tops = [v.co for v in o_k.data.vertices if abs(v.co.x) < 0.02]
                globals()['KNOB'] = max(tops, key=lambda c: c.z) if tops else None
            if globals().get('KNOB') is not None:
                kx, ky = KNOB.x, KNOB.y
                rr = np.array([math.hypot(p.center.x - kx, p.center.y - ky) for p in o_k.data.polygons])
                foot = rr < float(opt.get('knob_r', 0.06))
                low = x < h0 + float(opt.get('knob_low', 0.016))
                d[foot & low & ~sv] = True; off &= ~(foot & low)
                # teeth poking out past the skirt's rim (front, under the knob): the skirt's radius is that of its
                # clearly raised faces; faces past it and below knob_teeth off the scalp are cap
                raised = foot & (x > h0 + 0.02) & ~d
                if raised.any():
                    R_ = np.percentile(rr[raised], 95)
                    teeth = foot & (rr > R_ - float(opt.get('skirt_in', 0.002))) & (x < h0 + float(opt.get('knob_teeth', 0.03))) & ~sv
                    d[teeth] = True; off &= ~teeth
                    print('HELMET knob skirt radius', round(float(R_), 4), 'teeth to black', int(teeth.sum()))
            d[off] = False; lift_h.append(off)
        # the ornament's dark faces (the knob's foot) take one gold texel outright (painting their texels left a
        # grey halo round the knob)
        o0 = hparts[0]; uv0 = o0.data.uv_layers.active.data
        # (a face's UV centre, not a corner: a corner sits on the island's edge and filtering blended in the grey
        # background, a grey halo round the knob)
        ctr = lambda p: tuple(np.mean([uv0[li].uv[:] for li in p.loop_indices], 0))
        gcand = [(ctr(p), cols_h[0][i]) for i, p in enumerate(o0.data.polygons) if not dark_h[0][i] and not silver_h[0][i] and p.area > 2e-5]
        gold_flat = min(gcand, key=lambda q: np.linalg.norm(q[1] - hgold))[0]
        for o, off in zip(hparts, lift_h):
            ouv = o.data.uv_layers.active.data
            for p, k in zip(o.data.polygons, off):
                if k:
                    for li in p.loop_indices: ouv[li].uv = gold_flat
        print('HELMET dome height', round(h0, 4), 'p10/p90', np.round(np.percentile(dd, [10, 90]), 4), 'dark faces off the dome (to gold)', int(sum(x.sum() for x in lift_h)))
        nflat = 0
        for o, d in zip(hparts, dark_h):
            ouv = o.data.uv_layers.active.data
            for p, k in zip(o.data.polygons, d):
                if k:
                    for li in p.loop_indices: ouv[li].uv = black_uv
                    nflat += 1
        print('HELMET dome', nflat, 'faces one black texel', np.round(min(cands, key=lambda q: np.linalg.norm(q[1] - target))[1], 3))
    n1 = paint_toward(hparts, [~d & ~sv for d, sv in zip(dark_h, silver_h)], hgold, floor=0.85)
    print('HELMET gold faces: dark texels toward', np.round(hgold, 3), n1)
    if 'tripo_cap' in parts:
        cc = face_cols(parts['tripo_cap'])
        red = (cc[:, 0] > 0.25) & (cc[:, 0] > 1.8 * cc[:, 1]) & (cc[:, 0] > 1.8 * cc[:, 2])
        goldc = (cc[:, 0] > 0.35) & (cc[:, 1] > 0.22) & ~red
        if red.any():
            n2 = paint_toward([parts['tripo_cap']], [~goldc], np.median(cc[red], 0), floor=0.7)
            print('CORDS: dark texels toward', np.round(np.median(cc[red], 0), 3), n2)
    # the horns: dark streaks along them (user) fade into their own median silver
    sil = np.concatenate([c[sv] for c, sv in zip(cols_h, silver_h)])
    if len(sil):
        HP0 = HP; HP = float(opt.get('horn_dark', 0.55))
        # the flat texels the cap and the knob's foot use must not be repainted (the cap turned grey)
        keep_ = []
        for u_ in [globals().get('black_uv'), globals().get('gold_flat')]:
            if u_ is None: continue
            yy, xx = min(bh - 1, int(u_[1] * bh)), min(bw - 1, int(u_[0] * bw))
            sl_ = (slice(max(0, yy - 4), yy + 5), slice(max(0, xx - 4), xx + 5)); keep_.append((sl_, px[sl_].copy()))
        n4 = paint_toward(hparts, silver_h, np.median(sil, 0), floor=0.85); HP = HP0
        for sl_, blk in keep_: px[sl_] = blk
        print('HORNS: dark texels toward', np.round(np.median(sil, 0), 3), n4)
    # the glasses' temples: their dark tips (a black stub by the ear) take the temples' gold
    if 'tripo_part_7' in parts:
        gp = parts['tripo_part_7']; gc = face_cols(gp)
        tem = np.array([p.center.y > -0.13 for p in gp.data.polygons])
        tg = gc[tem & (gc.max(1) > 0.35)]
        if len(tg):
            n3 = paint_toward([gp], [tem], np.median(tg, 0), floor=0.8)
            print('GLASSES temples: dark texels toward', np.round(np.median(tg, 0), 3), n3)
    bimg.pixels.foreach_set(px.ravel()); bimg.update(); bimg.pack()

# collar_fill (default on): the lapels' inner rims (their thickness, along the opening) are painted a dull
# grey-brown and read as a black border against the lining (user); those grey faces take the lapels' gold trim
if opt.get('collar_fill', '1') == '1' and 'tripo_part_1' in parts:
    o_c = parts['tripo_part_1']; cc_ = face_cols(o_c)
    reg = np.array([abs(p.center.x) < float(opt.get('collar_x', 0.05)) and p.center.z > 0.47 and p.center.y < -0.03 for p in o_c.data.polygons])
    sat = cc_.max(1) - cc_.min(1)
    inward = np.array([p.normal.x * (1 if p.center.x > 0 else -1) < -0.1 for p in o_c.data.polygons])   # the rim faces the opening
    mid = np.array([abs(p.center.x) < float(opt.get('rim_mid', 0.016)) for p in o_c.data.polygons])   # where the lapels meet, facing out
    grey = reg & (((inward & (((sat < float(opt.get('rim_sat', 0.25))) & (cc_.max(1) < 0.7)) | (cc_.max(1) < 0.25))))
                  | (mid & (cc_.max(1) < 0.45) & (sat < 0.32)))
    goldt = reg & (cc_[:, 0] > 0.6) & (cc_[:, 1] > 0.4) & (sat > 0.25)
    print('COLLAR region', int(reg.sum()), 'grey', int(grey.sum()), 'gold', int(goldt.sum()))
    if grey.any() and goldt.any():
        HP0 = HP; HP = 0.71; px0 = px[..., :3].copy()
        n5 = paint_toward([o_c], [grey], np.median(cc_[goldt], 0), floor=0.8); HP = HP0
        keep_ = ((px0.max(-1) - px0.min(-1)) > 0.32) & (px0.max(-1) > 0.45)        # the red stays red
        px[..., :3][keep_] = px0[keep_]
        bimg.pixels.foreach_set(px.ravel()); bimg.update(); bimg.pack()
        print('COLLAR rims to gold', np.round(np.median(cc_[goldt], 0), 3), n5)
        # where the lapels meet (|x| < rim_core, below the chin), the dark brown edge faces take one gold-trim texel
        # outright: painting their texels toward gold left a dark line (user)
        uvc = o_c.data.uv_layers.active.data
        gi_ = int(np.flatnonzero(goldt)[np.argmin(np.linalg.norm(cc_[goldt] - np.median(cc_[goldt], 0), axis=1))])
        guv = tuple(np.mean([uvc[li].uv[:] for li in o_c.data.polygons[gi_].loop_indices], 0)); nc = 0
        # (the lining's red, not gold: a flat gold patch filled the V's foot) a lapel-red face near the lining's colour
        redf = reg & (cc_[:, 0] > 1.8 * cc_[:, 1]) & (cc_[:, 0] > 0.25)
        ri_ = int(np.flatnonzero(redf)[np.argmin(np.linalg.norm(cc_[redf] - np.array(LR), axis=1))]) if redf.any() else gi_
        ruv = tuple(np.mean([uvc[li].uv[:] for li in o_c.data.polygons[ri_].loop_indices], 0))
        for p in o_c.data.polygons:
            c = p.center
            if not (0.5 < c.z < 0.6 and c.y < -0.06): continue
            isred = cc_[p.index, 0] > 1.8 * cc_[p.index, 1] and cc_[p.index, 0] > 0.3 and cc_[p.index].max() > 0.42
            if abs(c.x) < float(opt.get('rim_core', 0.006)) and not isred:
                # below core_lo the V's foot shows past the medallion as a red flap (user): gold there
                u_ = ruv if c.z >= float(opt.get('core_lo', 0.7)) else guv
                for li in p.loop_indices: uvc[li].uv = u_
                nc += 1
            elif abs(c.x) < float(opt.get('rim_edge', 0.018)) and not isred and cc_[p.index].max() < 0.5:
                # the dark brown strip along the lapels' inner gold rims (a black vertical line, user): gold
                for li in p.loop_indices: uvc[li].uv = guv
                nc += 1
        print('COLLAR core faces to lining red', nc, np.round(cc_[ri_], 3))
        # the lapels' dark-brown panels (round the gold studs) read as black streaks by the opening from the side
        # (user): their dark texels fade into the lapels' red; the studs and trims stay gold
        lap = reg & np.array([p.normal.y < -0.3 and abs(p.center.x) > float(opt.get('rim_core', 0.006)) for p in o_c.data.polygons])
        lred = np.median(cc_[redf], 0) if redf.any() else np.array(LR)
        HP0 = HP; HP = float(opt.get('lapel_dark', 0.5)); px1 = px[..., :3].copy()
        n6 = paint_toward([o_c], [lap], lred, floor=0.7); HP = HP0
        bimg.pixels.foreach_set(px.ravel()); bimg.update(); bimg.pack()
        print('LAPELS dark panels toward red', np.round(lred, 3), n6)
        # the gold trims along the opening still carried dark texels (the dark seams between trim and red, specks;
        # user): in the UV islands of the faces within rim_zone of the opening, every dark texel that is not red
        # becomes the trims' gold (shaded a little by its old brightness)
        gm_ = globals()['mask']; gm_[:] = False
        uvz = o_c.data.uv_layers.active.data
        for p in o_c.data.polygons:
            c = p.center
            if abs(c.x) < float(opt.get('rim_zone', 0.03)) and 0.46 < c.z < 0.64 and c.y < -0.03:
                raster(np.array([uvz[li].uv[:] for li in p.loop_indices]))
        for _ in range(2): gm_ |= np.roll(gm_, 1, 0) | np.roll(gm_, -1, 0) | np.roll(gm_, 1, 1) | np.roll(gm_, -1, 1)
        z_ = px[..., :3]; mx_ = z_.max(-1)
        isred = (z_[..., 0] > float(opt.get('trim_red', 1.6)) * z_[..., 1]) & (z_[..., 0] > 0.2)
        sel_ = gm_ & ~isred & (mx_ < float(opt.get('trim_dark', 0.5)))
        gt = np.median(cc_[goldt], 0)
        px[sel_, :3] = gt * (0.8 + 0.2 * np.clip(mx_[sel_] / 0.5, 0, 1))[:, None]
        bimg.pixels.foreach_set(px.ravel()); bimg.update(); bimg.pack()
        print('TRIMS dark texels to gold', int(sel_.sum()))

# glasses_reach (default y 0.03): the sunglasses' temples stopped 4 cm short of the ears (user). Their vertices
# behind the hinges (y > -0.13) are stretched back so the tips reach glasses_reach, just past the ear's front; the
# push below lifts them onto the side of the head.
GR = float(opt.get('glasses_reach', 0.03))
if 'tripo_part_7' in parts:
    # a thin spike rose off each hinge (stretched with the temple, a dark stick by the cheek, user): temple faces
    # (y > -0.14) farther than glasses_spike (3 mm) from the temple bar's median height and side in their 5 mm
    # slice along the temple are deleted
    o_g = parts['tripo_part_7']; bm = bmesh.new(); bm.from_mesh(o_g.data); spk = []
    for sg in (1, -1):
        fs_ = [f for f in bm.faces if f.calc_center_median().y > -0.14 and f.calc_center_median().x * sg > 0]
        if not fs_: continue
        C_ = np.array([f.calc_center_median()[:] for f in fs_])
        for b0 in np.arange(-0.14, C_[:, 1].max() + 0.005, 0.005):
            sel = (C_[:, 1] >= b0) & (C_[:, 1] < b0 + 0.005)
            if sel.sum() < 3: continue
            mz, mx = np.median(C_[sel, 2]), np.median(C_[sel, 0])
            far = sel & ((np.abs(C_[:, 2] - mz) > float(opt.get('glasses_spike', 0.003))) | (np.abs(C_[:, 0] - mx) > 0.004))
            spk += [fs_[i] for i in np.flatnonzero(far)]
    bmesh.ops.delete(bm, geom=list(set(spk)), context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o_g.data); bm.free(); print('GLASSES spikes removed', len(set(spk)), 'faces')
if 'tripo_part_7' in parts and GR:
    gm = parts['tripo_part_7'].data; Yh = -0.13
    tip = max(v.co.y for v in gm.vertices)
    k = (GR - Yh) / (tip - Yh)
    for v in gm.vertices:
        if v.co.y > Yh: v.co.y = Yh + (v.co.y - Yh) * k
    print('GLASSES temples x', round(k, 2), 'tip', round(tip, 3), '->', GR)

# Clean tubes (user: the cords' ragged edges and the stretched temples showed as dark slivers by the face). Each
# cord between the band and its tassel, and each glasses temple behind its hinge, is replaced by a smooth tube on
# its centreline (the median of its faces per 5 mm slice along it), its radius the piece's median half-width, all
# its corners on one texel of the piece's own colour.
def tube_replace(o, groups, colour, radius_cap, label, fit=False, radius_min=0.0012, ribbon=None, top=None, straight=False,
                 width=None, out=0.004, fwd=0.0, end=None):
    me = o.data; uvd = me.uv_layers.active.data
    img_ = next(n.image for m in me.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    W_, H_ = img_.size
    def tex_(u): return px[min(H_ - 1, max(0, int(u[1] * H_))), min(W_ - 1, max(0, int(u[0] * W_))), :3]
    tg_ = o.vertex_groups.get('part:tube') or o.vertex_groups.new(name='part:tube')
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); uvl = bm.loops.layers.uv.active
    dl_ = bm.verts.layers.deform.verify()
    made = 0
    allf = list(bm.faces)                                                 # handles taken before any deletion
    defaults = dict(width=width, out=out, fwd=fwd, end=end, fix=None)
    for grp in groups:
        ids, axis = grp[0], grp[1]
        kw = dict(defaults, **(grp[2] if len(grp) > 2 else {}))
        width, out, fwd, end, fix = kw['width'], kw['out'], kw['fwd'], kw['end'], kw['fix']
        fs = [allf[i] for i in ids]
        if len(fs) < 8: continue
        C_ = np.array([f.calc_center_median()[:] for f in fs])
        t_ = C_[:, axis]; pts = []
        for b0 in np.arange(t_.min(), t_.max() + 1e-9, 0.005):
            sel = (t_ >= b0) & (t_ < b0 + 0.005)
            if sel.sum(): pts.append(np.median(C_[sel], 0))
        if len(pts) < 2: continue
        pts = np.array(pts)
        if fit and len(pts) >= 4:
            # a cord hangs smoothly: its centreline is a quadratic in its length coordinate
            tt = pts[:, axis]; hi_ = tt.max()
            if top is not None: hi_ = max(hi_, top(np.median(pts[:, 1])))       # up into the crown band
            lo_ = end[axis] if end is not None else tt.min()
            ts = np.arange(lo_, hi_ + 1e-9, 0.004)
            new_ = np.zeros((len(ts), 3)); new_[:, axis] = ts
            for k in range(3):
                if k == axis: continue
                if straight:
                    # hanging straight down from where it leaves the crown (its upper third); with `end`, a straight
                    # line from there to that point (the back cord down to its tassel's knot)
                    top_k = np.median(pts[tt >= np.percentile(tt, 66), k])
                    if fix and k in fix: top_k = fix[k]                          # placed by hand (x, y)
                    if end is None: new_[:, k] = top_k
                    else:
                        f_ = (ts.max() - ts) / max(1e-6, ts.max() - end[axis])
                        new_[:, k] = top_k + (end[k] - top_k) * np.clip(f_, 0, 1)
                else: new_[:, k] = np.polyval(np.polyfit(tt, pts[:, k], 2), ts)
            pts = new_
        for _ in range(3): pts[1:-1] = (pts[:-2] + 2 * pts[1:-1] + pts[2:]) / 4
        # radius: the faces' median distance from the centreline, capped
        d_ = []
        for c in C_:
            j = np.argmin(np.linalg.norm(pts - c, axis=1)); d_.append(np.linalg.norm(pts[j] - c))
        r = min(radius_cap, max(radius_min, float(np.median(d_))))
        cols_ = np.array([np.mean([tex_(l[uvl].uv) for l in f.loops], 0) for f in fs])
        best = fs[int(np.argmin(np.linalg.norm(cols_ - colour, axis=1)))]
        uv0 = tuple(np.mean([l[uvl].uv[:] for l in best.loops], 0)); mat = best.material_index
        bmesh.ops.delete(bm, geom=fs, context='FACES')
        # the tube, or (ribbon=thickness) a flat ribbon as wide as the piece: its width the faces' 5th-95th
        # percentile spread across the cord (horizontal principal axis)
        N = 8; rings = []
        if ribbon:
            # per 6 mm slice: the faces' spread across the cord (their own horizontal principal axis); the median
            spreads, dirs = [], []
            for b0 in np.arange(t_.min(), t_.max(), 0.006):
                sel = (t_ >= b0) & (t_ < b0 + 0.006)
                if sel.sum() < 6: continue
                Hx = C_[sel, :2] - C_[sel, :2].mean(0); _, _, Vh = np.linalg.svd(Hx, full_matrices=False)
                wv = Hx @ Vh[0]; spreads.append(np.percentile(wv, 90) - np.percentile(wv, 10))
                dirs.append(Vh[0] if (not dirs or np.dot(Vh[0], dirs[0]) >= 0) else -Vh[0])
            # lying flat on the head: across it, the horizontal tangent to the head at the cord (the measured axis ran
            # out from the head, so the ribbon showed edge-on); width cord_w (12 mm, as the original ribbons)
            out_ = Vector((C_[:, 0].mean() - J['Head'].x, C_[:, 1].mean() - J['Head'].y, 0)).normalized()
            wdir = Vector((0, 0, 1)).cross(out_).normalized()
            half_w = (width or float(opt.get('cord_w', 0.04))) / 2
            print(label, 'ribbon width mm', round(half_w * 2000, 1))
        for i, pnt in enumerate(pts):
            tgt = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]; tgt = Vector(tgt).normalized()
            if ribbon:
                a = (wdir - tgt * wdir.dot(tgt)).normalized(); b = tgt.cross(a)
                corners = [a * half_w + b * ribbon / 2, -a * half_w + b * ribbon / 2, -a * half_w - b * ribbon / 2, a * half_w - b * ribbon / 2]
                off_ = out_ * out + Vector((0, -fwd, 0))                       # clear of the ear's rim and the temple
                rings.append([bm.verts.new(Vector(pnt) + off_ + c) for c in corners]); N = 4
            else:
                a = tgt.orthogonal().normalized(); b = tgt.cross(a)
                rings.append([bm.verts.new(Vector(pnt) + (a * math.cos(2 * math.pi * k / N) + b * math.sin(2 * math.pi * k / N)) * r) for k in range(N)])
        for i in range(len(rings) - 1):
            for k in range(N):
                f = bm.faces.new((rings[i][k], rings[i][(k + 1) % N], rings[i + 1][(k + 1) % N], rings[i + 1][k]))
                f.material_index = mat; f.smooth = not ribbon
                for l in f.loops: l[uvl].uv = uv0
        for ring in (rings[0], rings[-1]):
            f = bm.faces.new(ring); f.material_index = mat
            for l in f.loops: l[uvl].uv = uv0
        for ring in rings:
            for v in ring: v[dl_][tg_.index] = 1.0                           # the push leaves the tubes as built
        made += 1
        r0 = np.array([v.co[:] for v in rings[len(rings) // 2]]); print(label, 'mid ring span mm', np.round(np.ptp(r0, 0) * 1000, 1))
        print(label, 'tube', made, 'points', len(pts), 'radius mm', round(r * 1000, 2))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()
def islands_of(o, pick):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    seen, out = set(), []
    for f0 in bm.faces:
        if f0.index in seen or not pick(f0): continue
        g, st = [], [f0]
        while st:
            f = st.pop()
            if f.index in seen or not pick(f): continue
            seen.add(f.index); g.append(f.index)
            for v in f.verts:
                for h in v.link_faces:
                    if h.index not in seen: st.append(h)
        out.append(g)
    bm.free(); return out
if opt.get('tubes', '1') == '1':
    if 'tripo_cap' in parts:
        o = parts['tripo_cap']; cc = face_cols(o)
        red = (cc[:, 0] > 0.25) & (cc[:, 0] > 1.6 * cc[:, 1]) & (cc[:, 0] > 1.6 * cc[:, 2])
        CL, CH = float(opt.get('cord_lo', 0.6)), float(opt.get('cord_hi', 0.772))
        zc = np.array([p.center.z for p in o.data.polygons])
        P_ = o.data.polygons
        ids = [p.index for p in P_ if CL < p.center.z < CH and (red[p.index] or cc[p.index].max() < 0.3)]
        groups = []
        back = [i for i in ids if abs(P_[i].center.x) < 0.04 and P_[i].center.y > 0.05]      # the cord down the back
        if back: groups.append(back)
        ids = [i for i in ids if i not in set(back)]
        for sg in (1, -1):
            sid = [i for i in ids if P_[i].center.x * sg > 0]
            if not sid: continue
            ys = np.array([P_[i].center.y for i in sid]); order = np.argsort(ys); ysorted = ys[order]
            gaps = np.diff(ysorted); cut = int(np.argmax(gaps)) if len(gaps) else 0
            if len(gaps) and gaps[cut] > float(opt.get('cord_gap', 0.02)):
                thr = (ysorted[cut] + ysorted[cut + 1]) / 2
                groups += [[i for i in sid if P_[i].center.y < thr], [i for i in sid if P_[i].center.y >= thr]]
            else: groups.append(sid)
        for g in groups:
            cg = np.array([P_[i].center[:] for i in g]); print('CORD group', len(g), 'mean', np.round(cg.mean(0), 3), 'x', np.round([cg[:, 0].min(), cg[:, 0].max()], 3), 'y', np.round([cg[:, 1].min(), cg[:, 1].max()], 3), 'z', np.round([cg[:, 2].min(), cg[:, 2].max()], 3))
        gold_ = [p.index for p in P_ if p.center.z < CL + 0.02 and cc[p.index].max() > 0.4 and not red[p.index]]
        if gold_:
            cg = np.array([P_[i].center[:] for i in gold_])
            for ix in range(-3, 4):
                for iy in range(-1, 5):
                    m = (np.floor(cg[:, 0] / 0.05) == ix) & (np.floor(cg[:, 1] / 0.05) == iy)
                    if m.sum() > 5: print('TASSEL cell', ix, iy, int(m.sum()), np.round(cg[m].mean(0), 3), 'zmax', round(float(cg[m, 2].max()), 3))
            print('TASSELS', len(gold_), 'x', np.round([cg[:, 0].min(), cg[:, 0].max()], 3), 'y', np.round([cg[:, 1].min(), cg[:, 1].max()], 3), 'z', np.round([cg[:, 2].min(), cg[:, 2].max()], 3))
        # the side cords: wide, plumb, out past the glasses' temples and a little forward of the ears; the back cord:
        # narrower, a straight line from the band down to its tassel's knot (the tassel hangs back-left, not centred)
        topf = lambda y: BAND_Z - BAND_SLOPE * y + float(opt.get('cord_up', 0.006))
        rc = np.median(cc[red], 0)
        mean_y = lambda g: np.mean([P_[i].center.y for i in g])
        sides = [g for g in groups if len(g) >= 20 and mean_y(g) < 0.1]
        # the old cords below the band's reach (z <= cord_lo) showed under the new tassels: their red and dark faces
        # join the side groups, so they are replaced (removed) with them
        for g in sides:
            sx_ = 1 if np.mean([P_[i].center.x for i in g]) > 0 else -1
            g += [p.index for p in P_ if p.center.z <= CL and p.center.x * sx_ > 0.08 and p.center.y < 0.1
                  and (red[p.index] or cc[p.index].max() < 0.3)]
        backs = [g for g in groups if len(g) >= 20 and mean_y(g) >= 0.1]
        # part_14 is the old right side cord's hanging end (a strip and a knot, one side only): the new side tassels
        # replace it
        if 'tripo_part_14' in parts and opt.get('drop_part14', '1') == '1':
            bpy.data.objects.remove(parts.pop('tripo_part_14')); SLOT_PARTS['HAIR'].remove('tripo_part_14')
            print('PART 14 removed (old side cord end)')
        # Braided cords and solid tassels (user, with the design sheet: twisted dark-red cords, each ending in a gold
        # tassel; the back cord coming out between the head and the crown band; the tassels full, not hollow strands,
        # nothing sticking out). All the old cord and tassel faces are deleted; each cord is built as a round braid on
        # a plumb line (radius modulated by two twisted ridges, the ridges a lighter red), each tassel as a bead knot,
        # a cap and a fluted skirt, all on texels of the part's own reds and golds.
        CX = float(opt.get('cord_x', 0.159))
        RB_ = float(opt.get('braid_r', 0.0075))
        def texel_of(target, sel):
            uv0 = o.data.uv_layers.active.data
            best = min((i for i in range(len(P_)) if sel[i] and P_[i].area > 2e-6), key=lambda i: np.linalg.norm(cc[i] - target))
            return tuple(np.mean([uv0[li].uv[:] for li in P_[best].loop_indices], 0)), P_[best].material_index
        redsel = red.copy(); bright = cc.max(1)
        rl = np.percentile(bright[red], 80); rd = np.percentile(bright[red], 20)
        uv_rl, mat_r = texel_of(np.median(cc[red & (bright >= rl)], 0), red)
        uv_rd, _ = texel_of(np.median(cc[red & (bright <= rd)], 0) * 0.85, red)
        goldsel = (cc[:, 0] > 0.45) & (cc[:, 1] > 0.3) & ~red
        gmed = np.median(cc[goldsel], 0) if goldsel.any() else np.array([0.8, 0.6, 0.25])
        uv_gl, mat_g = texel_of(np.clip(gmed * 1.15, 0, 1), goldsel)
        uv_gd, _ = texel_of(gmed * 0.7, goldsel)
        lines = []                                                            # (top, bottom, radius, tassel scale)
        for g in sides:
            Cg = np.array([P_[i].center[:] for i in g]); up = Cg[:, 2] >= np.percentile(Cg[:, 2], 66)
            sx = 1 if Cg[:, 0].mean() > 0 else -1; yf = float(np.median(Cg[up, 1])) - float(opt.get('cord_fwd', 0.012))
            ze = float(opt.get('side_end', 0.675))
            lines.append((Vector((sx * CX, yf, topf(yf))), Vector((sx * CX, yf, ze)), RB_, float(opt.get('side_tassel', 0.6))))
        if backs:
            # between the head and the band: the band's lower edge at the back, just off the head's surface there
            zb = BAND_Z - BAND_SLOPE * 0.18 - 0.012
            hit = body_bvh.ray_cast(Vector((0, 0.4, zb)), Vector((0, -1, 0)), 1.0)
            yb = (hit[0].y if hit[0] is not None else 0.172) + RB_ * 0.7 + 0.002
            lines.append((Vector((0, yb, zb + 0.01)), Vector((0, yb, float(opt.get('back_end', 0.6)))), RB_ * 0.85, 1.0))
            print('CORD back from head y', round(yb, 4), 'z', round(zb, 4))
        # delete: the cords, every gold tassel scrap below the band, and what is left of the old cords down there
        kill = set(i for g in sides + backs for i in g)
        kill |= {i for i in range(len(P_)) if P_[i].center.z < CL + 0.03 and abs(P_[i].center.x) > 0.02 and (goldsel[i] or red[i] or cc[i].max() < 0.3)}
        kill |= {i for i in range(len(P_)) if P_[i].center.z < CL + 0.03 and P_[i].center.y > 0.1}
        bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.faces[i] for i in sorted(kill)], context='FACES')
        uvl = bm.loops.layers.uv.active
        tg_ = o.vertex_groups.get('part:tube') or o.vertex_groups.new(name='part:tube'); dl_ = bm.verts.layers.deform.verify()
        def quad(vs, uv, mat):
            f = bm.faces.new(vs); f.material_index = mat; f.smooth = True
            for l in f.loops: l[uvl].uv = uv
            return f
        def ring_pts(c, r, n, mod=None):
            return [c + Vector((math.cos(2 * math.pi * k / n), math.sin(2 * math.pi * k / n), 0)) * (r * (mod(k) if mod else 1)) for k in range(n)]
        def loft(rings, uvf, mat):
            vs = [[bm.verts.new(p) for p in r] for r in rings]
            for r in vs:
                for v in r: v[dl_][tg_.index] = 1.0
            n = len(rings[0])
            for i in range(len(vs) - 1):
                for k in range(n):
                    quad((vs[i][k], vs[i][(k + 1) % n], vs[i + 1][(k + 1) % n], vs[i + 1][k]), uvf(i, k), mat)
            return vs
        def cap(ring, uv, mat):
            f = bm.faces.new(ring); f.material_index = mat
            for l in f.loops: l[uvl].uv = uv
        made = 0
        for top, bot, r, ts in lines:
            # the braid: two ridges twisting down (one turn per 18 mm), lighter red on the ridges
            N, step, pitch = 16, 0.0025, float(opt.get('braid_pitch', 0.018))
            L = (top - bot).length; nz = max(2, int(L / step))
            phase = lambda i, k: 2 * (2 * math.pi * k / N) + 2 * math.pi * (i * step) / pitch
            rings = [ring_pts(top + (bot - top) * (i / nz), r, N, lambda k, i=i: 1 + 0.16 * math.cos(phase(i, k))) for i in range(nz + 1)]
            vs = loft(rings, lambda i, k: uv_rl if math.cos(phase(i, k + 0.5)) > 0 else uv_rd, mat_r)
            cap(vs[0], uv_rd, mat_r)
            # the tassel: a bead knot, a short cap, a fluted skirt with a closed bottom
            s_ = ts; kc = bot + Vector((0, 0, -0.006 * s_))
            prof = [(0.0, 0.0), (0.006, 0.004), (0.0085, 0.009), (0.007, 0.014), (0.004, 0.017),     # bead
                    (0.0045, 0.019), (0.009, 0.022), (0.010, 0.026),                               # cap
                    (0.0105, 0.030), (0.013, 0.045), (0.015, 0.060), (0.0155, 0.068), (0.0, 0.070)]  # skirt
            M = 20
            trings = []
            for j, (pr, pz) in enumerate(prof):
                flute = (lambda k: 1 + 0.08 * math.cos(10 * 2 * math.pi * k / M)) if pz >= 0.030 and pr > 0 else None
                trings.append(ring_pts(bot + Vector((0, 0, -pz * s_)), max(pr * s_, 1e-5), M, flute))
            tv = loft(trings, lambda i, k: (uv_gd if (prof[i][1] >= 0.030 and k % 2) or 0.017 <= prof[i][1] < 0.019 else uv_gl), mat_g)
            made += 1
        bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if v[dl_].get(tg_.index, 0) > 0.5], dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(o.data); bm.free()
        print('CORDS braided', made, 'with solid tassels; old cord/tassel faces deleted', len(kill))
    if 'tripo_part_7' in parts:
        o = parts['tripo_part_7']; gc = face_cols(o)
        tem = islands_of(o, lambda f: f.calc_center_median().y > -0.125)
        tg = gc[np.array([p.center.y > -0.125 for p in o.data.polygons]) & (gc.max(1) > 0.35)]
        tube_replace(o, [(g, 1) for g in tem if len(g) >= 8], np.median(tg, 0) if len(tg) else np.array([0.6, 0.43, 0.24]), 0.0018, 'TEMPLE')

# (after the tubes) loose shards (user: black triangles on the face by the temple): after the cords' fringe was cut, the helmet's
# parts kept islands of 1-6 faces floating by the brow and cheeks; islands under shard_faces (10) are deleted
for n in ('tripo_part_0', 'tripo_part_14', 'tripo_cap', 'tripo_part_7'):
    if n not in parts: continue
    o = parts[n]; bm = bmesh.new(); bm.from_mesh(o.data)
    seen_, small_ = set(), []
    for f0 in bm.faces:
        if f0 in seen_: continue
        g_, st_ = [], [f0]
        while st_:
            f = st_.pop()
            if f in seen_: continue
            seen_.add(f); g_.append(f)
            for v in f.verts:
                for h in v.link_faces:
                    if h not in seen_: st_.append(h)
        if len(g_) < int(opt.get('shard_faces', 10)) * (4 if n == 'tripo_cap' else 1): small_ += g_
    if small_:
        bmesh.ops.delete(bm, geom=small_, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(o.data); print('SHARDS', n, len(small_), 'faces removed')
    bm.free()

# one item per slot
G = {}
for slot, names in SLOT_PARTS.items():
    objs = [parts[n] for n in names if n in parts]
    for o, n in zip(objs, [n for n in names if n in parts]):
        if n in PANELS:
            o.vertex_groups.new(name='panel').add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
        o.vertex_groups.new(name='part:' + n).add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')   # for the stiffening below
    for x in bpy.data.objects: x.select_set(x in objs)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join()
    it = bpy.context.view_layer.objects.active; it.name = f'item__{slot}__{SET}'; G[slot] = it
    print('ITEM', it.name, len(it.data.polygons))

# 1. outside the body by 2 mm
for slot, it in G.items():
    moved = 0
    skin = it.vertex_groups['part:under_tunic'].index if 'part:under_tunic' in it.vertex_groups else None
    # the helmet from deeper and further out: its band sank into the back of the head and the black cap (1.5 mm off
    # the scalp, itself left where it is) blotched through it
    if slot == 'HAIR': skin = it.vertex_groups['part:body_cap'].index
    tube_g = it.vertex_groups['part:tube'].index if slot == 'HAIR' and 'part:tube' in it.vertex_groups else None
    lo, to = (-0.03, 0.004) if slot == 'HAIR' else (-0.004, 0.002)
    tneed = {}
    for v in it.data.vertices:
        if skin is not None and any(e.group == skin for e in v.groups): continue      # the tunic and the cap stay
        if tube_g is not None and any(e.group == tube_g and e.weight > 0.5 for e in v.groups): continue
        loc, n, fi, d = body_bvh.find_nearest(v.co)
        if loc is None or d > 0.05: continue
        nf = body_fn[fi]; s_ = (v.co - loc).dot(nf)
        # only items touching the body; deeper (the body bulging out through the item) the body is hidden instead
        if slot == 'FACE' and v.co.y > -0.13:
            # the temples: pushed per 5 mm slice as one piece, outward along x (moved vertex by vertex onto the
            # nearest surface they split into ragged prongs, a dark stick by the cheek, user)
            if -0.03 < s_ < to: tneed.setdefault((v.co.x > 0, int((v.co.y + 0.13) / 0.005)), []).append(to - s_)
            continue
        if lo < s_ < to: v.co = loc + nf * to; moved += 1
    if tneed:
        for v in it.data.vertices:
            if v.co.y > -0.13:
                need = max(tneed.get((v.co.x > 0, int((v.co.y + 0.13) / 0.005)), [0.0]))
                v.co.x += need if v.co.x > 0 else -need
        print('PUSH temples', {k: round(max(x) * 1000, 1) for k, x in sorted(tneed.items())[:4]}, '... mm')
    print('PUSH', slot, moved)

# 2. weights from the body, then the rules
LEG = ('LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg')
belt = J['Hips'].z + 0.035; knee = J['LeftLeg'].z
for slot, it in G.items():
    for g in src_obj.vertex_groups:
        if g.name not in it.vertex_groups: it.vertex_groups.new(name=g.name)
    md = it.modifiers.new('dt', 'DATA_TRANSFER'); md.object = src_obj
    md.use_vert_data = True; md.data_types_verts = {'VGROUP_WEIGHTS'}; md.vert_mapping = 'POLYINTERP_NEAREST'
    md.layers_vgroup_select_src = 'ALL'; md.layers_vgroup_select_dst = 'NAME'
    bpy.context.view_layer.objects.active = it; bpy.ops.object.modifier_apply(modifier='dt')
    VG = {g.name[len('mixamorig:'):]: g for g in it.vertex_groups if g.name.startswith('mixamorig:')}
    idx = {g.index: n for n, g in VG.items()}
    panel = it.vertex_groups['panel'].index if 'panel' in it.vertex_groups else None
    def set_w(v, w):
        for e in list(v.groups):
            if e.group in idx: VG[idx[e.group]].remove([v.index])
        tot = sum(w.values()) or 1
        for n, x in w.items():
            if x > 1e-4: VG[n].add([v.index], x / tot, 'REPLACE')
    for v in it.data.vertices:
        if slot in ('HAIR', 'FACE'): set_w(v, {'Head': 1.0}); continue
        w = {idx[e.group]: e.weight for e in v.groups if e.group in idx and e.weight > 0}
        if panel is not None and any(e.group == panel for e in v.groups) and v.co.z < belt and any(n in LEG for n in w):
            t = min(1.0, max(0.0, (belt - v.co.z) / (belt - knee)))
            leg = {n: x for n, x in w.items() if n in LEG}; rest = {n: x for n, x in w.items() if n not in LEG}
            nw = {'Hips': (1 - 0.5 * t) * sum(leg.values())}
            for n, x in leg.items(): nw[n] = nw.get(n, 0) + 0.5 * t * x
            for n, x in rest.items(): nw[n] = nw.get(n, 0) + x
            set_w(v, nw)
    # Stiff pieces. Copied skin weights bend like skin: the armour's chest plate followed the three spine joints
    # apart and sheared when the waist turned in the walk; the collar, near the jaw, took the head's weights and
    # stretched as the head bobbed. So: no head or neck in the top or trousers (the chest instead), no arm in the
    # breastplate's middle, and each part's weights averaged over a wide neighbourhood of that part alone.
    if slot not in ('HAIR', 'FACE'):
        ARMS = ('LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand')
        mid_x = abs(J['LeftArm'].x) * 0.8
        for v in it.data.vertices:
            w = {idx[e.group]: e.weight for e in v.groups if e.group in idx and e.weight > 0}
            moved = sum(x for n, x in w.items() if n in ('Head', 'HeadTop_End', 'Neck'))
            if slot == 'TOP' and abs(v.co.x) < mid_x and v.co.z < J['Neck'].z:
                moved += sum(x for n, x in w.items() if n in ARMS)
                w = {n: x for n, x in w.items() if n not in ARMS}
            if moved > 0:
                w = {n: x for n, x in w.items() if n not in ('Head', 'HeadTop_End', 'Neck')}
                w['Spine2'] = w.get('Spine2', 0) + moved; set_w(v, w)
        RADIUS = {'tripo_part_1': 0.045, 'tripo_part_6': 0.06, 'tripo_part_8': 0.03, 'tripo_part_9': 0.03,
                  'collar_lining': 0.03, 'tripo_part_5': 0.025, 'tripo_part_3': 0.03, 'tripo_part_10': 0.04}
        names_ = [g.name[5:] for g in it.vertex_groups if g.name.startswith('part:')]
        bones = list(VG)
        Wm = np.zeros((len(it.data.vertices), len(bones)), np.float32); bi = {n: k for k, n in enumerate(bones)}
        part_of = np.full(len(it.data.vertices), '', object)
        pidx = {it.vertex_groups['part:' + n].index: n for n in names_}
        for v in it.data.vertices:
            for e in v.groups:
                if e.group in idx: Wm[v.index, bi[idx[e.group]]] = e.weight
                elif e.group in pidx: part_of[v.index] = pidx[e.group]
        P = np.array([tuple(v.co) for v in it.data.vertices])
        Wn = Wm.copy()
        for n in names_:
            r = RADIUS.get(n)
            if not r: continue
            ids = np.where(part_of == n)[0]
            kd = KDTree(len(ids))
            for k, i in enumerate(ids): kd.insert(P[i], k)
            kd.balance()
            for k, i in enumerate(ids):
                near = kd.find_range(P[i], r)
                js = np.array([ids[j] for _, j, _ in near]); d = np.array([dd for _, _, dd in near])
                g_ = np.exp(-(d / (r / 2)) ** 2)
                Wn[i] = (Wm[js] * g_[:, None]).sum(0) / g_.sum()
        # The shoulder plates: the breastplate part beyond the shoulder joint, standing ≥ PLATE_OFF off the upper arm,
        # short of the elbow.
        # - plate_mode=arm (the user's pick so far): the whole plate rides the upper arm alone, as one piece. A weight
        #   fading from chest to arm across it folded it at every arm swing; any share of the collarbone, blended
        #   over the 70-degree arms-down turn, shrank it as if melted.
        # - plate_mode=collar (tried, the user found it broken): the plate rides the collarbone, pre-tilted
        #   PLATE_TILT degrees down about the shoulder joint.
        # - plate_scale < 1: the plate shrunk toward the upper arm's axis (its middle), fading in over the first
        #   3 cm out from the joint, so less of it swings and stretches.
        PLATE_OFF, PLATE_TILT = float(opt.get('plate_off', 0.03)), math.radians(float(opt.get('plate_tilt', 55)))
        PLATE_SCALE = float(opt.get('plate_scale', 1.0))
        nplate = 0
        if slot == 'TOP' and PLATE_MODE in ('rigid', 'shoulder'):
            # the plates, every vertex alike: rigid on the upper arm, or (shoulder) on the collarbone
            for s_, S in (('L', 'Left'), ('R', 'Right')):
                gi = it.vertex_groups['plate_' + s_].index
                ids = [v.index for v in it.data.vertices if any(e.group == gi for e in v.groups)]
                for i in ids: Wn[i] = 0; Wn[i, bi[f'{S}Arm' if PLATE_MODE == 'rigid' else f'{S}Shoulder']] = 1.0
                it.vertex_groups.remove(it.vertex_groups['plate_' + s_])
                print('RIGID', S, len(ids))
        elif slot == 'TOP':
            for S, sg in (('Left', 1), ('Right', -1)):
                a0, a1 = J[f'{S}Arm'], J[f'{S}ForeArm']; ax = (a1 - a0).normalized(); L = (a1 - a0).length
                for i in np.where(part_of == 'tripo_part_1')[0]:
                    p = Vector(P[i])
                    if sg * p.x < sg * a0.x - 0.012: continue
                    t = (p - a0).dot(ax); off = ((p - a0) - ax * t).length
                    if t > L * 0.85 or off < PLATE_OFF: continue          # the sleeve and the elbow end keep theirs
                    k = min(1.0, max(0.0, (t + 0.012) / 0.042)); k = k * k * (3 - 2 * k)
                    q = p
                    if PLATE_SCALE != 1.0:
                        c_ = a0 + ax * (L * 0.4); f_ = 1 + (PLATE_SCALE - 1) * k
                        q = c_ + (q - c_) * f_
                    if PLATE_MODE == 'collar':
                        q = a0 + (Matrix.Rotation(sg * PLATE_TILT * k, 4, 'Y') @ (q - a0))
                    it.data.vertices[i].co = q; P[i] = tuple(q)
                    nplate += 1; Wn[i] = 0; Wn[i, bi[f'{S}Shoulder' if PLATE_MODE == 'collar' else f'{S}Arm']] = 1.0
        if slot == 'TOP': print('PLATE', nplate, PLATE_MODE, 'scale', PLATE_SCALE)
        # a narrow blend (2 cm) where the stiff plate meets the rest of the breastplate: a hard step there tore
        # into stretched streaks on top of the shoulder in the walk
        if slot == 'TOP' and nplate and PLATE_MODE not in ('rigid', 'shoulder'):
            ids = np.where(part_of == 'tripo_part_1')[0]; r = float(opt.get('plate_seam', 0.02))
            kd = KDTree(len(ids))
            for k, i in enumerate(ids): kd.insert(P[i], k)
            kd.balance()
            W2 = Wn.copy()
            for k, i in enumerate(ids):
                near = kd.find_range(P[i], r)
                js = np.array([ids[j] for _, j, _ in near]); d = np.array([dd for _, _, dd in near]); g_ = np.exp(-(d / (r / 2)) ** 2)
                W2[i] = (Wn[js] * g_[:, None]).sum(0) / g_.sum()
            Wn = W2
        for v in it.data.vertices:
            w = {bones[k]: float(x) for k, x in enumerate(Wn[v.index]) if x > 1e-3}
            if w: set_w(v, w)
        for n in names_: it.vertex_groups.remove(it.vertex_groups['part:' + n])
        print('STIFF', slot, {n: int((part_of == n).sum()) for n in names_})
    else:
        for g in [g for g in it.vertex_groups if g.name.startswith('part:')]: it.vertex_groups.remove(g)
    if panel is not None: it.vertex_groups.remove(it.vertex_groups['panel'])
    it.parent = arm; md = it.modifiers.new('Armature', 'ARMATURE'); md.object = arm

# 3. which body faces each item covers: by body region (the face's leading bone), since the armour has gaps
#    between its plates and a ray along the normal missed the body behind them (it showed through)
TOP_BONES = {'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'}
BOTTOM_BONES = {'Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'}
FOOT_BONES = {'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftToe_End', 'RightToe_End'}
guard_x = max(abs(v.co.x) for v in G['TOP'].data.vertices)     # the forearm guards' ends (furthest out of the top)
boot_top = float(opt.get('boot_top', 0.125))       # the boots' rim (they reach 0.138) less a margin; the trousers tuck in to 0.127
pieces = 0
neck_z, neck_xy = J['Neck'].z, (J['Neck'].x, J['Neck'].y)
for o in body:
    me = o.data; mw = o.matrix_world
    gname = {g.index: g.name[len('mixamorig:'):] for g in o.vertex_groups if g.name.startswith('mixamorig:')}
    lead = []
    for v in me.vertices:
        best = max(((e.weight, gname[e.group]) for e in v.groups if e.group in gname), default=(0, ''))
        lead.append(best[1])
    cover = []
    for p in me.polygons:
        c = mw @ p.center
        votes = {}
        for vi in p.vertices: votes[lead[vi]] = votes.get(lead[vi], 0) + 1
        bone_ = max(votes, key=votes.get)
        cv = set()
        if bone_ in TOP_BONES and not (bone_.endswith('ForeArm') and abs(c.x) > guard_x - 0.01): cv.add('TOP')
        # a top never hides the neck: seen over the stand-up collar it would be a hole down into the armour
        if c.z > neck_z - 0.005 and math.hypot(c.x - neck_xy[0], c.y - neck_xy[1]) < 0.065: cv.discard('TOP')
        if bone_ in BOTTOM_BONES and c.z > boot_top: cv.add('BOTTOM')
        if bone_ in FOOT_BONES or (bone_ in BOTTOM_BONES and c.z <= boot_top): cv.add('SHOES')
        if inside(c, 0.004): cv.add('HAIR')           # under the cap, 4 mm in from its edge
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
# unique names the viewer and to_game parse: body__<tokens>, then _1, _2 for repeats
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
