"""The layered build's actions as rotations of the game's 19 body joints: -- <layers.glb> <out.json> [rate=30] [idle_rate=15]

The runtime joints rest with identity rotations in the bind pose of game_pose.py (the T-pose, arms turned down).
Per sampled frame, each Mixamo joint's turn from that bind pose (its posed armature-space rotation times the
inverse of its bind rotation) is the runtime joint's turn in model space; a runtime joint takes its first Mixamo
joint's (Spine, not Spine1; Head, not its top), and its local rotation is its parent's turn undone. Converted to
glTF axes (Y up, +Z forward) and stored as int16 quaternions (x, y, z, w) * 32767, base64, per clip:
{fps, frames, data}. Fingers are left to the game's hand poses; root motion is not kept (the clips are in place).
"""
import bpy, sys, os, json, base64, math
import numpy as np
from mathutils import Matrix, Quaternion

a = sys.argv[sys.argv.index('--') + 1:]; src, out = a[0], a[1]
opt = dict(x.split('=') for x in a[2:] if '=' in x)
RATE, IDLE_RATE = float(opt.get('rate', 30)), float(opt.get('idle_rate', 15))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from game_pose import bind_pose

BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'clavicle_L', 'clavicle_R', 'upperArm_L', 'lowerArm_L', 'hand_L',
         'upperArm_R', 'lowerArm_R', 'hand_R', 'upperLeg_L', 'lowerLeg_L', 'foot_L', 'upperLeg_R', 'lowerLeg_R', 'foot_R']
SOURCE = {'hips': 'Hips', 'spine': 'Spine', 'chest': 'Spine2', 'neck': 'Neck', 'head': 'Head'}
PARENT = {'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck'}
for side, S in (('Left', 'L'), ('Right', 'R')):
    SOURCE.update({f'clavicle_{S}': f'{side}Shoulder', f'upperArm_{S}': f'{side}Arm', f'lowerArm_{S}': f'{side}ForeArm', f'hand_{S}': f'{side}Hand',
                   f'upperLeg_{S}': f'{side}UpLeg', f'lowerLeg_{S}': f'{side}Leg', f'foot_{S}': f'{side}Foot'})
    PARENT.update({f'clavicle_{S}': 'chest', f'upperArm_{S}': f'clavicle_{S}', f'lowerArm_{S}': f'upperArm_{S}', f'hand_{S}': f'lowerArm_{S}',
                   f'upperLeg_{S}': 'hips', f'lowerLeg_{S}': f'upperLeg_{S}', f'foot_{S}': f'lowerLeg_{S}'})

bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bind = {k: v.to_quaternion() for k, v in bind_pose(arm).items()}
ad = arm.animation_data; tracks = {t.name: t for t in ad.nla_tracks}
fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
C = Quaternion((1, 0, 0), math.radians(-90))            # Blender (x, y, z) -> glTF (x, z, -y)
Ci = C.inverted()
clips = {}
for name in ('idle', 'walk', 'run', 'swim'):
    act = tracks[name].strips[0].action
    for p in arm.pose.bones: p.matrix_basis = Matrix()
    ad.action = act
    if hasattr(ad, 'action_slot') and act.slots: ad.action_slot = act.slots[0]
    f0, f1 = act.frame_range; dur = (f1 - f0) / fps
    rate = IDLE_RATE if name == 'idle' else RATE
    n = max(2, int(round(dur * rate)))                     # the loop's last frame is its first: not stored
    Q = np.zeros((n, len(BONES), 4), np.float64)
    for i in range(n):
        f = f0 + i / rate * fps
        bpy.context.scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))
        turn = {}
        for b in BONES:
            pb = arm.pose.bones['mixamorig:' + SOURCE[b]]
            turn[b] = pb.matrix.to_quaternion() @ bind['mixamorig:' + SOURCE[b]].inverted()
        for k, b in enumerate(BONES):
            loc = turn[PARENT[b]].inverted() @ turn[b] if b in PARENT else turn[b]
            g = C @ loc @ Ci
            q = np.array([g.x, g.y, g.z, g.w])
            if i and np.dot(q, Q[i - 1, k]) < 0: q = -q        # keep neighbours in one hemisphere
            Q[i, k] = q
    if name == 'swim': Q[:, 0] = [0, 0, 0, 1]              # the game lays the swimmer down itself (figure tilt)
    clips[name] = {'fps': rate, 'frames': n, 'data': base64.b64encode(np.round(Q * 32767).astype('<i2').tobytes()).decode()}
    print('CLIP', name, round(dur, 2), 's', n, 'frames')
with open(out, 'w') as fh:
    json.dump({'bones': BONES, 'clips': clips}, fh, separators=(',', ':'))
print('RESULT', os.path.getsize(out), 'bytes')
