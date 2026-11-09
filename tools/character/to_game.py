"""One default character from the layered build, in the game's runtime form (before compression).

Usage: blender -b --python to_game.py -- <layers.glb> <out_raw.glb> <variant man|girl|outfit name> HAIR=b TOP=d BOTTOM=d SHOES=d
       [tex=TOP:pink.jpg,SHOES:pink.jpg] [near=32000] [far=6000] [pieces=1 body=0 keep_edges=.. fill=1 atlas=2048]
The game (frontend/src/world/art/CharacterRig.ts) takes one skinned surface at two detail levels, near-body and
far-body, on 49 named joints with identity rest rotations (Y up, +Z forward), arms hanging 20.5 degrees out
from the body, 1.7 m tall, one material with one colour texture, under a CharacterRig root whose extras carry
the heights. Here:
- the worn items and the body pieces they leave showing (as the viewer shows them) are joined and welded;
- the arms are posed down to the game's rest (game_pose.py, from the T-pose with nothing playing) and the
  surface taken in that pose (it becomes the bind pose);
- it is scaled to 1.7 m (the bald body's height; hair stands over it);
- the 65 Mixamo joints' weights are summed onto the 49 (finger tips, toes and Spine1 into their parents),
  four per vertex, stored as normalised bytes summing to 255;
- near: decimated to `near` triangles, unwrapped afresh and baked from the items' own textures into one
  2048 image (a colour variant, tex=, is swapped in first); far: the near surface decimated to `far` triangles,
  keeping the atlas;
- normals are smoothed across the welded surface.
The output keeps plain float buffers and a PNG; prepare-characters.mjs compresses it (Meshopt, WebP).

Wardrobe options (docs/character-outfits.md):
- pieces=1: every body piece and every piece of the picked items is kept, triangles grouped by piece, and each mesh
  lists them in extras.pieces ([name, first index, index count]); the game draws only the worn ones. Piece
  boundaries are held while decimating. body=0 leaves the body out (an outfit file: its items only).
- keep_edges=1 (default) also holds flat-colour boundaries, UV seams and the head above head_frac (keep_head=0
  turns that off); keep_edges=pieces holds piece boundaries only (man, girl: holding everything crushed the face);
  keep_edges=0 holds nothing. keep_factor is the decimation cost factor of held vertices (1000). hold_flat=1 also holds
  every vertex whose faces all lie on one texel (made pieces in one flat colour: the techwear's gloves).
- fill=1: atlas texels the bake left empty (sub-texel islands, gaps) take their face's source colour, then their
  neighbours' (otherwise black flecks). atlas=2048 is the atlas size. unwrap=split (default) cuts the items' own
  UV seams before the fresh unwrap, so a thin piece never shares an island with what is behind it.
"""
import bpy, bmesh, sys, re, json, math, struct, os
import numpy as np
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
src, out, variant = a[0], a[1], a[2]
pick = dict(x.split('=') for x in a[3:] if '=' in x and x.split('=')[0] in ('HAIR', 'FACE', 'TOP', 'BOTTOM', 'SHOES'))
opt = dict(x.split('=', 1) for x in a[3:] if '=' in x and x.split('=')[0] not in pick)
tex = dict(t.split(':') for t in opt['tex'].split(',')) if opt.get('tex') else {}
NEAR, FAR = int(opt.get('near', 32000)), int(opt.get('far', 6000))
HEIGHT = 1.7

bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
parse = lambda s: re.findall(r'([A-Z]+)([a-z0-9]+)', s or '')
worn = lambda s, n: pick.get(s) == n
PIECES = opt.get('pieces', '0') == '1'

