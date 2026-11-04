"""Render pieces builds (to_game.py pieces=1) as worn, the way the game picks pieces (characterLook.ts):
-- <avatar_raw.glb> <out_prefix> HAIR=man/b TOP=gat/h ... [variant=man] [with=gat@parts/gat_raw.glb ...]
[view=name:dx,dy,dz:cx,cy,cz:scale ...] (close-ups in place of the four standard views)
The avatar's own file gives the body and its items; with=<source>@<raw.glb> adds another file's items (an outfit
file, or the other character's). Faces of hidden pieces are deleted (glTF triangle order = Blender face order);
writes <out_prefix>_front/_side/_face/_back.png on a magenta background (holes show magenta)."""
import bpy, bmesh, sys, json, struct, re, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
path, tag = a[0], os.path.abspath(a[1])
args = [x.split('=', 1) for x in a[2:]]
variant = next((v for k, v in args if k == 'variant'), 'man')
files = [(variant, path)] + [tuple(v.split('@', 1)) for k, v in args if k == 'with']
look = {k: v for k, v in args if k not in ('variant', 'with', 'view')}             # SLOT=source/id
worn = {s + v.split('/')[1] for s, v in look.items()}
tokens = lambda rule: re.findall(r'[A-Z]+[a-z0-9]+', rule or '')
def shown(name, src):
    m = re.match(r'^body(?:__(\w+))?$', name)
    if m: return src == variant and not any(t in worn for t in tokens(m.group(1)))
    m = re.match(r'^item__([A-Z]+)__([a-z0-9]+)(?:__under_(\w+))?$', name)
    return bool(m) and look.get(m.group(1)) == f'{src}/{m.group(2)}' and not any(t in worn for t in tokens(m.group(3)))
bpy.ops.wm.read_factory_settings(use_empty=True)
for src, p in files:
    b = open(p, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n])
    pieces = next(m for m in j['meshes'] if m['name'] == 'near-body')['extras']['pieces']
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=p)
    for o in [o for o in bpy.data.objects if o not in before]:
        if o.type == 'MESH' and not o.name.startswith('near'): bpy.data.objects.remove(o)
    o = next(x for x in bpy.data.objects if x not in before and x.type == 'MESH')
    keep = set()
    for name, start, count in pieces:
        if shown(name, src): keep.update(range(start // 3, (start + count) // 3))
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    assert len(bm.faces) == sum(c for _, _, c in pieces) // 3, (len(bm.faces), sum(c for _, _, c in pieces) // 3)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES'); bm.to_mesh(o.data); bm.free()
    print('LOOK', src, len(keep), 'faces shown')
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'
sh.show_backface_culling = True                    # (as the game draws: holes show through)
sc.world = bpy.data.worlds.new('w'); sc.world.color = (1, 0, 1)
sc.render.resolution_x = sc.render.resolution_y = 700
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
views = {'front': ((0, -1, 0.1), (0, 0, 1.0), 2.2), 'side': ((1, -0.35, 0.1), (0, 0, 1.0), 2.2),
         'face': ((0.2, -1, 0.1), (0, 0, 1.4), 0.75), 'back': ((0, 1, 0.2), (0, 0, 1.0), 2.2)}
extra = [v.split(':') for k, v in args if k == 'view']
if extra: views = {n: (tuple(map(float, d.split(','))), tuple(map(float, c.split(','))), float(S)) for n, d, c, S in extra}
for name, (d, c, S) in views.items():
    d = Vector(d).normalized(); c = Vector(c); cam.data.type = 'ORTHO'; cam.data.ortho_scale = S; cam.location = c + d * 4
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{tag}_{name}.png'; bpy.ops.render.render(write_still=True)
