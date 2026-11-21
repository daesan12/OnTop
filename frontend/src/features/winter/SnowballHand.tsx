import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh, Vector3 } from 'three'
import type { createCharacterRig } from '../../world/art/CharacterRig'
import { avatars, estimatedServerTime } from '../../network/worldClient'
import { heldSnowballVisible, winterFrozen, winterMotion } from './state'
import { winterPoseActive } from './avatarPose'
import { useFacilityState } from '../facilities/state'
import { winterSceneryVisible } from './presentation'

/** World-space hand samples are shared by the held prop, launch effect and trajectory guide. */
export const snowballHands = new Map<string, Vector3>()
export function SnowballHand({ id, model }: { id: string; model: ReturnType<typeof createCharacterRig> }) {
  const mesh = useRef<Mesh>(null), points = useMemo(() => ({ left: new Vector3(), right: new Vector3(), center: new Vector3() }), [])
  useEffect(() => {
    const prop = mesh.current
    return () => {
      snowballHands.delete(id)
      // The avatar parent preserves cached GLTF assets with dispose=null; this prop owns its small resources.
      prop?.geometry.dispose()
      if (prop) for (const material of Array.isArray(prop.material) ? prop.material : [prop.material]) material.dispose()
    }
  }, [id])
  useFrame(() => {
    const root = mesh.current, avatar = avatars.get(id), now = estimatedServerTime()
    if (!root || !avatar) return
    const allowed = winterSceneryVisible() && avatar.connected && !avatar.tableId && avatar.seatIndex < 0 && !avatar.carry && !avatar.vehicle
      && !avatar.fitnessId && !avatar.telescopeId && !avatar.swimming && !winterFrozen(id, now)
      && !useFacilityState.getState().occupancies[id] && winterPoseActive(id, now)
    if (!allowed) { root.visible = false; snowballHands.delete(id); return }
    model.bones.hand_R.getWorldPosition(points.right)
    snowballHands.set(id, points.right)
    root.visible = heldSnowballVisible(id, now)
    if (!root.visible || !root.parent) return
    const motion = winterMotion(id, now)
    points.center.copy(points.right)
    if (motion?.kind !== 'windup') {
      model.bones.hand_L.getWorldPosition(points.left)
      points.center.add(points.left).multiplyScalar(.5)
    }
    root.parent.worldToLocal(points.center)
    root.position.copy(points.center)
    root.scale.setScalar(motion?.kind === 'gather' ? Math.max(.08, Math.min(1, (now - motion.at - 160) / 340)) : 1)
  }, -.5)
  return <mesh ref={mesh} name={'winter-held-snowball-' + id} visible={false} raycast={() => {}}>
    <sphereGeometry args={[.17, 12, 8]} /><meshLambertMaterial color="#f4fbff" />
  </mesh>
}
