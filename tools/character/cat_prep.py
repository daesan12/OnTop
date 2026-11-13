"""Black cat onesie (S15P31B105-416) prep: -- <parts.glb> <out.glb>
Tripo's chibi has a big hood, so its shoulders and arms sit 8 cm under the shared body's and its arms reach 5 cm
further out. Body parts are stretched up above the crotch (z0) so the shoulder line (0.47) lands on the body's
(0.555); the sleeves and mittens are pulled in past the shoulder so the mitten tips meet the hands (0.391).
Then the collar's near-white faces turn teal, a black ring (part 40) closes the wide collar round the neck, and the
torso's leg openings get a band under the hem. Part numbers are this Tripo export's (cat_outfit_parts.glb)."""
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
Z0, K = 0.25, (0.555 - 0.25) / (0.47 - 0.25)
X0, XK, ARM_UP = 0.1, (0.391 - 0.1) / (0.445 - 0.1), 0.01
BODY = [1, 2, 7, 10, 11]          # torso, collar, tail, legs
ARMS = [5, 9, 8, 15]              # sleeves, mittens
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=a[0])
for n in BODY + ARMS:
    o = bpy.data.objects['tripo_part_%d' % n]; mw = o.matrix_world; inv = mw.inverted()
    for v in o.data.vertices:
        w = mw @ v.co
        if w.z > Z0: w.z = Z0 + (w.z - Z0) * K
        if n in ARMS:
            w.z += ARM_UP
            if abs(w.x) > X0: w.x = (1 if w.x > 0 else -1) * (X0 + (abs(w.x) - X0) * XK)
        v.co = inv @ w
    o.data.update()
    print('PREP', o.name)
# The knit collar's inside and a few smears were near white; seen under the chin as the head moved. Faces whose
# UV-centre texel is unsaturated and light (min channel > 0.35) take the collar's middle teal texel.
import numpy as np
o = bpy.data.objects['tripo_part_2']
img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
uvd = o.data.uv_layers.active.data
tex = lambda u: P[min(h_ - 1, max(0, int(u[1] * h_))), min(w_ - 1, max(0, int(u[0] * w_)))]
cen = {p.index: np.mean([tuple(uvd[l].uv) for l in p.loop_indices], 0) for p in o.data.polygons}
col = {i: tex(u) for i, u in cen.items()}
teal = [i for i, c in col.items() if c.min() <= 0.35]
lum = {i: float(col[i].mean()) for i in teal}; med = np.median(list(lum.values()))
uv_teal = cen[min(teal, key=lambda i: abs(lum[i] - med))]
light = [p for p in o.data.polygons if col[p.index].min() > 0.35]
for p in light:
    for l in p.loop_indices: uvd[l].uv = uv_teal
print('COLLAR light faces', len(light), 'of', len(o.data.polygons), 'teal', tex(uv_teal).round(2).tolist())
# The knit collar is a 10 cm ring round a 4.5 cm neck: from above (running, the game camera) one looked down past
# the neck into the hidden chest (holes). A flat ring of the onesie's black (new part 40, worn as TOP) closes the
# collar from its inside (r 0.097, z 0.612, collar centre) to round the neck (r 0.048, z 0.602, neck centre);
# y is in Tripo's frame (fit dy=0.09 moves it onto the body).
import bmesh, math
DY = 0.09
torso = bpy.data.objects['tripo_part_1']
timg = next(n.image for m in torso.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
tw, th = timg.size; TP = np.array(timg.pixels[:], np.float32).reshape(th, tw, -1)[..., :3]
tuv = torso.data.uv_layers.active.data
tcen = [np.mean([tuple(tuv[l].uv) for l in p.loop_indices], 0) for p in list(torso.data.polygons)[::50]]
tl = [float(TP[min(th - 1, int(u[1] * th)), min(tw - 1, int(u[0] * tw))].mean()) for u in tcen]
uv_black = tcen[int(np.argsort(tl)[len(tl) // 2])]
N, ROWS = 96, 4
bm = bmesh.new(); rings = []
for k in range(ROWS + 1):
    t = k / ROWS; r = 0.097 + (0.048 - 0.097) * t; z = 0.612 + (0.602 - 0.612) * t; cy = (0.0 + 0.0075 * t) - DY
    rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / N), cy + r * math.sin(2 * math.pi * i / N), z)) for i in range(N)])
for k in range(ROWS):
    for i in range(N):
        j = (i + 1) % N; bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
uvl = bm.loops.layers.uv.new('UVMap')
for f in bm.faces:
    for l in f.loops: l[uvl].uv = uv_black
me = bpy.data.meshes.new('tripo_part_40'); bm.to_mesh(me); bm.free()
me.materials.append(torso.data.materials[0])
cap = bpy.data.objects.new('tripo_part_40', me); bpy.context.scene.collection.objects.link(cap)
print('NECK cap', len(me.polygons), 'faces, black', TP[min(th - 1, int(uv_black[1] * th)), min(tw - 1, int(uv_black[0] * tw))].round(2).tolist())

# The torso's leg openings (its open rims under z 0.32) only touched the legs: a hairline of background showed
# along the V at the hips. The rims get a black band 1.5 cm down and 4 mm in towards each thigh's axis, under the hem.
bm = bmesh.new(); bm.from_mesh(torso.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
mw = torso.matrix_world; inv = mw.inverted()
rim = [e for e in bm.edges if e.is_boundary and all((mw @ v.co).z < 0.32 for v in e.verts)]
new = bmesh.ops.extrude_edge_only(bm, edges=rim)['geom']
uvl = bm.loops.layers.uv.active
for v in [g for g in new if isinstance(g, bmesh.types.BMVert)]:
    w = mw @ v.co; axis = (math.copysign(0.065, w.x), -0.083)
    dx, dy = axis[0] - w.x, axis[1] - w.y; d = math.hypot(dx, dy) or 1
    w.x += 0.004 * dx / d; w.y += 0.004 * dy / d; w.z -= 0.015; v.co = inv @ w
for f in [g for g in new if isinstance(g, bmesh.types.BMFace)]:
    for l in f.loops: l[uvl].uv = uv_black
bm.to_mesh(torso.data); bm.free(); torso.data.update()
print('HEM band', len(rim), 'rim edges')
bpy.ops.export_scene.gltf(filepath=a[1], export_format='GLB', export_image_format='JPEG', export_jpeg_quality=95,
                          export_animations=False, export_skins=False)
print('RESULT', a[1])
