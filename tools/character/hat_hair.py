"""A hat's hair, per character: -- <shared_layers.glb> <out.glb> set=h [man=b] [girl=e] [drop_hair=1] [gap=0.003]
A hat item (item__HAIR__<set>, e.g. the gat or the general's helmet) is worn by both characters, but its own hair
was one character's. Here each character's default hair (man b, girl e) is copied in as item__HAIR__<set>__for_man /
__for_girl (the game draws it on that character only, characterLook.ts) and kept inside the hat: every hair vertex the
hat lies between the head's centre and it is pulled in to `gap` (3 mm) inside the hat, so the hair shows only where
it comes out from under the hat (under the brim, below a cap). drop_hair=1 also takes the hat item's own brown hair
(Tripo's, rougher than the default hair) out of it; its dark parts (hat, ribbon) stay. man= or girl= empty: none.
hair_faces=N cuts each copy down to about N faces (off: raise the outfit's near budget instead). cap_for=man,cap_black: that material (the general's cap) is the man's only; the girl gets her scalp back instead.
pull=0 leaves the hair where it is (a crown on the girl's hair: pulled in, the strands crossing it went spiky).
over=1 (a cap under a crown): the hat's cap (material over_mat, e.g. cap_black, else its near-black
faces) is laid over by the hair, not hidden under.
strict=1 (a cap fitting the skull) keeps only the hair wholly outside the hat, in pieces of strict_min faces or more."""
import bpy, bmesh, sys, re, os
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], os.path.abspath(a[1])
opt = dict(x.split('=', 1) for x in a[2:])
SET, GAP = opt['set'], float(opt.get('gap', 0.003))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ad = arm.animation_data; active = ad.action if ad else None
if ad:
    for t in ad.nla_tracks: t.mute = True
    ad.action = None
for pb in arm.pose.bones: pb.matrix_basis.identity()
bpy.context.view_layer.update()
base = lambda o: re.sub(r'(_\d+)?(\.\d+)?$', '', o.name)
meshes = lambda name: [o for o in bpy.data.objects if o.type == 'MESH' and base(o) == name]
hats = meshes(f'item__HAIR__{SET}')
assert hats, f'no item__HAIR__{SET}'

