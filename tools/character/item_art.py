"""Wardrobe card pictures of one outfit's items: -- <shared_layers.glb> <out_dir> <file> <set> [size=320]
Each item (item__<SLOT>__<set>, its under-pieces included) alone, in the game's arms-down rest, from the front-left
like the default parts' pictures (frontend/src/features/wardrobe/parts), lit by a soft sky and a sun, transparent.
Writes <out_dir>/outfit-<file>-<set>-<slot>.raw.png; fit them to the card with the same 232 px width afterwards.
together=TOP,BOTTOM,SHOES also draws those slots as one picture, <out_dir>/set-<file>-<set>.raw.png (a set's card:
the wardrobe's outfit is worn as one). cut_above=dz leaves out of the top's and the set's pictures what lies over
dz above the neck joint. variant=girl draws a hat's girl hair (__for_girl) and writes -girl pictures. view=dx,dy,dz
looks from another direction (default -0.35,-1,0.15)."""
import bpy, sys, os, re
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, od, file_, SET = a[0], os.path.abspath(a[1]), a[2], a[3]
opt = dict(x.split('=') for x in a[4:])
SIZE = int(opt.get('size', 640))
VARIANT = opt.get('variant', 'man'); SUFFIX = '' if VARIANT == 'man' else '-' + VARIANT
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from game_pose import bind_pose
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bind_pose(arm)
items = {}
for o in list(bpy.data.objects):
    if o.type != 'MESH': continue
    m = re.match(rf'item__([A-Z]+)__{SET}(?:__for_(man|girl))?(?:__under_\w+)?(?:_\d+)?$', re.sub(r'\.\d+$', '', o.name))
    # (variant=girl: a hat's girl hair, __for_girl, instead of the man's; written -girl)
    if m and (not m.group(2) or m.group(2) == VARIANT): items.setdefault(m.group(1), []).append(o)
    else: o.hide_render = True
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = SIZE; sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.55
sun = bpy.data.objects.new('s', bpy.data.lights.new('s', 'SUN')); sun.data.energy = 1.6; sc.collection.objects.link(sun); sun.rotation_euler = (0.9, 0.2, 0.5)
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
# (view=dx,dy,dz: another direction; the girl's bun under a hat, seen from the front, showed the hollow inside of
# the hair, the face being the body's)
d = Vector([float(x) for x in opt['view'].split(',')] if opt.get('view') else (-0.35, -1, 0.15)).normalized()
dg = bpy.context.evaluated_depsgraph_get()
jobs = list(items.items())
if opt.get('together'):
    # as the game shows a set: pieces under one of its own items (item__BOTTOM__s__under_..._TOPs) stay hidden; the
    # purple dopo's trousers showed through its robe as a grey patch (S15P31B105-390)
    worn = {f'{sl}{SET}' for sl in opt['together'].split(',')}
    hidden = lambda o: any(t in worn for t in re.findall(r'[A-Z]+[a-z0-9]+', (re.search(r'__under_(\w+?)(?:_\d+)?$', re.sub(r'\.\d+$', '', o.name)) or [None, ''])[1]))
    jobs.append(('SET', [o for sl in opt['together'].split(',') for o in items.get(sl, []) if not hidden(o)]))
# (cut_above=dz: in the top's and the set's pictures, what lies over dz above the neck joint is left out: the dopo's
# top carries the neck's skin, which floated over the collar in its card)
neck_z = (arm.matrix_world @ next(b for b in arm.pose.bones if b.name.endswith('Neck')).head).z
def cut_copy(o, z_max):
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); c = bpy.data.objects.new(o.name + '_cut', me)
    c.matrix_world = o.matrix_world; sc.collection.objects.link(c)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if (c.matrix_world @ f.calc_center_median()).z > z_max], context='FACES')
    bm.to_mesh(me); bm.free(); return c
for slot, objs in jobs:
    if opt.get('cut_above') and slot in ('TOP', 'SET'):
        objs = [cut_copy(o, neck_z + float(opt['cut_above'])) if o.name.startswith('item__TOP') else o for o in objs]
    for o in bpy.data.objects:
        if o.type == 'MESH': o.hide_render = o not in objs
    P = [o.matrix_world @ v.co for o in objs for v in o.evaluated_get(dg).to_mesh().vertices]
    lo = Vector([min(p[i] for p in P) for i in range(3)]); hi = Vector([max(p[i] for p in P) for i in range(3)])
    c = (lo + hi) / 2; cam.data.ortho_scale = max(hi - lo) * 1.15
    cam.location = c + d * 5; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    name_ = f'set-{file_}-{SET}{SUFFIX}.raw.png' if slot == 'SET' else f'outfit-{file_}-{SET}-{slot.lower()}{SUFFIX}.raw.png'
    sc.render.filepath = os.path.join(od, name_); bpy.ops.render.render(write_still=True)
    print('ART', slot, len(objs), 'meshes')
