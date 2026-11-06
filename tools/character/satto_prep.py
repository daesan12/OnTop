"""사또 Tripo parts prep (tools/character/satto_prep.py): -- <in.glb> <out.glb>
part 1 (head: hair, amber beads, face skin) -> 90 hair (dark brown), 92 beads (saturated orange), 91 face skin;
part 2 (black robe skirt) copied as 93 (a black texel for pants=1's BOTTOM)."""
import bpy, bmesh, sys, os
import numpy as np

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], os.path.abspath(a[1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = lambda n: next(x for x in bpy.data.objects if x.type == 'MESH' and x.name.split('.')[0] == f'tripo_part_{n}')
o = obj(1)
img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.active; bm.faces.ensure_lookup_table()
C = np.array([np.mean([P[min(h_ - 1, int(l[uvl].uv.y * h_)), min(w_ - 1, int(l[uvl].uv.x * w_))] for l in f.loops], 0) for f in bm.faces])
r, g, b = C[:, 0], C[:, 1], C[:, 2]
cls = np.full(len(C), 1)                        # 0 hair, 1 skin, 2 beads
cls[C.mean(1) < 0.42] = 0
cls[(r - b > 0.45) & (g < 0.75 * r) & (r > 0.6)] = 2
nb = [[x.index for e in f.edges for x in e.link_faces if x is not f] for f in bm.faces]
for _ in range(3):
    new = cls.copy()
    for i, n in enumerate(nb):
        if n:
            v = np.bincount(cls[n], minlength=3)
            if v.max() * 2 > len(n): new[i] = v.argmax()
    cls = new
bm.free()
print('PREP part_1 hair', int((cls == 0).sum()), 'skin', int((cls == 1).sum()), 'beads', int((cls == 2).sum()))
for name, k in (('tripo_part_90', 0), ('tripo_part_91', 1), ('tripo_part_92', 2)):
    c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
    b_ = bmesh.new(); b_.from_mesh(c.data); b_.faces.ensure_lookup_table()
    bmesh.ops.delete(b_, geom=[f for f in b_.faces if cls[f.index] != k], context='FACES')
    if k == 1:   # the face for head_fit: above the chin only
        mw = c.matrix_world
        bmesh.ops.delete(b_, geom=[f for f in b_.faces if (mw @ f.calc_center_median()).z < float(os.environ.get('FACE_ABOVE', 0.62))], context='FACES')
    b_.to_mesh(c.data); b_.free(); c.name = name
bpy.data.objects.remove(o)
s2 = obj(2); c = s2.copy(); c.data = s2.data.copy(); bpy.context.scene.collection.objects.link(c); c.name = 'tripo_part_93'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='AUTO')
print('RESULT', out)