def image_of(o):
    return next((n.image for m in o.data.materials if m and m.node_tree for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)

# Tripo's brown hair out of the hat item: whole islands whose mean texel is brown (the hat and its ribbon are near black)
if opt.get('drop_hair', '0') == '1':
    for o in hats:
        img = image_of(o); w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
        bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.active
        seen, brown = set(), []
        for f in bm.faces:
            if f in seen: continue
            grp = [f]; seen.add(f); st = [f]
            while st:
                g = st.pop()
                for e in g.edges:
                    for nf in e.link_faces:
                        if nf not in seen: seen.add(nf); grp.append(nf); st.append(nf)
            c = np.mean([P[min(h_ - 1, int(l[uvl].uv.y * h_)), min(w_ - 1, int(l[uvl].uv.x * w_))] for g in grp for l in g.loops], 0)
            if c.mean() > 0.16 and c[0] - c[2] > 0.06: brown += grp
        bmesh.ops.delete(bm, geom=brown, context='FACES')
        # and crumbs, pieces of under `crumbs` (20) faces joined by position (the import split the mesh along UV
        # seams): two single dark triangles of Tripo's hair floated before the forehead, hidden by the man's fringe,
        # two black marks on the girl's bare forehead in the game, which draws both sides (user)
        root = {}
        def find(k):
            while root.setdefault(k, k) != k: root[k] = root[root[k]]; k = root[k]
            return k
        key = lambda v: tuple(round(x, 5) for x in v.co)
        for f in bm.faces:
            ks = [key(v) for v in f.verts]
            for k in ks[1:]: root[find(k)] = find(ks[0])
        size = {}
        for f in bm.faces: r = find(key(f.verts[0])); size[r] = size.get(r, 0) + 1
        crumbs = [f for f in bm.faces if size[find(key(f.verts[0]))] < int(opt.get('crumbs', 20))]
        bmesh.ops.delete(bm, geom=crumbs, context='FACES'); bm.to_mesh(o.data); bm.free()
        print('DROP', o.name, len(brown), 'brown hair faces,', len(crumbs), 'crumb faces')

# cap_for=man,MAT (the general's helmet): the cap under the crown (material MAT, cap_black) becomes the man's piece,
# item__HAIR__<set>__for_man; the girl wears the crown on her own hair instead (the black dome behind the crown looked
# odd, user). The scalp the cap hid (body__...HAIR<set>... pieces) comes back in the girl's piece, so her hair sits
# on her head, not on nothing.
CAP_FOR = opt.get('cap_for')
if CAP_FOR:
    who, mat = CAP_FOR.split(',')
    for k, o in enumerate(list(hats)):
        mi = next((i for i, m in enumerate(o.data.materials) if m and m.name.startswith(mat)), None)
        # (and the near-black faces of the other material: Tripo's own black cap, under the body's)
        img = image_of(o); w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
        def is_cap(f, uvl):
            if f.material_index == mi: return True
            return np.mean([P[min(h_ - 1, int(l[uvl].uv.y * h_)), min(w_ - 1, int(l[uvl].uv.x * w_))] for l in f.loops], 0).max() < float(opt.get('cap_dark', 0.12))
        c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
        for ob, keep_cap in ((c, True), (o, False)):
            bm = bmesh.new(); bm.from_mesh(ob.data); uvl = bm.loops.layers.uv.active
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if is_cap(f, uvl) != keep_cap], context='FACES')
            bm.to_mesh(ob.data); bm.free()
        c.name = f'item__HAIR__{SET}__for_{who}' + (f'_{k + 20}' if k else '')
        print('CAP', len(c.data.polygons), 'cap faces to', c.name)
    other = 'girl' if who == 'man' else 'man'
    for k, o in enumerate([o for o in bpy.data.objects if o.type == 'MESH' and base(o).startswith('body__')
                           and f'HAIR{SET}' in re.findall(r'[A-Z]+[a-z0-9]+', base(o))]):
        c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
        if 'tokens' in c.keys(): del c['tokens']
        rest = [t for t in re.findall(r'[A-Z]+[a-z0-9]+', base(o)) if t != f'HAIR{SET}']
        # (still hidden under the other items that hid it: body__HAIRg_TOPh stays under the dopo's collar)
        c.name = f'item__HAIR__{SET}__for_{other}' + (f'__under_{"_".join(rest)}' if rest else '') + f'_{k + 30}'
        print('SCALP', o.name, len(c.data.polygons), 'faces to', c.name)

# crown_for=girl,S,DZ (with cap_for: the general's crown on the girl): her hair is fuller than the cap, so the crown
# sat buried in it. The rest of the hat becomes the man's piece too, and the girl gets her own copy of it, scaled by
# S about the head's centre and raised DZ, sitting on her hair (pull=0 leaves her hair as it is).
CROWN_FOR = opt.get('crown_for')

