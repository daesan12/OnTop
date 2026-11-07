"""Split one Tripo part by height: -- <parts.glb> <out.glb> part=3 z=0.56 [below=30] [above=31]
Faces whose centre lies under z become tripo_part_<below>, the rest tripo_part_<above> (the original is removed)."""
import bpy, bmesh, sys
a = sys.argv[sys.argv.index('--') + 1:]
opt = dict(x.split('=') for x in a[2:])
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
src = bpy.data.objects['tripo_part_' + opt['part']]; z = float(opt['z'])
for name, keep in ((opt.get('below', '30'), lambda c: c < z), (opt.get('above', '31'), lambda c: c >= z)):
    o = src.copy(); o.data = src.data.copy(); o.name = o.data.name = 'tripo_part_' + name
    src.users_collection[0].objects.link(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    mw = o.matrix_world
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep((mw @ f.calc_center_median()).z)], context='FACES')
    # skin_above=Z: in the lower piece, skin-coloured faces over Z go too (the generated head's neck stump)
    if name == opt.get('below', '30') and 'skin_above' in opt:
        import numpy as np
        img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
        w, h = img.size; P = np.array(img.pixels[:], np.float32).reshape(h, w, -1)[..., :3]
        uvl = bm.loops.layers.uv.active; za = float(opt['skin_above']); gone = []
        for f in bm.faces:
            if (mw @ f.calc_center_median()).z <= za: continue
            u = sum((l[uvl].uv.x for l in f.loops)) / len(f.loops); v = sum((l[uvl].uv.y for l in f.loops)) / len(f.loops)
            r, g, b = P[min(h - 1, max(0, int(v * h))), min(w - 1, max(0, int(u * w)))]
            if r > g > b and r - b > 0.15 and r > 0.55 and g > 0.35: gone.append(f)
        bmesh.ops.delete(bm, geom=gone, context='FACES')
        print('SKIN dropped', len(gone), 'faces over z', za)
    bm.to_mesh(o.data); bm.free()
    print('SPLIT', o.name, len(o.data.polygons), 'faces')
bpy.data.objects.remove(src)
bpy.ops.export_scene.gltf(filepath=a[1], export_format='GLB', export_image_format='JPEG', export_jpeg_quality=95,
                          export_animations=False, export_skins=False)
print('RESULT', a[1])
