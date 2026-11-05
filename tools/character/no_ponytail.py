"""The girl's default hair e without its ponytail, as a new hair item: -- <shared.glb> <out.glb> [new=j] [dist=0.035] [ymin=0.0]
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
if ad:
    for t in ad.nla_tracks: t.mute = False
    ad.action = active
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_apply=False, export_image_format='AUTO')
print('RESULT', out)