# 1. what this outfit shows (the viewer's rules)
keep = []
for o in list(bpy.data.objects):
    if o.type != 'MESH': continue
    n = re.sub(r'\.\d+$', '', o.name)
    m = re.match(r'item__([A-Z]+)__([a-z0-9]+)(?:__for_(?:man|girl))?(?:__under_(\w+?))?(?:_\d+)?$', n)
    b = re.match(r'body(?:__(\w+))?$', re.sub(r'_\d+$', '', n))
    fv = re.search(r'__for_(man|girl)', n)
    show = (m and worn(m.group(1), m.group(2)) and not any(worn(s, i) for s, i in parse(m.group(3)))
            and not (fv and variant in ('man', 'girl') and fv.group(1) != variant)) or \
           (b and not any(worn(s, i) for s, i in parse(b.group(1))))
    if PIECES:
        # pieces=1 (마이룸 slots): every body piece (body=0 drops them: an outfit file) and every piece of the picked
        # items, under-rules included. The game shows or hides each piece by what the avatar wears.
        show = (m and worn(m.group(1), m.group(2))) or (b and opt.get('body', '1') == '1')
        o['piece'] = re.sub(r'_\d+$', '', n)
    if show: keep.append(o); o['slot'] = m.group(1) if m else 'BODY'
    else: bpy.data.objects.remove(o)
print('KEEP', len(keep), sorted({o['slot'] for o in keep}))
# a colour variant: its image on copies of those items' materials
for o in keep:
    if o['slot'] in tex:
        im = bpy.data.images.load(os.path.abspath(tex[o['slot']]))
        for i, m in enumerate(o.data.materials):
            m2 = m.copy(); o.data.materials[i] = m2
            for nd in m2.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.image: nd.image = im

