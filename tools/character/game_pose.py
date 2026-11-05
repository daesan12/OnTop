"""The runtime characters' bind pose, shared by to_game.py (the surface) and to_clips.py (the actions).

The Mixamo rest pose (a T-pose) with nothing playing, each upper arm turned about its shoulder, in the body's
plane, until shoulder-to-wrist points 20.5 degrees out from straight down: the game's rest. With the import's
first action still on the armature, the first characters were bound in its first frame (fingers curled 109
degrees), and the game's hand poses, which add to the rest, could not open the hands.
"""
import math
import bpy
from mathutils import Vector, Matrix

ARM_DOWN = math.radians(90 - 20.5)


def bind_pose(arm):
    ad = arm.animation_data
    if ad:
        for t in ad.nla_tracks: t.mute = True
        ad.action = None
    for pb in arm.pose.bones: pb.matrix_basis = Matrix()
    arm.data.pose_position = 'POSE'; bpy.context.view_layer.update()
    pb = arm.pose.bones
    for side, sg in (('Left', 1), ('Right', -1)):
        up = pb[f'mixamorig:{side}Arm']; hand = pb[f'mixamorig:{side}Hand']             # (armature space)
        h = up.head.copy(); d0 = (hand.head - h).normalized()
        d1 = Vector((sg * math.cos(ARM_DOWN), 0, -math.sin(ARM_DOWN)))
        d0h = Vector((d0.x, 0, d0.z)).normalized()                     # turn in the body's plane only (no twist)
        R = d0h.rotation_difference(d1).to_matrix().to_4x4()
        up.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ up.matrix
        bpy.context.view_layer.update()
    return {b.name: b.matrix.copy() for b in arm.pose.bones}
