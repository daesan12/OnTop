"""The girl's default hair e without its ponytail, as a new hair item: -- <shared.glb> <out.glb> [new=j] [dist=0.035] [ymin=0.0] [squash=k] [cap=1] [back=i back_y=0.0]
Hair faces behind ymin (the back half) whose middle lies farther than dist from the body's surface are the ponytail and
its scrunchie; they go. The copy becomes item__HAIR__<new> (weights and texture kept)."""
import bpy, bmesh, sys, os, re
from mathutils import Matrix
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], os.path.abspath(a[1])
opt = dict(x.split('=', 1) for x in a[2:])
NEW, DIST, YMIN = opt.get('new', 'j'), float(opt.get('dist', 0.035)), float(opt.get('ymin', 0.0))
ZMIN = float(opt.get('zmin', 0.0))
# the ears (shared body): beyond |x| 0.158, between y -0.01 and 0.065, below z 0.79. Nothing is laid on them (the back
# layer turned them brown, user)
EAR = [float(v) for v in opt.get('ears', '0.158,-0.01,0.065,0.79').split(',')]
ear = lambda p: abs(p.x) > EAR[0] and EAR[1] < p.y < EAR[2] and p.z < EAR[3]
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
bb = bmesh.new()
for o in bpy.data.objects:
    if o.type == 'MESH' and base(o).startswith('body'):
        t = bmesh.new(); t.from_mesh(o.data); t.transform(o.matrix_world)
        tmp = bpy.data.meshes.new('t'); t.to_mesh(tmp); t.free(); bb.from_mesh(tmp); bpy.data.meshes.remove(tmp)
body = BVHTree.FromBMesh(bb); bb.free()
hairs, ponies = [], []
for k, o in enumerate([o for o in bpy.data.objects if o.type == 'MESH' and base(o) == 'item__HAIR__e']):
    c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
    mw = c.matrix_world
    b = bmesh.new(); b.from_mesh(c.data)
    gone = []
    for f in b.faces:
        p = mw @ f.calc_center_median()
        if p.y > YMIN and p.z > ZMIN:
            hit = body.find_nearest(p)
            if hit[0] is not None and hit[3] > DIST: gone.append(f)
    # (the ponytail, world space with its UVs: the back of the under-layer takes its long strands, cap=1)
    pb = b.copy(); gs = set(f.index for f in gone); pb.faces.ensure_lookup_table()
    bmesh.ops.delete(pb, geom=[f for f in pb.faces if f.index not in gs], context='FACES'); pb.transform(mw); ponies.append(pb)
    if float(opt.get('squash', 0)) > 0:
        # squash=k: the ponytail is not cut but laid down over the back of the head, its own strands covering it (the
        # head looked shaved behind, user): each of its vertices goes to the scalp's nearest point, raised squash_up
        # plus k of how far it stood beyond dist (its layers keep their order), after spreading x by squash_x. What
        # falls below squash_z (the neck) goes.
        KQ, UPQ, SX, ZQ = float(opt['squash']), float(opt.get('squash_up', 0.006)), float(opt.get('squash_x', 1.4)), float(opt.get('squash_z', 0.62))
        imw = mw.inverted(); gs = set(gone); moved = set()
        for f in gone:
            for v in f.verts:
                if v in moved or not all(lf in gs for lf in v.link_faces): continue
                q = mw @ v.co; d0 = body.find_nearest(q)[3]
                q.x *= SX
                co, n, _, _ = body.find_nearest(q)
                v.co = imw @ (co + n.normalized() * (UPQ + KQ * max(0.0, d0 - DIST))); moved.add(v)
        low = [f for f in gone if (mw @ f.calc_center_median()).z < ZQ or any(v in moved and ear(mw @ v.co) for v in f.verts)]
        bmesh.ops.delete(b, geom=low, context='FACES')
        print('SQUASH', len(moved), 'ponytail vertices laid down,', len(low), 'faces below the nape or on the ears off')
        gone = []
    bmesh.ops.delete(b, geom=gone, context='FACES')
    # loose bits left hanging (under 200 faces, joined by position) go too
    root = {}
    def find(x):
        while root.setdefault(x, x) != x: root[x] = root[root[x]]; x = root[x]
        return x
    key = lambda v: tuple(round(x, 5) for x in v.co)
    for f in b.faces:
        ks = [key(v) for v in f.verts]
        for kk in ks[1:]: root[find(kk)] = find(ks[0])
    size = {}
    for f in b.faces: r = find(key(f.verts[0])); size[r] = size.get(r, 0) + 1
    small = [f for f in b.faces if size[find(key(f.verts[0]))] < int(opt.get('min_island', 200))]
    bmesh.ops.delete(b, geom=small, context='FACES')
    b.to_mesh(c.data); b.free()
    c.name = f'item__HAIR__{NEW}' + (f'_{k}' if k else '')
    print('PONYTAIL', o.name, len(gone), 'faces off,', len(small), 'loose;', len(c.data.polygons), 'left as', c.name)
    hairs.append(c)

