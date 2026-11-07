import { _roots } from '@react-three/fiber'
import { AvatarPresentation } from '../../src/world/avatarPresentation'
import { avatars, receive, useSession } from '../../src/network/worldClient'

const frames: { at: number; x: number; z: number; moving: boolean; running: boolean; leg: number }[] = []
let version = 1_000_000

export function observeRemoteLocomotion() {
  const original = AvatarPresentation.prototype.sample
  AvatarPresentation.prototype.sample = function (...args) {
    const result = original.apply(this, args)
    if (args[0].userId === '102') {
      const object = _roots.get(document.querySelector('canvas')!)!.store.getState().scene.getObjectByName('avatar-102')!
      frames.push({ at: performance.now(), x: object.position.x, z: object.position.z,
        moving: result.moving, running: result.running,
        leg: object.getObjectByName('upperLeg_L')!.rotation.x })
      if (frames.length > 600) frames.shift()
    }
    return result
  }
}

/** Approved incoming snapshots with intentionally stale stride flags, as on a held endpoint. */
export function publishRemote(x: number, running: boolean, ticked: boolean) {
  const session = useSession.getState(), own = avatars.get(session.sessionId)!
  const at = performance.now(), tick = Math.floor(at * 30 / 1000)
  receive({ type: 'WORLD_STATE', requestId: null, payload: {
    channelId: session.roomId, version: ++version, mapVersion: session.mapVersion,
    avatars: [{ userId: session.sessionId, position: { ...own.current, lastInputSeq: 0,
      moving: false, running: false, swimming: false } },
    { userId: '102', position: { x, y: own.current.y, z: own.current.z - 3, yaw: 0,
      lastInputSeq: tick, moving: true, running, swimming: false },
      ...(ticked ? { motion: { epoch: 1, tick, appliedInputSeq: tick, inputAgeMs: 0,
        velocityY: 0, grounded: true, inputActive: true } } : {}) }],
  } })
}

export const remoteLocomotionFrames = () => frames
