"""Pose check on a shared build: -- <shared.glb> <out_prefix> set=k variant=man frames=walk:4,walk:12,run:4,run:10
Keeps the body pieces the game shows when HAIR/TOP/BOTTOM/SHOES of `set` are worn, the set's items (with the
variant's __for_ hair) and nothing else; poses the armature to each action:frame and renders front, back and side."""
import bpy, sys, os, re
from mathutils import Vector

a = sys.argv[sys.argv.index('--') + 1:]
src, tag = a[0], os.path.abspath(a[1])
opt = dict(x.split('=', 1) for x in a[2:])
SET, VAR = opt['set'], opt.get('variant', 'man')
worn = {f'{s}{SET}' for s in ('HAIR', 'TOP', 'BOTTOM', 'SHOES')}
tok = lambda r: re.findall(r'[A-Z]+[a-z0-9]+', r or '')
base = lambda n: re.sub(r'(_\d+)?(\.\d+)?$', '', n)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type != 'MESH': continue
    n = base(o.name)
    m = re.match(r'^body(?:__(\w+))?$', n)
    if m: keep = not any(t in worn for t in tok(m.group(1)))
    else:
        m = re.match(r'^item__([A-Z]+)__([a-z0-9]+)(?:__for_(man|girl))?(?:__under_(\w+))?$', n)
        keep = bool(m) and m.group(2) == SET and (not m.group(3) or m.group(3) == VAR) and not any(t in worn for t in tok(m.group(4)))
        # (the face: the character's own; only the man's default here, the girl's face is the same body)
    if not keep: bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ad = arm.animation_data
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'
sh.show_backface_culling = True
sc.world = bpy.data.worlds.new('w'); sc.world.color = (1, 0, 1)
sc.render.resolution_x = sc.render.resolution_y = int(opt.get('size', 500))   # size=, ortho=, cz=: close-ups (the neck: ortho=0.35 cz=0.6)
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = float(opt.get('ortho', 1.15))
views = {'f': (0.3, -1, 0.1), 'b': (-0.3, 1, 0.1), 's': (1, 0, 0.05)}
# (views=name:dx,dy,dz;...: other directions, as a game screenshot's)
if opt.get('views'): views = {k: tuple(map(float, v.split(','))) for k, v in (x.split(':') for x in opt['views'].split(';'))}
for spec in opt.get('frames', 'walk:4,walk:12,run:4,run:10').split(','):
    act, fr = spec.split(':')
    for t in ad.nla_tracks: t.mute = True
    ad.action = next(t.strips[0].action for t in ad.nla_tracks if t.name == act)
    if hasattr(ad, 'action_slot') and ad.action.slots: ad.action_slot = ad.action.slots[0]
    sc.frame_set(int(fr))
    for vn, d in views.items():
        hips = arm.matrix_world @ next(b for b in arm.pose.bones if b.name.endswith('Hips')).head
        d = Vector(d).normalized(); c = Vector((hips.x + float(opt.get('cx', 0)), hips.y, float(opt.get('cz', 0.5)))); cam.location = c + d * 4   # (cx=: a sleeve)
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{tag}_{act}{fr}_{vn}.png'; bpy.ops.render.render(write_still=True)
print('RESULT', tag)
