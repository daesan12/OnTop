"""One hair item's texture recoloured to another's colours: -- <shared.glb> <out.glb> item=j like=e [drop_skin=0.006]
Mean and spread per channel of the texels the item's faces use are moved to those of `like`'s (a Tripo remake of the
girl's default hair came out lighter and pinker than the default hair, user). The item gets its own copy of the image."""
import bpy, sys, os, re
import numpy as np

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], os.path.abspath(a[1])
opt = dict(x.split('=', 1) for x in a[2:])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
base = lambda o: re.sub(r'(_\d+)?(\.\d+)?$', '', o.name)
item = lambda n: [o for o in bpy.data.objects if o.type == 'MESH' and base(o) == f'item__HAIR__{n}']


def texels(o):
    img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)
    uvd = o.data.uv_layers.active.data
    T = [P[min(h_ - 1, int(uvd[p.loop_indices[0]].uv.y * h_)), min(w_ - 1, int(uvd[p.loop_indices[0]].uv.x * w_)), :3]
         for p in list(o.data.polygons)[::3]]
    return img, P, np.array(T)


_, _, Tl = texels(item(opt.get('like', 'e'))[0])
# drop_skin=dist: faces painted skin colour lying within dist of the body (the parting's edge: Tripo painted the scalp
# showing through it onto the hair, a thin scar-like line on the forehead between the locks, user) go first
if float(opt.get('drop_skin', 0)) > 0:
    import bmesh
    from mathutils.bvhtree import BVHTree
    bb = bmesh.new()
    for o in bpy.data.objects:
        if o.type == 'MESH' and base(o).startswith('body'):
            t = bmesh.new(); t.from_mesh(o.data); t.transform(o.matrix_world)
            tmp = bpy.data.meshes.new('t'); t.to_mesh(tmp); t.free(); bb.from_mesh(tmp); bpy.data.meshes.remove(tmp)
    body = BVHTree.FromBMesh(bb); bb.free(); D = float(opt['drop_skin'])
    for o in item(opt['item']):
        img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
        w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
        b = bmesh.new(); b.from_mesh(o.data); uvl = b.loops.layers.uv.active; mw = o.matrix_world
        def skin(f):
            c = np.mean([P[min(h_ - 1, int(l[uvl].uv.y * h_)), min(w_ - 1, int(l[uvl].uv.x * w_))] for l in f.loops], 0)
            return c[0] > 0.65 and c[0] - c[2] > 0.12 and c.mean() > 0.58
        gone = [f for f in b.faces if skin(f) and body.find_nearest(mw @ f.calc_center_median())[3] < D]
        bmesh.ops.delete(b, geom=gone, context='FACES'); b.to_mesh(o.data); b.free()
        print('SKIN', o.name, len(gone), 'skin-coloured faces on the scalp dropped')
for o in item(opt['item']):
    img, P, Ti = texels(o)
    mi, si, ml, sl = Ti.mean(0), Ti.std(0) + 1e-4, Tl.mean(0), Tl.std(0)
    Q = P.copy(); Q[..., :3] = np.clip((P[..., :3] - mi) / si * sl + ml, 0, 1)
    new = bpy.data.images.new(f'{img.name}_recolored', img.size[0], img.size[1], alpha=True)
    new.pixels[:] = Q.ravel(); new.pack()
    for i, m in enumerate(o.data.materials):
        m2 = m.copy(); o.data.materials[i] = m2
        for nd in m2.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and nd.image: nd.image = new
    print('RECOLOR', o.name, mi.round(2).tolist(), '->', ml.round(2).tolist())
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_apply=False, export_image_format='AUTO')
print('RESULT', out)
