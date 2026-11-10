"""Masked hair + purple dopo Tripo parts prep (tools/character/dopo2_prep.py, S15P31B105-390): -- <in.glb> <out.glb>
[face_above=0.60] [ear_body=x,y,z ear_w=W s=S head_parts=0,93,14,15]
part 6 (generated lower face, ears, neck and the robe's collar) -> 91 the face skin above face_above (head_fit only),
92 the collar (white band and purple, for the top); part 7 (the mask with a strip of forehead skin on top) -> 93 the
mask alone (its dark brown top strip dropped; the red cheek dots are kept, they are not skin: green under 0.55 red)."""
import bpy, bmesh, sys, os, mathutils
import numpy as np

a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], os.path.abspath(a[1])
opt = dict(x.split('=') for x in a[2:])
FACE_ABOVE = float(opt.get('face_above', 0.60))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = lambda n: next(x for x in bpy.data.objects if x.type == 'MESH' and x.name.split('.')[0] == f'tripo_part_{n}')


def face_colours(o):
    """Per face: the mean texel of its corners, and its centre height."""
    img = next(n.image for m in o.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w_, h_ = img.size; P = np.array(img.pixels[:], np.float32).reshape(h_, w_, -1)[..., :3]
    bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.active; bm.faces.ensure_lookup_table()
    C = np.array([np.mean([P[min(h_ - 1, int(l[uvl].uv.y * h_)), min(w_ - 1, int(l[uvl].uv.x * w_))] for l in f.loops], 0)
                  for f in bm.faces])
    Z = np.array([(o.matrix_world @ f.calc_center_median()).z for f in bm.faces])
    bm.free()
    return C, Z


def smooth(o, flag, passes=3):
    """A few majority passes over neighbours: no lone faces of one kind inside the other."""
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    nb = [[x.index for e in f.edges for x in e.link_faces if x is not f] for f in bm.faces]
    bm.free()
    for _ in range(passes):
        new = flag.copy()
        for i, n in enumerate(nb):
            if n:
                k = int(flag[n].sum())
                if 2 * k > len(n): new[i] = True
                elif 2 * k < len(n): new[i] = False
        flag = new
    return flag


def skin_mask(o):
    """Per face: skin-coloured, reddish and light with green well above the red dots' (g > 0.55 r)."""
    C, _ = face_colours(o)
    r, g, b = C[:, 0], C[:, 1], C[:, 2]
    return smooth(o, (r > g) & (g > b) & (r - b > 0.15) & (r > 0.45) & (g > 0.55 * r))


def band_mask(o, top=0.795):
    """Per face: the dark brown forehead strip on the mask's top edge (the mask is white, red and black)."""
    C, Z = face_colours(o)
    r, g, b = C[:, 0], C[:, 1], C[:, 2]
    return smooth(o, (Z > top) & (C.mean(1) < 0.45) & (r - b > 0.08))
def keep(o, name, sel):
    c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
    b_ = bmesh.new(); b_.from_mesh(c.data); b_.faces.ensure_lookup_table()
    mw = c.matrix_world
    bmesh.ops.delete(b_, geom=[f for f in b_.faces if not sel(f, mw)], context='FACES')
    n = len(b_.faces); b_.to_mesh(c.data); b_.free(); c.name = c.data.name = name
    return n


o6 = obj(6); s6 = skin_mask(o6)
# the collar is the white band and the purple robe only: the generated neck's dark shading (neither skin nor collar)
# stayed as a jagged dark ring around the neck that stuck out sideways
C6, _ = face_colours(o6)
lum6, sat6 = C6.mean(1), C6.max(1) - C6.min(1)
white6 = (lum6 > 0.55) & (sat6 < 0.15)
purple6 = (C6[:, 2] > C6[:, 1] + 0.04) & (C6[:, 0] > C6[:, 1])
collar6 = smooth(o6, (white6 | purple6) & ~s6)
n91 = keep(o6, 'tripo_part_91', lambda f, mw: s6[f.index] and (mw @ f.calc_center_median()).z > FACE_ABOVE)
n92 = keep(o6, 'tripo_part_92', lambda f, mw: collar6[f.index])
bpy.data.objects.remove(o6)
o7 = obj(7)
# the mask's top strip (Tripo painted it brown, blending into the forehead) is kept and painted the mask's white:
# dropped, the mask's top edge came out uneven and the body's eyebrows showed over it (user)
C7, Z7 = face_colours(o7)
band = (Z7 > float(opt.get('band_z', 0.79))) & (C7.mean(1) < 0.6)
white_i = int(np.argmin(np.abs(C7.mean(1) - np.percentile(C7.mean(1), 98)) + 10 * (C7.max(1) - C7.min(1))))
b7 = bmesh.new(); b7.from_mesh(o7.data); b7.faces.ensure_lookup_table(); uv7 = b7.loops.layers.uv.active
white_uv = tuple(np.mean([tuple(l[uv7].uv) for l in b7.faces[white_i].loops], 0))
for f in b7.faces:
    if band[f.index]:
        for l in f.loops: l[uv7].uv = white_uv
b7.to_mesh(o7.data); b7.free()
o7.name = o7.data.name = 'tripo_part_93'; n93 = len(o7.data.polygons)
print('PREP face', n91, 'collar', n92, 'mask', n93, 'forehead band painted white', int(band.sum()))

# the mask's eye holes closed black (user): Tripo's black discs (parts 14, 15) lay behind the body's face in the game,
# so the closed eyes showed through. Loops of the mask's rim with their middle in eye_box (|x| x0..x1, z z0..z1) are
# filled and painted with the discs' black texel.
m93 = next(x for x in bpy.data.objects if x.name == 'tripo_part_93')
disc = next(x for x in bpy.data.objects if x.name.split('.')[0] == 'tripo_part_14')
db = bmesh.new(); db.from_mesh(disc.data); duv = db.loops.layers.uv.active
dark_uv = tuple(np.median(np.array([tuple(l[duv].uv) for f in db.faces for l in f.loops]), 0)); db.free()
x0, x1, z0, z1 = map(float, opt.get('eye_box', '0.02,0.13,0.67,0.75').split(','))
bm = bmesh.new(); bm.from_mesh(m93.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
uv = bm.loops.layers.uv.active; mw = m93.matrix_world
seen, eyes = set(), []
for e in [e for e in bm.edges if e.is_boundary]:
    if e in seen: continue
    stack, loop = [e], []
    while stack:
        x = stack.pop()
        if x in seen: continue
        seen.add(x); loop.append(x)
        for v in x.verts:
            for y in v.link_edges:
                if y.is_boundary and y not in seen: stack.append(y)

    pts = [mw @ v.co for x in loop for v in x.verts]
    cx = sum(p.x for p in pts) / len(pts); cz = sum(p.z for p in pts) / len(pts)
    if x0 < abs(cx) < x1 and z0 < cz < z1: eyes.append(loop)
new = []
for loop in eyes:
    new += bmesh.ops.holes_fill(bm, edges=loop, sides=len(loop) + 1)['faces']
for f in new:
    for l in f.loops: l[uv].uv = dark_uv
# the holes' rims are ragged (user: the eyes' lines look dirty), so each eye also gets a smooth black ellipse over
# the hole, 6 % wider than its rim, laid on the mask (rays from the front, 0.6 mm out): tripo_part_94
from mathutils.bvhtree import BVHTree
bm.normal_update()
_bw = bm.copy(); _bw.transform(mw); tree = BVHTree.FromBMesh(_bw); _bw.free()   # (world coordinates, as the rays)
dverts, dfaces = [], []
for loop in eyes:
    P = np.array([tuple(mw @ v.co) for x in loop for v in x.verts])
    cx, cz = (P[:, 0].min() + P[:, 0].max()) / 2, (P[:, 2].min() + P[:, 2].max()) / 2
    ax_, az_ = (P[:, 0].max() - P[:, 0].min()) / 2 * 1.06, (P[:, 2].max() - P[:, 2].min()) / 2 * 1.06
    ring, seg = 6, 40
    base = len(dverts)
    for r in range(ring + 1):
        for s in range(seg if r else 1):
            t = 2 * np.pi * s / seg; k = r / ring
            x, z = cx + ax_ * k * np.cos(t), cz + az_ * k * np.sin(t)
            hit = tree.ray_cast(mathutils.Vector((x, -1.0, z)), mathutils.Vector((0, 1, 0)))
            y = (hit[0].y if hit[0] is not None else float(np.median(P[:, 1]))) - 0.0006
            dverts.append((x, y, z))
    idx = lambda r, s: base if r == 0 else base + 1 + (r - 1) * seg + s % seg
    for s in range(seg):
        dfaces.append((idx(0, 0), idx(1, s + 1), idx(1, s)))
        for r in range(1, ring):
            dfaces.append((idx(r, s), idx(r, s + 1), idx(r + 1, s + 1), idx(r + 1, s)))
# the forehead: Tripo's mask has gaps between its top strip and its middle (the bangs lay there) and dark streaks on
# its top edge, so the body's brows showed. A white patch on the mask's front from forehead_z up to its top, row by
# row as wide as the mask there; gaps take the depth of their row's neighbours: added to the ellipses' mesh below.
fz0 = float(opt.get('forehead_z', 0.775))
Pm = np.array([tuple(mw @ v.co) for v in bm.verts]); ztop = float(Pm[:, 2].max()) - 0.002
rows_, cols_ = 28, 96
grid = []
for r in range(rows_ + 1):
    z = fz0 + (ztop - fz0) * r / rows_
    band_ = Pm[np.abs(Pm[:, 2] - z) < 0.006]
    xa, xb = (band_[:, 0].min() + 0.004, band_[:, 0].max() - 0.004) if len(band_) else (-0.05, 0.05)
    row = []
    for c in range(cols_ + 1):
        x = xa + (xb - xa) * c / cols_
        hit = tree.ray_cast(mathutils.Vector((x, -1.0, z)), mathutils.Vector((0, 1, 0)))
        row.append([x, hit[0].y if hit[0] is not None else None, z])
    known = [i for i, p in enumerate(row) if p[1] is not None]
    for i, p in enumerate(row):
        if p[1] is None and known:
            lo_ = max([k for k in known if k < i], default=None); hi_ = min([k for k in known if k > i], default=None)
            if lo_ is None: p[1] = row[hi_][1]
            elif hi_ is None: p[1] = row[lo_][1]
            else: p[1] = row[lo_][1] + (row[hi_][1] - row[lo_][1]) * (i - lo_) / (hi_ - lo_)
        if p[1] is None: p[1] = float(np.median(Pm[:, 1]))
        p[1] -= float(opt.get('forehead_gap', 0.0015))
    grid.append(row)
base = len(dverts); fpatch = []
for row in grid: dverts += [tuple(p) for p in row]
for r in range(rows_):
    for c in range(cols_):
        a_ = base + r * (cols_ + 1) + c
        fpatch.append((a_, a_ + 1, a_ + cols_ + 2, a_ + cols_ + 1))
bm.to_mesh(m93.data); bm.free()
dm = bpy.data.meshes.new('tripo_part_94'); dm.from_pydata(dverts, [], dfaces + fpatch); dm.update()
dm.materials.append(m93.data.materials[0])
dl = dm.uv_layers.new(name=m93.data.uv_layers.active.name)
for p in dm.polygons:
    for li in p.loop_indices: dl.data[li].uv = dark_uv if p.index < len(dfaces) else white_uv
for p in dm.polygons:
    p.use_smooth = True
dobj = bpy.data.objects.new('tripo_part_94', dm); bpy.context.scene.collection.objects.link(dobj)
# facing the front (-y): the ellipses and the patch each flipped if built the other way round
dm.update()
bd = bmesh.new(); bd.from_mesh(dm); bd.faces.ensure_lookup_table(); bd.normal_update()
for part_ in ([f for f in bd.faces if f.index < len(dfaces)], [f for f in bd.faces if f.index >= len(dfaces)]):
    if part_ and np.mean([f.normal.y for f in part_]) > 0: bmesh.ops.reverse_faces(bd, faces=part_)
bd.to_mesh(dm); bd.free()
print('EYES filled', len(eyes), 'holes with', len(new), 'faces, ellipses', len(dfaces), 'faces, dark uv', [round(x, 4) for x in dark_uv])

# head by the ears (in place of fit_outfit's head_fit): the generated face under the mask is only ears and a chin, and
# head_fit's ICP turned the head over (hair on the shoulders). Here the head parts are only scaled and moved, so that
# after fit_outfit's s their ears meet the body's: ear_body = the body's ear midpoint, ear_w = its ear to ear width
# (from the build's body pieces in the rest pose: 0,0.038,0.7115 and 0.378 for shared_layers_r).
if opt.get('ear_body'):

    S = float(opt.get('s', 1.0)); Cb = mathutils.Vector([float(x) for x in opt['ear_body'].split(',')]); Wb = float(opt['ear_w'])
    f91 = next(x for x in bpy.data.objects if x.name == 'tripo_part_91')
    G = np.array([tuple(f91.matrix_world @ v.co) for v in f91.data.vertices])
    ears = []
    for side in (1, -1):
        xs = G[:, 0] * side; ears.append(G[xs > xs.max() - 0.012].mean(0))
    Cg = mathutils.Vector(((ears[0] + ears[1]) / 2).tolist()); Wg = float(ears[0][0] - ears[1][0])
    k = Wb / (S * Wg)
    for n in opt.get('head_parts', '0,93,14,15').split(','):
        o = next(x for x in bpy.data.objects if x.name.split('.')[0] == f'tripo_part_{n}')
        mw = o.matrix_world.copy(); inv = mw.inverted()
        for v in o.data.vertices:
            p = mw @ v.co; v.co = inv @ (Cb / S + (p - Cg) * k)
        o.data.update()
    print('HEAD by ears: generated', [round(x, 3) for x in Cg], 'width', round(Wg, 3), '-> scale', round(k, 3))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB')
