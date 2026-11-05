"""A hat's hair, per character: -- <shared_layers.glb> <out.glb> set=h [man=b] [girl=e] [drop_hair=1] [gap=0.003]
A hat item (item__HAIR__<set>, e.g. the gat or the general's helmet) is worn by both characters, but its own hair
was one character's. Here each character's default hair (man b, girl e) is copied in as item__HAIR__<set>__for_man /
__for_girl (the game draws it on that character only, characterLook.ts) and kept inside the hat: every hair vertex the
hat lies between the head's centre and it is pulled in to `gap` (3 mm) inside the hat, so the hair shows only where
it comes out from under the hat (under the brim, below a cap). drop_hair=1 also takes the hat item's own brown hair
(Tripo's, rougher than the default hair) out of it; its dark parts (hat, ribbon) stay. man= or girl= empty: none.
hair_faces=N cuts each copy down to about N faces (off: raise the outfit's near budget instead). strict=1 (a cap fitting the skull) keeps only the hair wholly outside the hat, in pieces of strict_min faces or more."""
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
        bmesh.ops.delete(bm, geom=brown, context='FACES'); bm.to_mesh(o.data); bm.free()
        print('DROP', o.name, len(brown), 'brown hair faces')

# the hat, world space
hb = bmesh.new()
for o in hats:
    me = o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    t = bmesh.new(); t.from_mesh(me); t.transform(o.matrix_world)
    tmp = bpy.data.meshes.new('t'); t.to_mesh(tmp); t.free(); hb.from_mesh(tmp); bpy.data.meshes.remove(tmp)
hat_bvh = BVHTree.FromBMesh(hb); hb.free()

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

for variant in ('man', 'girl'):
    hid = opt.get(variant, {'man': 'b', 'girl': 'e'}[variant])
    if not hid: continue
    for k, o in enumerate(meshes(f'item__HAIR__{hid}')):
        c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
        mw, imw = c.matrix_world, c.matrix_world.inverted(); n_ = 0; pulled = set()
        for v in c.data.vertices:
            p = mw @ v.co; d = p - centre; L = d.length
            if L < 1e-6: continue
            hit = hat_bvh.ray_cast(centre, d / L, L)
            if hit[0] is not None:                   # the hat lies between the head's centre and this vertex
                v.co = imw @ (hit[0] - d / L * GAP); n_ += 1; pulled.add(v.index)
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
