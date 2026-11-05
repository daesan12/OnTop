"""Split a Tripo head part (hair and face skin came out as one part) by texel colour:
-- <parts.glb> <out.glb> part=1 [hair=90] [face=91] [dark=0.5] [smooth=4]
Each face is hair when its mean texel brightness is under `dark`; then `smooth` passes of neighbour majority vote
clean the edge. The hair becomes tripo_part_<hair>, the skin tripo_part_<face>; every other part is kept."""
import bpy, bmesh, sys, os
import numpy as np

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], os.path.abspath(a[1])
opt = dict(x.split('=', 1) for x in a[2:])
PART = f"tripo_part_{opt.get('part', '1')}"
HAIR, FACE = f"tripo_part_{opt.get('hair', '90')}", f"tripo_part_{opt.get('face', '91')}"
DARK, SMOOTH = float(opt.get('dark', 0.5)), int(opt.get('smooth', 4))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = next(x for x in bpy.data.objects if x.type == 'MESH' and x.name.split('.')[0] == PART)
img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.active; bm.faces.ensure_lookup_table()
tex = lambda u: P[min(h_ - 1, max(0, int(u.y * h_))), min(w_ - 1, max(0, int(u.x * w_)))]
hair = np.array([np.mean([tex(l[uvl].uv) for l in f.loops], 0).mean() < DARK for f in bm.faces])
nb = [[g.index for e in f.edges for g in e.link_faces if g is not f] for f in bm.faces]
for _ in range(SMOOTH):
    hair = np.array([(hair[n].sum() * 2 > len(n)) if n and hair[n].sum() * 2 != len(n) else hair[i] for i, n in enumerate(nb)])
bm.free()
print('SPLIT', PART, int(hair.sum()), 'hair faces,', int((~hair).sum()), 'skin faces')
for name, keep in ((HAIR, True), (FACE, False)):
    c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
    b = bmesh.new(); b.from_mesh(c.data); b.faces.ensure_lookup_table()
    bmesh.ops.delete(b, geom=[f for f in b.faces if hair[f.index] != keep], context='FACES')
    if keep:   # (the eyelids' dark lines came out as hair: small islands go; welded first, the import split UV seams)
        bmesh.ops.remove_doubles(b, verts=b.verts, dist=1e-5)
        seen, small = set(), []
        for f in b.faces:
            if f in seen: continue
            grp = [f]; seen.add(f); st = [f]
            while st:
                g = st.pop()
                for e in g.edges:
                    for nf in e.link_faces:
                        if nf not in seen: seen.add(nf); grp.append(nf); st.append(nf)
            if len(grp) < int(opt.get('min_island', 300)): small += grp
        bmesh.ops.delete(b, geom=small, context='FACES'); print('SPLIT', len(small), 'faces in small hair islands dropped')
    b.to_mesh(c.data); b.free(); c.name = name
bpy.data.objects.remove(o)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='AUTO')
print('RESULT', out)