# 2. arms down (game_pose.py): the surface in the game's rest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from game_pose import bind_pose
bind_pose(arm)
joints_world = {b.name: (arm.matrix_world @ b.head).copy() for b in arm.pose.bones}
# the surface in that pose becomes the rest
dg = bpy.context.evaluated_depsgraph_get()
for o in keep:
    ev = o.evaluated_get(dg); me = ev.to_mesh()
    P = [o.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
    for m in list(o.modifiers): o.modifiers.remove(m)
    o.parent = None; o.matrix_world = Matrix()
    for v, p in zip(o.data.vertices, P): v.co = p
    if o.data.uv_layers: o.data.uv_layers.active.name = 'UVMap'
# 3. one surface, welded (the import split it along UV seams; decimated split, it would open)
PIECE_NAMES = sorted({o['piece'] for o in keep}) if PIECES else ['all']
for o in keep:
    at = o.data.attributes.new('piece', 'INT', 'FACE')
    at.data.foreach_set('value', [PIECE_NAMES.index(o['piece']) if PIECES else 0] * len(o.data.polygons))
for x in bpy.data.objects: x.select_set(x in keep)
bpy.context.view_layer.objects.active = keep[0]; bpy.ops.object.join()
body = bpy.context.view_layer.objects.active; body.name = 'surface'
bm = bmesh.new(); bm.from_mesh(body.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(body.data); bm.free()
# scale: the bald body's height (the same for every variant) to 1.7 m, feet on the ground
z_top = 0.98; s = HEIGHT / z_top
body.data.transform(Matrix.Scale(s, 4)); joints_world = {k: v * s for k, v in joints_world.items()}
print('SURFACE', len(body.data.vertices), 'verts', len(body.data.polygons), 'faces, scale', round(s, 4))

# 4. the 49 joints: Mixamo name -> runtime name
JOINT = {'Hips': 'hips', 'Spine': 'spine', 'Spine1': 'spine', 'Spine2': 'chest', 'Neck': 'neck', 'Head': 'head', 'HeadTop_End': 'head'}
for side, S in (('Left', 'L'), ('Right', 'R')):
    JOINT.update({f'{side}Shoulder': f'clavicle_{S}', f'{side}Arm': f'upperArm_{S}', f'{side}ForeArm': f'lowerArm_{S}', f'{side}Hand': f'hand_{S}',
                  f'{side}UpLeg': f'upperLeg_{S}', f'{side}Leg': f'lowerLeg_{S}', f'{side}Foot': f'foot_{S}', f'{side}ToeBase': f'foot_{S}', f'{side}Toe_End': f'foot_{S}'})
    for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'):
        for k in (1, 2, 3, 4): JOINT[f'{side}Hand{f}{k}'] = f'{f.lower()}{min(k, 3)}_{S}'
BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'clavicle_L', 'clavicle_R', 'upperArm_L', 'lowerArm_L', 'hand_L', 'upperArm_R', 'lowerArm_R', 'hand_R',
         'upperLeg_L', 'lowerLeg_L', 'foot_L', 'upperLeg_R', 'lowerLeg_R', 'foot_R'] + \
        [f'{f}{k}_{S}' for S in ('L', 'R') for f in ('thumb', 'index', 'middle', 'ring', 'pinky') for k in (1, 2, 3)]
PARENT = {'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck'}
for S in ('L', 'R'):
    PARENT.update({f'clavicle_{S}': 'chest', f'upperArm_{S}': f'clavicle_{S}', f'lowerArm_{S}': f'upperArm_{S}', f'hand_{S}': f'lowerArm_{S}',
                   f'upperLeg_{S}': 'hips', f'lowerLeg_{S}': f'upperLeg_{S}', f'foot_{S}': f'lowerLeg_{S}'})
    for f in ('thumb', 'index', 'middle', 'ring', 'pinky'):
        PARENT[f'{f}1_{S}'] = f'hand_{S}'; PARENT[f'{f}2_{S}'] = f'{f}1_{S}'; PARENT[f'{f}3_{S}'] = f'{f}2_{S}'
# a merged joint sits where its first Mixamo joint does (Spine, not Spine1; Head, not its top)
jpos = {}
for mx, rt in JOINT.items():
    if mx in ('Spine1', 'HeadTop_End') or mx.endswith('4') or 'Toe' in mx: continue
    jpos[rt] = joints_world['mixamorig:' + mx]
group_to_joint = {g.index: BONES.index(JOINT[g.name[len('mixamorig:'):]]) for g in body.vertex_groups if g.name.startswith('mixamorig:') and g.name[len('mixamorig:'):] in JOINT}

# 5. near: decimated, a fresh unwrap, one baked image
def decimate(o, faces, keep_edges=False):
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris <= faces: return
    md = o.modifiers.new('dec', 'DECIMATE'); md.ratio = faces / tris; md.use_collapse_triangulate = True
    if keep_edges:
        full = keep_edges == '1'   # keep_edges=pieces (man, girl): only piece boundaries are held
        hold = set()
        uvl = o.data.uv_layers.active.data
        if full:
            # Faces painted one flat colour (all corners on one texel: the general's rings, patches, sleeves) meet
            # other colours along straight cuts; collapsing those edges made the rings jagged (user). Their boundary
            # vertices are held (weight 0 in the decimation group), everything else decimates as before.
            key = {}
            for p in o.data.polygons:
                us = {(round(uvl[li].uv[0], 5), round(uvl[li].uv[1], 5)) for li in p.loop_indices}
                k = next(iter(us)) if len(us) == 1 else None
                for vi in p.vertices: key.setdefault(vi, set()).add(k)
            hold = {vi for vi, ks in key.items() if len(ks) > 1 and any(k is not None for k in ks)}
            # UV seams too: a vertex whose corners lie at different texture positions (an island edge). Collapsed
            # across a seam, the merged corner's UV lands between islands, on the texture's black background: black
            # specks on the armour.
            cuv = {}
            for p in o.data.polygons:
                for li in p.loop_indices:
                    vi = o.data.loops[li].vertex_index
                    cuv.setdefault(vi, set()).add((round(uvl[li].uv[0], 4), round(uvl[li].uv[1], 4)))
            seams = {vi for vi, us in cuv.items() if len(us) > 1}
            print('DECIMATE seams', len(seams), 'of', len(o.data.vertices))
            hold |= seams
            # open edges too (hems, cuffs): collapsed, the gat's trouser hem went into a zigzag with strands under it
            ec = {}
            for p in o.data.polygons:
                for ek in p.edge_keys: ec[ek] = ec.get(ek, 0) + 1
            rim = {vi for ek, n in ec.items() if n == 1 for vi in ek}
            print('DECIMATE open-edge vertices', len(rim))
            hold |= rim
        # hold_flat=1 (the techwear's gloves, made from the body on one texel): every vertex whose faces all lie on one
        # texel is held. Nothing in a flat colour marks its shape: the gloves collapsed to a box and the hand showed
        # through them (S15P31B105-365)
        if opt.get('hold_flat') == '1':
            flat = {}
            for p in o.data.polygons:
                one = len({(round(uvl[li].uv[0], 5), round(uvl[li].uv[1], 5)) for li in p.loop_indices}) == 1
                for vi in p.vertices: flat[vi] = flat.get(vi, True) and one
            print('DECIMATE flat-colour vertices', sum(flat.values()))
            hold |= {vi for vi, f in flat.items() if f}
        if PIECES:
            # piece boundaries: the game hides pieces one by one; collapsed across a boundary, a shown piece's
            # edge would move and open a crack against its hidden neighbour's replacement
            pa = o.data.attributes['piece'].data; pv = {}
            for p in o.data.polygons:
                for vi in p.vertices: pv.setdefault(vi, set()).add(pa[p.index].value)
            edge = {vi for vi, ps in pv.items() if len(ps) > 1}
            print('DECIMATE piece boundaries', len(edge))
            hold |= edge
        # the head (helmet flames, glasses, face): thin pieces close over the black cap; collapsed, the cap showed
        # through the flames as black blotches. Everything above the neck joint keeps its full detail.
        if full and opt.get('keep_head', '1') == '1':
            mw = o.matrix_world
            zs = [(mw @ v.co).z for v in o.data.vertices]
            # (the mesh is already at game scale here, the armature not): above head_frac of the full height
            hz = max(zs) * float(opt.get('head_frac', 0.55))
            head = {v.index for v, z in zip(o.data.vertices, zs) if z > hz}
            print('DECIMATE head', len(head), 'vertices above z', round(hz, 3), 'mesh z', round(min(zs), 3), round(max(zs), 3))
            hold |= head
        g = o.vertex_groups.new(name='dec_keep')
        g.add([v.index for v in o.data.vertices if v.index not in hold], 1.0, 'REPLACE')
        g.add(sorted(hold), 0.0, 'REPLACE')
        md.vertex_group = 'dec_keep'; md.vertex_group_factor = float(opt.get('keep_factor', 1000))   # a cost factor, not a hard lock
        print('DECIMATE holding', len(hold), 'vertices')
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='dec')
# bake=project (the general, light build): the undecimated surface is kept and the atlas is baked from it by ray,
# not through the decimated corners' interpolated UVs. A decimated triangle spanning two islands of the item
# textures interpolated across the black background between them: black slivers all over the armour (user).
hi = None
if opt.get('bake') == 'project':
    hi = body.copy(); hi.data = body.data.copy(); bpy.context.scene.collection.objects.link(hi)
