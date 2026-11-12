import { DEV_JUMP_TRANSLATION, JUMP_SEQUENCE, JUMP_STAGES, JUMP_START, JUMP_FINISH, JUMP_REWARDS } from '../jump10Plan'
import { groundSurfaceHeight } from '../groundSurface'
import { site } from '../plan'

export function buildRenewalJumpCourse() {
  const pads = JUMP_SEQUENCE.map((pad, block) => ({
    ...pad, block, stage: pad.stage + 1, top: pad.height,
    // The stone art has lower courses down to -.47 m beneath the landing surface.
    thickness: pad.theme === 'stone' ? .47 : pad.thickness ?? .24,
    ordinal: Number(pad.id.split('-').at(-1)) || 0,
  }))
  const colliders = pads.map(pad => ({
    id: pad.id, block: pad.block, stage: pad.stage, gate: pad.gate ?? null,
    shape: pad.radius === undefined ? 'box' as const : 'cylinder' as const, camera: false,
    center: [pad.x, pad.top - pad.thickness / 2, pad.z],
    half: [pad.radius ?? pad.halfX, pad.thickness / 2, pad.radius ?? pad.halfZ], radius: pad.radius ?? null,
    yaw: pad.collisionYaw ?? pad.yaw, top: pad.top, thickness: pad.thickness,
  }))
  const visibleAtStart = JUMP_STAGES[0].count
  const opaqueAtStart = pads.slice(0, visibleAtStart).filter(pad => pad.top - DEV_JUMP_TRANSLATION.y < 15).length
  const stele = site('stele')
  return {
    schemaVersion: 1, courseVersion: 'park220-jump10-v1', rulesVersion: 'v4', visibleAtStart, opaqueAtStart,
    physics: { tickRate: 30, coyoteTicks: 3, jumpBufferTicks: 4,
      colliderCoordinates: 'uninflated; metres; Y up; center = top - thickness/2', avatarCollision: false },
    stages: JUMP_STAGES.map((stage, i) => ({ ...stage, stage: i + 1, reward: JUMP_REWARDS[i]! })),
    pads, colliders, start: JUMP_START, finish: JUMP_FINISH,
    returnTo: { x: JUMP_START.x, z: JUMP_START.z + 1.6, name: '돌탑 점프맵 · 출발 자리' },
    guide: { x: stele.x, z: stele.z, y: groundSurfaceHeight(stele.x, stele.z), radius: 2.8 },
  }
}
