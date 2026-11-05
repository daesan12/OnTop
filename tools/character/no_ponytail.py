"""The girl's default hair e without its ponytail, as a new hair item: -- <shared.glb> <out.glb> [new=j] [dist=0.035] [ymin=0.0] [cap=1]
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
hairs = []
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
# cap_y (not the forehead: the fringe's gaps would turn brown), raised cap_up (2.5 mm), all on one hair texel.
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
    caps = []
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and base(o).startswith('body')]:
        k = o.copy(); k.data = o.data.copy(); bpy.context.scene.collection.objects.link(k)
        omw = k.matrix_world; imw = omw.inverted()
        b = bmesh.new(); b.from_mesh(k.data); b.normal_update()
        keep = set()
        for f in b.faces:
            p = omw @ f.calc_center_median(); n = (omw.to_3x3() @ f.normal).normalized()
            if p.y < CY or p.z < float(opt.get('cap_z', 0.7)): continue
            if hair_bvh.ray_cast(p + n * 0.001, n, 0.05)[0] is not None: keep.add(f)
        bmesh.ops.delete(b, geom=[f for f in b.faces if f not in keep], context='FACES')
        bmesh.ops.delete(b, geom=[v for v in b.verts if not v.link_faces], context='VERTS')
        for v in b.verts: v.co = imw @ ((omw @ v.co) + (omw.to_3x3() @ v.normal).normalized() * UP)
        uvl = b.loops.layers.uv.active
        for f in b.faces:
            for l in f.loops: l[uvl].uv = texel
        b.to_mesh(k.data); b.free()
        if not k.data.polygons: bpy.data.objects.remove(k); continue
        k.data.materials.clear(); k.data.materials.append(c.data.materials[0])
        caps.append(k)
    for x in bpy.data.objects: x.select_set(x in caps or x is c)
    bpy.context.view_layer.objects.active = c; bpy.ops.object.join()
    print('CAP', sum(1 for _ in caps), 'body pieces under the hair joined; hair now', len(c.data.polygons), 'faces')
if ad:
    for t in ad.nla_tracks: t.mute = False
    ad.action = active
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_apply=False, export_image_format='AUTO')
print('RESULT', out)
