import { useMemo } from 'react'
import { MOVEMENT } from '../../config'
import { localMovement } from '../../network/localMovementPrediction'
import { avatars, useSession } from '../../network/worldClient'
import { useAvatarFrameSampler } from '../AvatarPoseFrame'
import type { Visitor } from './pigeonSimulation'
import { createPigeonVisitorSampler } from './visitorMotion'

export function useLivePigeonVisitors() {
  const samplePose = useAvatarFrameSampler()
  return useMemo(() => {
    const visitors: Visitor[] = []
    const sampleVisitor = createPigeonVisitorSampler()
    const pose = { x: 0, y: 0, z: 0, yaw: 0 }
    return () => {
      visitors.length = 0
      const now = performance.now()
      const own = useSession.getState().sessionId
      for (const [id, avatar] of avatars) {
        if (!avatar.connected) continue
        samplePose(avatar, now, pose)
        const flags = id === own && localMovement.ready ? localMovement.displayFlags(now) : avatar
        const running = flags.running && flags.moving && !avatar.swimming && !avatar.tableId
          && !avatar.benchId && !avatar.fitnessId && !avatar.telescopeId
        visitors.push(sampleVisitor(id, pose, now, running, MOVEMENT.runSpeed))
      }
      return visitors
    }
  }, [samplePose])
}