decimate(body, NEAR, keep_edges=opt.get('keep_edges', '1') if opt.get('keep_edges', '1') != '0' else False)
atlas_uv = body.data.uv_layers.new(name='atlas'); body.data.uv_layers.active = atlas_uv
for x in bpy.data.objects: x.select_set(x is body)
bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
if opt.get('unwrap', 'split') == 'split':
    # unwrap=split (the general): smart_project groups faces by facing, and connected faces in one group share an
    # island; across the welded items a helmet flame and the dome behind it were connected, fell on one island and
    # overlapped (3058 faces), so the bake painted the cap's black over the flames. The items' own UV seams are cut
    # first, so each piece gets its own islands.
    bpy.ops.object.mode_set(mode='OBJECT')
    bm = bmesh.new(); bm.from_mesh(body.data); uvs = bm.loops.layers.uv['UVMap']
    cut = []
    for e in bm.edges:
        if len(e.link_loops) != 2: continue
        l1, l2 = e.link_loops
        a1, b1 = l1[uvs].uv, l1.link_loop_next[uvs].uv
        a2, b2 = l2.link_loop_next[uvs].uv, l2[uvs].uv
        if (a1 - a2).length > 1e-5 or (b1 - b2).length > 1e-5: cut.append(e)
    bmesh.ops.split_edges(bm, edges=cut); bm.to_mesh(body.data); bm.free()
    print('UNWRAP split', len(cut), 'seam edges')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.5, island_margin=0.003, area_weight=0.0, scale_to_bounds=True)
