"""Split one Tripo part by height: -- <parts.glb> <out.glb> part=3 z=0.56 [below=30] [above=31]
Faces whose centre lies under z become tripo_part_<below>, the rest tripo_part_<above> (the original is removed).
by_skin=1 (no z): skin-coloured faces become <below>, the rest <above> (a hat made in one part with the generated
head, its band tilted so no level cut parts them: the baker's toque, S15P31B105-367)."""
import bpy, bmesh, sys
import numpy as np
a = sys.argv[sys.argv.index('--') + 1:]
opt = dict(x.split('=') for x in a[2:])
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
src = bpy.data.objects['tripo_part_' + opt['part']]
BY_SKIN = opt.get('by_skin') == '1'
z = float(opt['z']) if not BY_SKIN else 0.0

def skin_faces(o, bm):
    """The faces whose texel at their UV centre is skin-coloured (reddish, light)."""
    img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w, h = img.size; P = np.array(img.pixels[:], np.float32).reshape(h, w, -1)[..., :3]
    uvl = bm.loops.layers.uv.active; out = set()
    for f in bm.faces:
        u = sum((l[uvl].uv.x for l in f.loops)) / len(f.loops); v = sum((l[uvl].uv.y for l in f.loops)) / len(f.loops)
        r, g, b = P[min(h - 1, max(0, int(v * h))), min(w - 1, max(0, int(u * w)))]
        if r > g > b and r - b > 0.15 and r > 0.55 and g > 0.35: out.add(f)
    return out

below, above = opt.get('below', '30'), opt.get('above', '31')
for name in (below, above):
    o = src.copy(); o.data = src.data.copy(); o.name = o.data.name = 'tripo_part_' + name
    src.users_collection[0].objects.link(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    mw = o.matrix_world
    if BY_SKIN:
        sk = skin_faces(o, bm)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if (f in sk) != (name == below)], context='FACES')
        # keep_largest=1: the other piece keeps its largest connected island only (the toque also took the eyes'
        # white rims and the neck's brown ring, both not skin-coloured)
        if name == above and opt.get('keep_largest') == '1':
            # (welded first: imported, the part is cut along its UV seams into many islands)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
            seen, islands = set(), []
            for f0 in bm.faces:
                if f0 in seen: continue
                isl, stack = [], [f0]; seen.add(f0)
                while stack:
                    f = stack.pop(); isl.append(f)
                    for e in f.edges:
                        for g in e.link_faces:
                            if g not in seen: seen.add(g); stack.append(g)
                islands.append(isl)
            islands.sort(key=len)
            bmesh.ops.delete(bm, geom=[f for isl in islands[:-1] for f in isl], context='FACES')
            print('ISLANDS', len(islands), 'kept', len(islands[-1]), 'faces')
    else:
        keep = (lambda c: c < z) if name == below else (lambda c: c >= z)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep((mw @ f.calc_center_median()).z)], context='FACES')
    # skin_above=Z: in the lower piece, skin-coloured faces over Z go too (the generated head's neck stump)
    if name == below and 'skin_above' in opt:
        za = float(opt['skin_above'])
        gone = [f for f in skin_faces(o, bm) if (mw @ f.calc_center_median()).z > za]
        bmesh.ops.delete(bm, geom=gone, context='FACES')
        print('SKIN dropped', len(gone), 'faces over z', za)
    bm.to_mesh(o.data); bm.free()
    print('SPLIT', o.name, len(o.data.polygons), 'faces')
bpy.data.objects.remove(src)
bpy.ops.export_scene.gltf(filepath=a[1], export_format='GLB', export_image_format='JPEG', export_jpeg_quality=95,
                          export_animations=False, export_skins=False)
print('RESULT', a[1])