# cap=1: an under-layer of hair colour just over the scalp, so the gaps between the locks (the cut took bits of them
# at the sides) show hair, not the inside of the hair or the skin (user). The body's faces under the hair, behind
# cap_y (not the forehead: the fringe's gaps would turn brown), raised cap_up (2.5 mm), on one hair texel; behind
# cap_back down to cap_nape, the whole back of the head, textured from the removed ponytail's nearest point.
if opt.get('cap', '0') == '1' and hairs:
    import numpy as np
    c = hairs[0]; mw = c.matrix_world
    hb = bmesh.new(); hb.from_mesh(c.data); hb.transform(mw); hair_bvh = BVHTree.FromBMesh(hb); hb.free()
    img = next(n.image for m in c.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
    uvd = c.data.uv_layers.active.data
    cols = []
    for p in list(c.data.polygons)[::7]:
        u = sum((uvd[l].uv for l in p.loop_indices), uvd[p.loop_indices[0]].uv * 0) / len(p.loop_indices)
        cols.append((float(P[min(h_ - 1, int(u.y * h_)), min(w_ - 1, int(u.x * w_))].mean()), tuple(u)))
    cols.sort(); texel = cols[len(cols) // 3][1]          # a darker-than-middle hair texel: the under-layer is shade
    UP, CY = float(opt.get('cap_up', 0.0025)), float(opt.get('cap_y', -0.05))
    BACK, NAPE = float(opt.get('cap_back', 0.02)), float(opt.get('cap_nape', 0.64))
    from mathutils.interpolate import poly_3d_calc
    pony = None; pony_bvh = None
    if ponies:
        pony = ponies[0]; pony.faces.ensure_lookup_table(); puv = pony.loops.layers.uv.active
        pony_bvh = BVHTree.FromBMesh(pony)
    caps = []
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and base(o).startswith('body')]:
        k = o.copy(); k.data = o.data.copy(); bpy.context.scene.collection.objects.link(k)
        omw = k.matrix_world; imw = omw.inverted()
        b = bmesh.new(); b.from_mesh(k.data); b.normal_update()
        keep = set()
        for f in b.faces:
            p = omw @ f.calc_center_median(); n = (omw.to_3x3() @ f.normal).normalized()
            if p.y < CY or p.z < float(opt.get('cap_z', 0.7)) and not (p.y > BACK and p.z > NAPE) or ear(p): continue
            # (and the whole back of the head down to the nape: the ponytail had covered it, and without it the head
            # looked shaved there, user)
            if p.y > BACK and p.z > NAPE or hair_bvh.ray_cast(p + n * 0.001, n, 0.05)[0] is not None: keep.add(f)
        bmesh.ops.delete(b, geom=[f for f in b.faces if f not in keep], context='FACES')
        bmesh.ops.delete(b, geom=[v for v in b.verts if not v.link_faces], context='VERTS')
        for v in b.verts: v.co = imw @ ((omw @ v.co) + (omw.to_3x3() @ v.normal).normalized() * UP)
        uvl = b.loops.layers.uv.active
        for f in b.faces:
            back = (omw @ f.calc_center_median()).y > BACK
            for l in f.loops:
                if back and pony_bvh and opt.get('cap_pony', '0') == '1':
                    q = omw @ l.vert.co; hit = pony_bvh.find_nearest(q)
                    pf = pony.faces[hit[2]]
                    wts = poly_3d_calc([v.co for v in pf.verts], hit[0])
                    l[uvl].uv = sum((pl[puv].uv * w for pl, w in zip(pf.loops, wts)), pf.loops[0][puv].uv * 0)
                else: l[uvl].uv = texel
        b.to_mesh(k.data); b.free()
        if not k.data.polygons: bpy.data.objects.remove(k); continue
        k.data.materials.clear(); k.data.materials.append(c.data.materials[0])
        caps.append(k)
    for x in bpy.data.objects: x.select_set(x in caps or x is c)
    bpy.context.view_layer.objects.active = c; bpy.ops.object.join()
    print('CAP', sum(1 for _ in caps), 'body pieces under the hair joined; hair now', len(c.data.polygons), 'faces')
# back=i: the back of another hair item (the Tripo bun hair i: smooth hair down to the nape and a low bun) under this
# one, recoloured to this hair's colours (mean and spread per channel), so the head is not bare behind and looks like
# real hair. The ponytail laid down over it (squash) looked messy (user). Its faces before back_y and on the ears go.
if opt.get('back') and hairs:
    import numpy as np
    c = hairs[0]
    src_ = [o for o in bpy.data.objects if o.type == 'MESH' and base(o) == f"item__HAIR__{opt['back']}"]
    def texels(o):
        img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
        w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)
        uvd = o.data.uv_layers.active.data; T = []
        for p in list(o.data.polygons)[::5]:
            u = uvd[p.loop_indices[0]].uv
            T.append(P[min(h_ - 1, int(u.y * h_)), min(w_ - 1, int(u.x * w_)), :3])
        return img, P, np.array(T)
    _, _, Te = texels(c)
    BY = float(opt.get('back_y', 0.0)); joined = []
    for s_ in src_:
        k = s_.copy(); k.data = s_.data.copy(); bpy.context.scene.collection.objects.link(k)
        kmw = k.matrix_world; b = bmesh.new(); b.from_mesh(k.data)
        bmesh.ops.delete(b, geom=[f for f in b.faces if (kmw @ f.calc_center_median()).y < BY or ear(kmw @ f.calc_center_median())], context='FACES')
        b.to_mesh(k.data); b.free()
        img, P, Ti = texels(k)
        mi, si, me_, se = Ti.mean(0), Ti.std(0) + 1e-4, Te.mean(0), Te.std(0)
        Q = P.copy(); Q[..., :3] = np.clip((P[..., :3] - mi) / si * se + me_, 0, 1)
        new = bpy.data.images.new(f"{img.name}_as_{base(c)}", img.size[0], img.size[1], alpha=True)
        new.pixels[:] = Q.ravel(); new.pack()
        for i_, m in enumerate(k.data.materials):
            m2 = m.copy(); k.data.materials[i_] = m2
            for nd in m2.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.image: nd.image = new
        joined.append(k)
        print('BACK', s_.name, len(k.data.polygons), 'faces, colour', mi.round(2).tolist(), '->', me_.round(2).tolist())
    for x in bpy.data.objects: x.select_set(x in joined or x is c)
    bpy.context.view_layer.objects.active = c; bpy.ops.object.join()
if ad:
    for t in ad.nla_tracks: t.mute = False
    ad.action = active
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_apply=False, export_image_format='AUTO')
print('RESULT', out)
