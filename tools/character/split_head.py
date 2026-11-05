"""Split a Tripo head part (hair and face skin came out as one part) by texel colour:
-- <parts.glb> <out.glb> part=1 [hair=90] [face=91] [dark=0.5] [smooth=4] [min_island=300] [cut=x,y,z] [brows=zlo,zhi,xmax] [under=zlo,zhi,xmax,dist] [face_above=z]
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
drop = np.zeros(len(hair), bool)   # faces cut or dropped go to neither part (in the face they moved the fit 1.6 cm)
# cut=x,y,z: hair faces with |x| < x, y < y and z < z are not hair (the shirt collar's dark inside, when Tripo gave the
# hair, the shirt and the skin as one part)
if opt.get('cut'):
    cx, cy, cz = (float(v) for v in opt['cut'].split(','))
    mw = o.matrix_world
    for i, p in enumerate(o.data.polygons):
        c = mw @ p.center
        if abs(c.x) < cx and c.y < cy and c.z < cz: hair[i] = False; drop[i] = True
# brows=zlo,zhi,xmax: the model's own eyebrows are painted on the same surface as the forehead and came out as hair,
# over the body's own brows. In that band, a front hair face with nothing behind it within 2 cm (looking into the head)
# lies on the skull: a brow, dropped. The fringe hangs a few millimetres before the forehead, so it has.
if opt.get('brows'):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    zlo, zhi, xm = (float(v) for v in opt['brows'].split(','))
    dg = bpy.context.evaluated_depsgraph_get(); allb = bmesh.new()
    for x in bpy.data.objects:
        if x.type == 'MESH':
            t = bmesh.new(); t.from_mesh(x.data); t.transform(x.matrix_world)
            tmp = bpy.data.meshes.new('t'); t.to_mesh(tmp); t.free(); allb.from_mesh(tmp); bpy.data.meshes.remove(tmp)
    tree = BVHTree.FromBMesh(allb); allb.free()
    mw = o.matrix_world; nbrow = 0
    for i, p in enumerate(o.data.polygons):
        if not hair[i]: continue
        c = mw @ p.center; n = (mw.to_3x3() @ p.normal).normalized()
        if not (zlo < c.z < zhi and abs(c.x) < xm and n.y < -0.3): continue
        if tree.ray_cast(c + Vector((0, 0.0005, 0)), Vector((0, 1, 0)), 0.02)[0] is None: hair[i] = False; drop[i] = True; nbrow += 1
    print('SPLIT', nbrow, 'brow faces dropped')
# under=zlo,zhi,xmax,dist: under a solid fringe, the dark faces lying on the face itself (the model's eyelid lines, the
# scalp's edge) hung below the fringe tips as a black smudge (user). They lie within dist of the face's skin; the fringe
# hangs a centimetre or more before it. (A fixed depth also nicked the fringe's ends, where the forehead curves back.)
if opt.get('under'):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    zlo, zhi, xm, dmax = (float(v) for v in opt['under'].split(','))
    mw = o.matrix_world
    sk = bmesh.new(); sk.from_mesh(o.data); sk.transform(mw); sk.faces.ensure_lookup_table()
    bmesh.ops.delete(sk, geom=[f for f in sk.faces if hair[f.index]], context='FACES')
    skin = BVHTree.FromBMesh(sk); sk.free(); nu = 0
    for i, p in enumerate(o.data.polygons):
        c = mw @ p.center
        if hair[i] and zlo < c.z < zhi and abs(c.x) < xm and c.y < -0.08:
            hit = skin.find_nearest(c)
            if hit[0] is not None and hit[3] < dmax: hair[i] = False; drop[i] = True; nu += 1
    print('SPLIT', nu, 'faces under the fringe dropped')
print('SPLIT', PART, int(hair.sum()), 'hair faces,', int((~hair).sum()), 'skin faces')
for name, keep in ((HAIR, True), (FACE, False)):
    c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
    b = bmesh.new(); b.from_mesh(c.data); b.faces.ensure_lookup_table()
    bmesh.ops.delete(b, geom=[f for f in b.faces if hair[f.index] != keep or drop[f.index]], context='FACES')
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
    elif opt.get('face_above'):   # (the face for head_fit: the skin above the chin; with the neck in it the fit went 19 cm off)
        z0 = float(opt['face_above']); mw = c.matrix_world
        bmesh.ops.delete(b, geom=[f for f in b.faces if (mw @ f.calc_center_median()).z < z0], context='FACES')
    b.to_mesh(c.data); b.free(); c.name = name
bpy.data.objects.remove(o)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='AUTO')
print('RESULT', out)