else:
    bpy.ops.uv.smart_project(angle_limit=1.5, island_margin=0.003, area_weight=0.0, scale_to_bounds=True)   # large islands: few seams to split vertices along
if opt.get('repack', '0') == '1':
    # the undecimated general has thousands of small islands; repacked tighter (and rotated), each gets more texels,
    # so thin pieces (the helmet's flames) are not blurred into the black background
    bpy.ops.uv.pack_islands(rotate=True, margin=float(opt.get('pack_margin', 0.0008)))
bpy.ops.object.mode_set(mode='OBJECT')
SIZE = int(opt.get('atlas', 2048)); img = bpy.data.images.new('atlas', SIZE, SIZE, alpha=True)
img.generated_color = (0, 0, 0, 0)   # (texels the bake leaves empty stay transparent: fill=1 finds them)   # (the general: 4096; at 2048 its thin flames' islands fell between texels)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
sc.render.bake.margin = int(opt.get('bake_margin', 8)); sc.render.bake.margin_type = 'EXTEND'
sc.render.bake.use_clear = False   # (keeps the empty texels transparent for fill=1)
setups = []
for m in body.data.materials:
    nt = m.node_tree; srcn = next(n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image)
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'; nt.links.new(uvn.outputs['UV'], srcn.inputs['Vector'])
    tg = nt.nodes.new('ShaderNodeTexImage'); tg.image = img; nt.nodes.active = tg
    em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(srcn.outputs['Color'], em.inputs['Color'])
    outn = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'); nt.links.new(em.outputs['Emission'], outn.inputs['Surface'])
if hi:
    for x in bpy.data.objects: x.select_set(x in (hi, body))
    bpy.context.view_layer.objects.active = body
    # (game scale, mm: the decimated surface lies within a few mm of the original)
    bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=float(opt.get('extrude', 0.004)),
                        max_ray_distance=float(opt.get('ray', 0.02)))
    bpy.data.objects.remove(hi)
else:
    bpy.ops.object.bake(type='EMIT')
