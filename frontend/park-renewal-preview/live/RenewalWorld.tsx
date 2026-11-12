import { RENEWAL_DISTANCE_LOD } from '../../src/park/mapSelection'
import { Buildings } from '../Buildings'
import { CityBackdrop } from '../CityBackdrop'
import { ScenicDetails } from '../ScenicDetails'
import { TableFurniture } from '../../src/features/tables/TableFurniture'
import { TABLES } from '../../src/park/mapConfig'
import { lazy, startTransition, Suspense, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { authoritativePose, avatars, useSession } from '../../src/network/worldClient'
import { horrorState, secretCorridorContains } from '../horrorPlan'
import { CAMERA, type QualityPreset } from '../../src/config'
import { renewalMap } from '../../src/park/renewalMap'
import { viewControls } from '../../src/world/cameraPerspective'
import { welcomeFlight } from '../../src/features/welcomeTour/flight'
import { createLakeProgress, LakeProgress } from '../lakeStages'
import { LakeStreaming } from './LakeStreaming'

const HorrorZone = lazy(() => import('../HorrorZone').then(module => ({ default: module.HorrorZone })))
const TableBoards = lazy(() => import('../../src/features/tables/TableBoards'))
const ParkDetailGeometry = lazy(() => import('../ParkDetailGeometry').then(module => ({ default: module.ParkDetailGeometry })))

const spawn = renewalMap?.data.physics.spawn.position

function atEntrance(pose = authoritativePose(useSession.getState().sessionId)) {
  return !pose || !!spawn && Math.hypot(pose.x-spawn[0], pose.z-spawn[2]) < 10 && Math.abs(pose.y-spawn[1]) < 2
}

export default function RenewalWorld({ quality, firstFrameAt, onDistantReady }: { quality: QualityPreset; firstFrameAt: RefObject<number | null>; onDistantReady: (ready: boolean) => void }) {
  const surface = useRef<Group>(null), interior = useRef<Group>(null)
  const loadInterior = useRef(false)
  const queuedAmbientShaders = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const [lakeProgress] = useState(createLakeProgress)
  const [distantReady, setDistantReady] = useState(() => !atEntrance() || welcomeFlight.active)
  const entry = useRef<{ start?: { x: number; z: number }; unlockNextFrame: boolean; queued: boolean }>({
    unlockNextFrame:false, queued:false,
  })

  useLayoutEffect(() => {
    if (distantReady) {
      onDistantReady(true)
      if (entry.current.queued) performance.mark('park-distant-facilities-mounted')
    }
  }, [distantReady, onDistantReady])

  useFrame(() => {
    const pending = entry.current
    if (distantReady || pending.queued) return
    const pose = authoritativePose(useSession.getState().sessionId)
    if (pose) pending.start ??= { x:pose.x, z:pose.z }
    const shownAt = firstFrameAt.current
    const lookedAround = Math.abs(Math.atan2(Math.sin(viewControls.yaw), Math.cos(viewControls.yaw))) > .08
      || Math.abs(viewControls.pitch - CAMERA.pitch) > .08
      || Math.abs(viewControls.distance - CAMERA.distance) > .5
    if (!atEntrance(pose) || welcomeFlight.active || lookedAround || pending.unlockNextFrame) {
      pending.queued = true
      performance.mark('park-distant-facilities-start')
      startTransition(() => setDistantReady(true))
      return
    }
    // Present one frame with the accepted walking pose before building distant meshes.
    if (shownAt !== null && pose && pending.start && Math.hypot(pose.x-pending.start.x, pose.z-pending.start.z) >= .08) {
      pending.unlockNextFrame = true
    }
  }, .6)
  useFrame(({ camera, scene, gl }) => {
    const own = avatars.get(useSession.getState().sessionId)
    const inside = !!own && secretCorridorContains(own.current)
    if (horrorState.open && !loadInterior.current) {
      loadInterior.current = true
      setLoaded(true)
    }
    const visible = inside && secretCorridorContains(camera.position)
      && !!interior.current?.getObjectByName('underground-horror-zone')
    if (surface.current) surface.current.visible = !visible
    if (interior.current) interior.current.visible = visible
    const daylight = scene.getObjectByName('renewal-exterior-lighting')
    if (daylight) daylight.visible = !visible
    if (firstFrameAt.current !== null && !queuedAmbientShaders.current) {
      queuedAmbientShaders.current = true
      // Let the driver link the ambient animations before their first draw.
      if (gl.extensions.has('KHR_parallel_shader_compile')) {
        for (const name of ['park-pigeons', 'mole-demo-impact-ring']) {
          const object = surface.current?.getObjectByName(name)
          if (object) gl.compile(object, camera, scene)
        }
      }
    }
  }, .5)
  return <group name="renewal-220-world">
    <group ref={surface} name="renewal-park-surface">
      <LakeProgress.Provider value={lakeProgress}>
      <LakeStreaming progress={lakeProgress} />
      <CityBackdrop distanceLod={RENEWAL_DISTANCE_LOD} />
      <ScenicDetails nightQuality={quality} distantReady={distantReady} live />
      <Buildings live distantReady={distantReady} />
      {TABLES.map(anchor => <TableFurniture key={anchor.id} anchor={anchor} nativeFurniture={!!anchor.pavilionId}>
        {distantReady && <Suspense fallback={null}><TableBoards anchor={anchor} nativeFurniture={!!anchor.pavilionId} /></Suspense>}
      </TableFurniture>)}
      {distantReady && <Suspense fallback={null}><ParkDetailGeometry jumpCourse={false} deferDistant /></Suspense>}
      </LakeProgress.Provider>
    </group>
    <group ref={interior} name="renewal-secret-corridor" visible={false}>
      {loaded && <Suspense fallback={null}><HorrorZone /></Suspense>}
    </group>
  </group>
}
