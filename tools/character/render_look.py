"""Render a pieces build (to_game.py pieces=1) as worn: -- <raw.glb> <out_prefix> HAIR=man/b TOP=man/d ... [variant=man] [source=man]
Faces of hidden pieces are deleted (glTF triangle order = Blender face order); writes <out_prefix>_front/_face/_back.png."""
import bpy, bmesh, sys, json, struct, re
from mathutils import Vector
import os
a = sys.argv[sys.argv.index('--') + 1:]; path, tag, look = a[0], os.path.abspath(a[1]), dict(x.split('=') for x in a[2:])   # SLOT=source/id
variant = look.pop('variant', 'man')
b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n])
pieces = next(m for m in j['meshes'] if m['name'] == 'near-body')['extras']['pieces']
src = variant if 'source' not in look else look.pop('source')
worn = {s + v.split('/')[1] for s, v in look.items()}
def shown(name):
    m = re.match(r'^body(?:__(\w+))?$', name)
    if m: return src == variant and not any(t in worn for t in re.findall(r'[A-Z]+[a-z0-9]+', m.group(1) or ''))
    m = re.match(r'^item__([A-Z]+)__([a-z0-9]+)(?:__under_(\w+))?$', name)
    w = look.get(m.group(1)) if m else None
    return bool(w) and w == f'{src}/{m.group(2)}' and not any(t in worn for t in re.findall(r'[A-Z]+[a-z0-9]+', m.group(3) or ''))
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=path)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and not o.name.startswith('near'): bpy.data.objects.remove(o)
o = next(x for x in bpy.data.objects if x.type == 'MESH')
keep = set()
for name, start, count in pieces:
    if shown(name): keep.update(range(start // 3, (start + count) // 3))
bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
assert len(bm.faces) == sum(c for _, _, c in pieces) // 3, (len(bm.faces), sum(c for _, _, c in pieces) // 3)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES'); bm.to_mesh(o.data); bm.free()
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'
sc.world = bpy.data.worlds.new('w'); sc.world.color = (1, 0, 1)
sc.render.resolution_x = sc.render.resolution_y = 700
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
for name, (d, c, S) in {'front': ((0, -1, 0.1), (0, 0, 0.95), 2.0), 'face': ((0.2, -1, 0.1), (0, 0, 1.35), 0.6), 'back': ((0, 1, 0.2), (0, 0, 0.95), 2.0)}.items():
    d = Vector(d).normalized(); c = Vector(c); cam.data.type = 'ORTHO'; cam.data.ortho_scale = S; cam.location = c + d * 4
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{tag}_{name}.png'; bpy.ops.render.render(write_still=True)