if opt.get('fill', '0') == '1':
    # fill=1 (the general): its item textures split into thousands of islands, some smaller than a texel. The bake
    # writes no texel for those, so their faces sampled the black background, and the black gaps between islands
    # darkened the mipmaps: black flecks on the face and armour (user). Each empty texel under a face takes that
    # face's own colour (its source texture at its source UV centre), then every remaining gap takes its
    # neighbours' colour.
    A = np.array(img.pixels[:], np.float32).reshape(SIZE, SIZE, 4)
    print('FILL empty texels', int((A[..., 3] == 0).sum()), 'of', SIZE * SIZE)
    srcs = {}
    for mi, m in enumerate(body.data.materials):
        im = next(n for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and n.image is not img).image
        srcs[mi] = np.array(im.pixels[:], np.float32).reshape(im.size[1], im.size[0], im.channels)
    me = body.data; auv = me.uv_layers['atlas'].data; suv = me.uv_layers['UVMap'].data; painted = 0
    for p in me.polygons:
        la = np.array([auv[l].uv[:] for l in p.loop_indices]); ls = np.array([suv[l].uv[:] for l in p.loop_indices])
        S = srcs[p.material_index]; sh, sw_ = S.shape[:2]
        for w in [la.mean(0)] + list(la):
            tx, ty = min(int(w[0] * SIZE), SIZE - 1), min(int(w[1] * SIZE), SIZE - 1)
            if A[ty, tx, 3] > 0: continue
            cu = ls.mean(0); col = S[int(cu[1] % 1 * sh) % sh, int(cu[0] % 1 * sw_) % sw_, :3]
            A[ty, tx, :3] = col; A[ty, tx, 3] = 1; painted += 1
    print('FILL painted', painted, 'texels of sub-texel faces')
    for k in range(int(opt.get('fill_steps', 64))):
        f = A[..., 3] > 0
        if f.all(): break
        acc = np.zeros((SIZE, SIZE, 3), np.float32); cnt = np.zeros((SIZE, SIZE), np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(A[..., :3] * f[..., None], (dy, dx), (0, 1)); cnt += np.roll(f, (dy, dx), (0, 1))
        g = ~f & (cnt > 0)
        A[g, :3] = acc[g] / cnt[g, None]; A[g, 3] = 1
    print('FILL left empty', int((A[..., 3] == 0).sum()))
    A[..., 3] = 1; img.pixels[:] = A.ravel()
img.filepath_raw = os.path.splitext(os.path.abspath(out))[0] + '_atlas.png'; img.file_format = 'PNG'; img.save()
body.data.uv_layers.remove(body.data.uv_layers['UVMap'])

# 6. far: the near surface decimated (the atlas UVs go with it)
far = body.copy(); far.data = body.data.copy(); bpy.context.scene.collection.objects.link(far)
decimate(far, FAR)   # (holding seams kept the far mesh at 15k triangles; it shows past 14 m only)

# 7. buffers: per corner (position, uv) welded into vertices; normals smoothed by position; 49 weights, four kept
def surface_arrays(o):
    me = o.data; me.calc_loop_triangles()
    P = np.array([tuple(v.co) for v in me.vertices], np.float64)
    # vertex normals by area-weighted faces over coincident positions (one smooth surface)
    fn = np.zeros_like(P)
    for poly in me.polygons:
        for vi in poly.vertices: fn[vi] += np.array(poly.normal) * poly.area
    key = {}
    for i, p in enumerate(P): key.setdefault((round(p[0], 5), round(p[1], 5), round(p[2], 5)), []).append(i)
    N = np.zeros_like(P)
    for ids in key.values(): N[ids] = fn[ids].sum(0)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    W = np.zeros((len(P), len(BONES)))
    for v in me.vertices:
        for g in v.groups:
            if g.group in group_to_joint: W[v.index, group_to_joint[g.group]] += g.weight
    top = np.argsort(-W, 1)[:, :4]; Wt = np.take_along_axis(W, top, 1); Wt /= np.maximum(Wt.sum(1, keepdims=True), 1e-9)
    Wb = np.floor(Wt * 255 + 0.5).astype(np.int32); Wb[:, 0] += 255 - Wb.sum(1)              # bytes summing to 255
    Wt = Wb.astype(np.uint8)
    uv = me.uv_layers['atlas'].data
    verts, index, remap = [], [], {}
    pa = me.attributes['piece'].data
    tris = sorted(me.loop_triangles, key=lambda t: pa[t.polygon_index].value)
    ranges = []
    for t in tris:
        pc = PIECE_NAMES[pa[t.polygon_index].value]
        if not ranges or ranges[-1][0] != pc: ranges.append([pc, len(index), 0])
        ranges[-1][2] += 3
        for li, vi in zip(t.loops, t.vertices):
            u = uv[li].uv; k = (vi, round(u.x, 6), round(u.y, 6))
            if k not in remap: remap[k] = len(verts); verts.append((vi, u.x, u.y))
            index.append(remap[k])
    vi = np.array([v[0] for v in verts]); UV = np.array([(v[1], 1 - v[2]) for v in verts], np.float32)
    # Blender (x, y, z) -> glTF (x, z, -y)
    conv = lambda A: np.stack([A[:, 0], A[:, 2], -A[:, 1]], 1).astype(np.float32)
    return dict(pos=conv(P[vi]), nrm=conv(N[vi]), uv=UV, joints=top[vi].astype(np.uint8), weights=Wt[vi],
                index=np.array(index, np.uint32 if len(verts) > 65535 else np.uint16), tris=len(index) // 3, verts=len(verts), pieces=ranges)
near_a, far_a = surface_arrays(body), surface_arrays(far)
print('NEAR', near_a['tris'], 'tris', near_a['verts'], 'verts; FAR', far_a['tris'], far_a['verts'])

# 8. the glTF
gl = lambda v: [float(v.x), float(v.z), float(-v.y)]
J = {k: gl(v) for k, v in jpos.items()}
# the hip joint on the vertical axis through the origin (the game turns the figure about it: 1 cm off, the
# pelvis drifted when swimming and on the machines)
ox, oz = J['hips'][0], J['hips'][2]
J = {k: [p[0] - ox, p[1], p[2] - oz] for k, p in J.items()}
for A in (near_a, far_a): A['pos'] -= np.array([ox, 0, oz], np.float32)
blob, views, accessors = bytearray(), [], []
def add(arr, target=None, typ=None, ctype=None, minmax=False, norm=False):
    while len(blob) % 4: blob.append(0)
    off = len(blob); raw = np.ascontiguousarray(arr).tobytes(); blob.extend(raw)
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(raw), **({'target': target} if target else {})})
    acc = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': len(arr), 'type': typ, **({'normalized': True} if norm else {})}
    if minmax: acc['min'] = arr.min(0).tolist(); acc['max'] = arr.max(0).tolist()
    accessors.append(acc); return len(accessors) - 1
