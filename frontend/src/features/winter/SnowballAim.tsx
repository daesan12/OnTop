import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, InstancedMesh, MeshBasicMaterial, Object3D, Vector3 } from 'three'
import { avatars, estimatedServerTime, sampleAvatar, useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { panelOwnsKeys } from '../../world/inputOwnership'
import { carryPlayerAvailable } from '../carry/interaction'
import { renewalGroundHeight } from '../../park/renewalMap'
import { winterSceneryVisible } from './presentation'
import { useWinter, winterMotion } from './state'
import { snowballHands } from './SnowballHand'
import { snowballPoint, type SnowballAim as Aim } from './trajectory'
import { useSnowballAim } from './aimState'
import { facilityMovementBlocked } from '../facilities/state'
import { localMovement } from '../../network/localMovementPrediction'
import { localSnowballAim, localSnowballDistance, PreparedSnowballAim } from './localAim'

const probeStatic = (from: Vector3 | { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) =>
  localMovement.raycastStatic(from, to)

export function SnowballAim() {
  const root = useRef<Group>(null), dots = useRef<InstancedMesh>(null), target = useRef<Group>(null), ground = useRef<Group>(null)
  const data = useRef({ scope: '', nextLocal: 0, local: null as Aim | null,
    obstaclePose: { x: Infinity, y: Infinity, z: Infinity, yaw: Infinity }, distance: 16, probeReady: false })
  const prepared = useMemo(() => new PreparedSnowballAim(), [])
  const dummy = useMemo(() => new Object3D(), []), point = useMemo(() => new Vector3(), [])
  const pose = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), [])
  const material = useMemo(() => new MeshBasicMaterial({ color: '#f4ce70', transparent: true, opacity: .9, depthWrite: false }), [])
  const reticleMaterial = useMemo(() => new MeshBasicMaterial({ color: '#f4ce70', transparent: true, opacity: .95, depthWrite: false, depthTest: false }), [])
  useEffect(() => () => { prepared.reset(''); useSnowballAim.setState({ aim: null }); material.dispose(); reticleMaterial.dispose() }, [material, reticleMaterial, prepared])
  useFrame(({ camera }) => {
    const s = useSession.getState(), own = avatars.get(s.sessionId), state = data.current, now = performance.now()
    if (!root.current || !dots.current || !target.current || !ground.current) return
    const motion = winterMotion(s.sessionId, estimatedServerTime())
    const allowed = s.status === 'connected' && s.mapCompatible && own && winterSceneryVisible() && !panelOwnsKeys()
      && (useWinter.getState().players[s.sessionId]?.snowballs ?? 0) > 0 && !own.carry && !own.vehicle
      && carryPlayerAvailable(s.sessionId, own) && !facilityMovementBlocked(s.sessionId) && motion?.kind !== 'gather'
    const scope = allowed ? s.sessionId + '/' + s.roomId : ''
    if (state.scope !== scope) {
      state.scope = scope; state.local = null; state.nextLocal = 0; state.obstaclePose.x = Infinity
      prepared.reset(scope)
      useSnowballAim.setState({ aim: null })
    }
    root.current.visible = false
    if (!allowed) return
    sampleAvatar(own, now, pose)
    const yaw = motion?.kind === 'windup' ? motion.yaw : Math.atan2(Math.sin(pose.yaw), Math.cos(pose.yaw))
    prepared.prepare(motion?.kind === 'windup' ? motion.id : '', () => parkRuntime.aimSnowball?.(yaw) ?? Promise.resolve(null))
    if (now >= state.nextLocal) {
      state.nextLocal = now + 100
      const before = state.obstaclePose
      if (state.probeReady !== localMovement.ready || Math.hypot(before.x - pose.x, before.y - pose.y, before.z - pose.z) > .03
        || Math.abs(before.yaw - yaw) > .005) {
        state.distance = localSnowballDistance(pose, yaw, probeStatic, renewalGroundHeight)
        state.probeReady = localMovement.ready
        Object.assign(before, pose, { yaw })
      }
      const targets = []
      for (const [userId, avatar] of avatars) {
        if (userId !== s.sessionId && !avatar.carry && !avatar.vehicle && carryPlayerAvailable(userId, avatar)) {
          targets.push({ userId, position: sampleAvatar(avatar, now, { x: 0, y: 0, z: 0, yaw: 0 }) })
        }
      }
      state.local = localSnowballAim(s.roomId, s.sessionId, pose, yaw, state.distance, targets)
    }
    const approved = prepared.aim
    const aim = approved && Math.hypot(approved.x - pose.x, approved.y - pose.y - .35, approved.z - pose.z) < .5 ? approved : state.local
    if (!aim || Math.abs(Math.atan2(Math.sin(aim.yaw - yaw), Math.cos(aim.yaw - yaw))) > .16
      || Math.hypot(aim.x - pose.x, aim.z - pose.z) > 2) return
    if (useSnowballAim.getState().aim !== aim) useSnowballAim.setState({ aim })
    root.current.visible = true
    material.color.set(aim.hitUserId ? '#6befa4' : aim.distance < 15.9 ? '#ffca67' : '#b8f0ff')
    reticleMaterial.color.copy(material.color)
    root.current.userData.aim = aim
    const hand = snowballHands.get(s.sessionId)
    for (let i = 0; i < 33; i++) {
      snowballPoint(aim, i / 32, hand, point)
      dummy.position.copy(point); dummy.scale.setScalar(i % 4 === 0 ? 1.35 : 1)
      dummy.updateMatrix(); dots.current.setMatrixAt(i, dummy.matrix)
    }
    dots.current.instanceMatrix.needsUpdate = true
    target.current.position.set(aim.endX, aim.endY, aim.endZ)
    target.current.quaternion.copy(camera.quaternion)
    ground.current.position.set(aim.endX, renewalGroundHeight(aim.endX, aim.endZ) + .13, aim.endZ)
  })
  return <group ref={root} name="winter-snowball-aim" visible={false}>
    <instancedMesh ref={dots} name="winter-aim-trajectory" args={[undefined, material, 33]} frustumCulled={false} raycast={() => {}}>
      <sphereGeometry args={[.045, 6, 4]} />
    </instancedMesh>
    <group ref={target} name="winter-aim-target" renderOrder={20}>
      {[.15, .29].map(radius => <mesh key={radius} material={reticleMaterial} raycast={() => {}}><torusGeometry args={[radius, .018, 4, 24]} /></mesh>)}
      {[0, Math.PI / 2].map(a => <mesh key={a} rotation={[0, 0, a]} material={reticleMaterial} raycast={() => {}}><boxGeometry args={[.76, .025, .02]} /></mesh>)}
    </group>
    <group ref={ground} name="winter-aim-ground"><mesh rotation={[-Math.PI / 2, 0, 0]} material={material} raycast={() => {}}><ringGeometry args={[.29, .39, 24]} /></mesh></group>
  </group>
}