# the hat, world space. over=1 (the general's helmet): its near-black faces are a cap the hair goes OVER (the girl's
# hair covers it, the black dome behind the crown looked odd, user); the rest (crown, horns) the hair goes under.
OVER = opt.get('over', '0') == '1'
hb, cb_ = bmesh.new(), bmesh.new()
for o in hats:
    me = o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    t = bmesh.new(); t.from_mesh(me); t.transform(o.matrix_world)
    if OVER:
        img = image_of(o); w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
        uvl = t.loops.layers.uv.active
        dark = lambda f: np.mean([P[min(h_ - 1, int(l[uvl].uv.y * h_)), min(w_ - 1, int(l[uvl].uv.x * w_))] for l in f.loops], 0).max() < float(opt.get('over_dark', 0.12))
        cap = bmesh.new(); tmpc = bpy.data.meshes.new('c'); t.to_mesh(tmpc); cap.from_mesh(tmpc); bpy.data.meshes.remove(tmpc)
        cap.faces.ensure_lookup_table(); t.faces.ensure_lookup_table()
        # (the cap is its own material, cap_black on the general: by name when given, else by its near-black texel)
        mats = [m.name if m else '' for m in o.data.materials]; cm = opt.get('over_mat')
        is_dark = [mats[f.material_index].startswith(cm) if cm else dark(f) for f in t.faces]
        bmesh.ops.delete(cap, geom=[f for f, k in zip(cap.faces, is_dark) if not k], context='FACES')
        bmesh.ops.delete(t, geom=[f for f, k in zip(t.faces, is_dark) if k], context='FACES')
        tmp = bpy.data.meshes.new('c'); cap.to_mesh(tmp); cap.free(); cb_.from_mesh(tmp); bpy.data.meshes.remove(tmp)
        print('OVER', sum(is_dark), 'dark cap faces of', len(is_dark))
    tmp = bpy.data.meshes.new('t'); t.to_mesh(tmp); t.free(); hb.from_mesh(tmp); bpy.data.meshes.remove(tmp)
hat_bvh = BVHTree.FromBMesh(hb); hb.free()
cap_bvh = BVHTree.FromBMesh(cb_) if OVER else None; cb_.free()

# the head's centre: the middle of the body's head (faces the Head bone leads)
heads = []
for o in bpy.data.objects:
    if o.type != 'MESH' or not base(o).startswith('body'): continue
    gi = {g.index for g in o.vertex_groups if g.name.endswith('Head')}
    for v in o.data.vertices:
        w = max((e.weight for e in v.groups if e.group in gi), default=0)
        if w > 0.8: heads.append(o.matrix_world @ v.co)
lo = Vector([min(p[i] for p in heads) for i in range(3)]); hi = Vector([max(p[i] for p in heads) for i in range(3)])
centre = (lo + hi) / 2
print('HEAD centre', [round(x, 3) for x in centre], 'size', [round(x, 3) for x in hi - lo])

if CROWN_FOR:
    who_c, S_, DZ_ = CROWN_FOR.split(','); S_, DZ_ = float(S_), float(DZ_)
    other_c = 'man' if who_c == 'girl' else 'girl'
    from mathutils import Matrix
    for k, o in enumerate(list(hats)):
        if not o.data.polygons: continue
        c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
        T_ = Matrix.Translation(centre + Vector((0, 0, DZ_))) @ Matrix.Scale(S_, 4) @ Matrix.Translation(-centre)
        mw = c.matrix_world; c.data.transform(mw.inverted() @ T_ @ mw)
        c.name = f'item__HAIR__{SET}__for_{who_c}' + f'_{k + 40}'
        o.name = f'item__HAIR__{SET}__for_{other_c}' + f'_{k + 50}'
        print('CROWN', c.name, 'x', S_, 'up', DZ_, ';', o.name)