meshes = []
for name, A in (('far-body', far_a), ('near-body', near_a)):
    attrs = {'POSITION': add(A['pos'], 34962, 'VEC3', 5126, True), 'NORMAL': add(A['nrm'], 34962, 'VEC3', 5126),
             'TEXCOORD_0': add(A['uv'], 34962, 'VEC2', 5126), 'JOINTS_0': add(A['joints'], 34962, 'VEC4', 5121),
             'WEIGHTS_0': add(A['weights'], 34962, 'VEC4', 5121, norm=True)}
    idx = add(A['index'], 34963, 'SCALAR', 5125 if A['index'].dtype == np.uint32 else 5123)
    meshes.append({'name': name, 'primitives': [{'attributes': attrs, 'indices': idx, 'material': 0}],
                   # (pieces=1: [name, first index, index count] per piece, triangles grouped by piece)
                   **({'extras': {'pieces': A['pieces']}} if PIECES else {})})
ibm = np.zeros((len(BONES), 16), np.float32)
for i, b in enumerate(BONES):
    m = np.eye(4); m[:3, 3] = -np.array(J[b]); ibm[i] = m.T.ravel()             # column-major
ibm_acc = add(ibm, None, 'MAT4', 5126)
png = open(img.filepath_raw, 'rb').read()
while len(blob) % 4: blob.append(0)
views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(png)}); blob.extend(png)
nodes = []
for b in BONES:
    p = J[b]; q = J[PARENT[b]] if b in PARENT else [0, 0, 0]
    nodes.append({'name': b, 'translation': [p[0] - q[0], p[1] - q[1], p[2] - q[2]]})
for i, b in enumerate(BONES):
    kids = [BONES.index(c) for c, par in PARENT.items() if par == b]
    if kids: nodes[i]['children'] = kids
nodes.append({'name': 'far-body', 'mesh': 0, 'skin': 0}); nodes.append({'name': 'near-body', 'mesh': 1, 'skin': 0})
hip = J['hips'][1]
nodes.append({'name': 'CharacterRig', 'children': [len(BONES), len(BONES) + 1, 0],
              'extras': {'heightMeters': HEIGHT, 'hipHeightMeters': hip, 'sourceRig': 'Mixamo65', 'rigVersion': 4, 'surfaceRevision': 7, 'variant': variant}})
doc = {'asset': {'version': '2.0', 'generator': 'OnTop shared-body character (to_game.py)'}, 'scene': 0, 'scenes': [{'name': 'Scene', 'nodes': [len(nodes) - 1]}],
       'nodes': nodes, 'meshes': meshes, 'skins': [{'name': 'CharacterRig', 'joints': list(range(len(BONES))), 'inverseBindMatrices': ibm_acc}],
       'materials': [{'name': f'{variant}_atlas', 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.9}}],
       'samplers': [{'magFilter': 9729, 'minFilter': 9987}], 'textures': [{'sampler': 0, 'source': 0}],
       'images': [{'name': f'{variant}_atlas', 'mimeType': 'image/png', 'bufferView': len(views) - 1}],
       'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
js = json.dumps(doc).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
while len(blob) % 4: blob.append(0)
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(blob)
print('RESULT', json.dumps({'variant': variant, 'bytes': os.path.getsize(out), 'near': [near_a['tris'], near_a['verts']], 'far': [far_a['tris'], far_a['verts']],
                           'hip': round(hip, 4), 'top_y': round(float(near_a['pos'][:, 1].max()), 3), 'hand_L': [round(x, 3) for x in J['hand_L']]}))