for variant in ('man', 'girl'):
    hid = opt.get(variant, {'man': 'b', 'girl': 'e'}[variant])
    if not hid: continue
    for k, o in enumerate(meshes(f'item__HAIR__{hid}')):
        c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
        mw, imw = c.matrix_world, c.matrix_world.inverted(); n_ = 0; pulled = set()
        n_over = 0
        for v in c.data.vertices:
            p = mw @ v.co; d = p - centre; L = d.length
            if L < 1e-6: continue
            u = d / L
            if cap_bvh:                              # under the cap: pushed out over it
                ch = cap_bvh.ray_cast(centre, u, L + 0.08)
                if ch[0] is not None and (ch[0] - centre).length > L - GAP:
                    p = ch[0] + u * float(opt.get('over_gap', 0.004)); L = (p - centre).length; v.co = imw @ p; n_over += 1
            hit = hat_bvh.ray_cast(centre, u, L) if opt.get('pull', '1') == '1' else (None,)
            if hit[0] is not None:                   # the hat lies between the head's centre and this vertex
                p = hit[0] - u * GAP; v.co = imw @ p; n_ += 1; pulled.add(v.index)
            # (and straight down: over the brim, by the crown's foot, the ray from the centre could pass the gap between
            # the crown and the brim and hair stuck up through the brim, user)
            DOWN = float(opt.get('down', 0.12))
            dn = hat_bvh.ray_cast(p + Vector((0, 0, 0.0005)), Vector((0, 0, -1)), DOWN) if DOWN > 0 else (None,)
            if dn[0] is not None and (p - centre).length > 0.05 and p.z > centre.z:
                v.co = imw @ Vector((p.x, p.y, dn[0].z - GAP)); n_ += 1; pulled.add(v.index)
        if cap_bvh: print('HAIR', n_over, 'vertices laid over the cap')
        # faces wholly pulled in lie under the hat, never seen: they go (the helmet hid nine tenths of the girl's hair)
        cb = bmesh.new(); cb.from_mesh(c.data)
        gone = [f for f in cb.faces if all(v.index in pulled for v in f.verts)]
        # strict=1 (a cap that fits the skull, the general's): every face touching the cap goes, and the bits of
        # hair left loose (islands under strict_min, 300 faces): pressed flat onto the cap, they lay round the ears
        # as ragged patches (user)
        if opt.get('strict', '0') == '1':
            gone = [f for f in cb.faces if any(v.index in pulled for v in f.verts)]
        bmesh.ops.delete(cb, geom=gone, context='FACES')
        if opt.get('strict', '0') == '1':
            seen, small = set(), []
            for f in cb.faces:
                if f in seen: continue
                grp = [f]; seen.add(f); st = [f]
                while st:
                    g = st.pop()
                    for e in g.edges:
                        for nf in e.link_faces:
                            if nf not in seen: seen.add(nf); grp.append(nf); st.append(nf)
                if len(grp) < int(opt.get('strict_min', 300)): small += grp
            bmesh.ops.delete(cb, geom=small, context='FACES'); print('HAIR', len(small), 'loose faces dropped')
        bmesh.ops.delete(cb, geom=[v for v in cb.verts if not v.link_faces], context='VERTS')
        cb.to_mesh(c.data); cb.free()
        print('HAIR', len(gone), 'faces wholly under the hat dropped')
        # (hair_faces=N: the copy is cut down to about N faces. Off by default: cut hard (3000) the hair's texture went
        # streaky; give the outfit file a bigger near budget instead, or the dense hair takes it and the robe comes
        # out coarse with holes at the shoulders, user)
        target = int(opt.get('hair_faces', 0))
        if target and len(c.data.polygons) > target:
            md = c.modifiers.new('dec', 'DECIMATE'); md.ratio = target / len(c.data.polygons); md.use_collapse_triangulate = True
            for m_ in list(c.modifiers):
                if m_.type == 'ARMATURE': c.modifiers.remove(m_)
            bpy.context.view_layer.objects.active = c; bpy.ops.object.modifier_apply(modifier='dec')
            am = c.modifiers.new('Armature', 'ARMATURE'); am.object = arm
            print('HAIR decimated to', len(c.data.polygons), 'faces')
        c.name = f'item__HAIR__{SET}__for_{variant}' + (f'_{k}' if k else '')
        print('HAIR', c.name, 'from', o.name, len(c.data.vertices), 'vertices,', n_, 'pulled inside the hat')

for o in bpy.data.objects:
    if o.type == 'ARMATURE' and ad:
        for t in ad.nla_tracks: t.mute = False
        ad.action = active
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_apply=False, export_image_format='AUTO')
print('RESULT', out)
