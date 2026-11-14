import { RENEWAL_DISTANCE_LOD } from '../../src/park/mapSelection'
import { EntranceBuilding } from '../EntrancePavilion'
import { ParkGachaKiosk } from '../ParkGachaKiosk'
import { RentalPairs } from '../RentalPairs'
import { EntranceLandscape } from '../EntranceLandscape'
import { CityBackdrop } from '../CityBackdrop'
import { ScenicGround } from '../ScenicGround'
import { OriginalPlaza, ParkBoundary } from '../ParkBoundary'
import { TableFurniture } from '../../src/features/tables/TableFurniture'
import { TABLES } from '../../src/park/mapConfig'
import { lazy, memo, startTransition, Suspense, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Object3D } from 'three'
import { authoritativePose, avatars, sampleAvatar, useSession } from '../../src/network/worldClient'
import { secretCorridorContains } from '../horrorPlan'
import { CAMERA, type QualityPreset } from '../../src/config'
import { renewalMap } from '../../src/park/renewalMap'
import { viewControls } from '../../src/world/cameraPerspective'
import { welcomeFlight } from '../../src/features/welcomeTour/flight'
import { createLakeProgress, LakeProgress } from '../lakeStages'
import { LakeStreaming } from './LakeStreaming'
import { PreviewTreeBatches } from '../PreviewTreeBatches'
import { inAnnex } from '../interiorAccess'
import { interiorVisit, visitScope } from '../interiorEvents'
import { preloadBungeoppangView } from '../../src/features/bungeoppang/loadBungeoppangView'
import { preloadGateSurroundings } from './preloadEntranceModels'

const HorrorZone = lazy(() => import('../HorrorZone').then(module => ({ default: module.HorrorZone })))
const AnnexDetails = lazy(() => import('../InteriorDetails').then(module => ({ default: module.AnnexDetails })))
const TableBoards = lazy(() => import('../../src/features/tables/TableBoards'))
const ParkDetailGeometry = lazy(() => import('../ParkDetailGeometry').then(module => ({ default: module.ParkDetailGeometry })))

const spawn = renewalMap?.data.physics.spawn.position
const bakery = renewalMap?.data.interactions.recreation?.find(anchor => anchor.id === 'fish-bread')
const finalStage = 8
const boardsPerStage = 4
const StableCityBackdrop = memo(CityBackdrop)
const StableScenicDetails = lazy(() => import('../ScenicDetails').then(module => ({ default: memo(module.ScenicDetails) })))
const StableScenicGround = memo(ScenicGround)
const StableEntranceLandscape = memo(EntranceLandscape)
const StableParkBoundary = memo(ParkBoundary)
const StableEntranceBuilding = memo(EntranceBuilding)
const StableGachaKiosk = memo(ParkGachaKiosk)
const StableRentalPairs = memo(RentalPairs)
const StableEntranceTrees = memo(PreviewTreeBatches)
const StableBuildings = lazy(() => import('../Buildings').then(module => ({ default: memo(module.Buildings) })))
const StableTable = memo(function StableTable({ index, boards }: { index: number; boards: boolean }) {
  const anchor = TABLES[index]!
  return <TableFurniture anchor={anchor} nativeFurniture={!!anchor.pavilionId}>
    {boards && <Suspense fallback={null}><TableBoards anchor={anchor} nativeFurniture={!!anchor.pavilionId} /></Suspense>}
  </TableFurniture>
})

function atEntrance(pose = authoritativePose(useSession.getState().sessionId)) {
  return !pose || !!spawn && Math.hypot(pose.x-spawn[0], pose.z-spawn[2]) < 10 && Math.abs(pose.y-spawn[1]) < 2
}

export default function RenewalWorld({ quality, firstFrameAt, onDistantReady, groundMounted, entryPresented }: {
  quality: QualityPreset
  firstFrameAt: RefObject<number | null>
  onDistantReady: (ready: boolean) => void
  groundMounted: RefObject<boolean>
  entryPresented: boolean
}) {
  const surface = useRef<Group>(null), interior = useRef<Group>(null), annex = useRef<Group>(null)
  const loadInterior = useRef(false)
  const displayedPose = useRef({ x: 0, y: 0, z: 0, yaw: 0 })
  const queuedAmbientShaders = useRef(false)
  const queuedBakery = useRef(false)
  const nightPool = useRef<{ group: Object3D; lights: Object3D[]; quality: QualityPreset } | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [lakeProgress] = useState(createLakeProgress)
  const [stage, setStage] = useState(() => !atEntrance() || welcomeFlight.active ? finalStage : 0)
  const distantReady = stage > 0
  const entry = useRef({
    start: undefined as { x: number; z: number } | undefined,
    requestedStage: stage, stableFrames: 0, committedAt: 0, movedAt: 0,
  })

  useLayoutEffect(() => {
    if (distantReady) onDistantReady(true)
  }, [distantReady, onDistantReady])

  useLayoutEffect(() => () => interiorVisit.reset(), [])

  useLayoutEffect(() => {
    entry.current.stableFrames = 0
    entry.current.committedAt = performance.now()
    if (stage > 0) performance.mark('park-distant-facilities-stage-' + stage)
    if (stage === finalStage) performance.mark('park-distant-facilities-mounted')
  }, [stage])

  useFrame((_, delta) => {
    const pending = entry.current
    if (stage === finalStage || pending.requestedStage !== stage) return
    const now = performance.now()
    if (stage > 0) {
      // Give rendering time to recover before admitting another batch of facilities.
      pending.stableFrames = delta <= 1 / 30 ? pending.stableFrames + 1 : 0
      if (now - pending.committedAt < 120 || (pending.stableFrames < 3 && now - pending.committedAt < 500)) return
      pending.requestedStage = stage + 1
      startTransition(() => setStage(stage + 1))
      return
    }
    const pose = authoritativePose(useSession.getState().sessionId)
    if (pose) pending.start ??= { x:pose.x, z:pose.z }
    const shownAt = firstFrameAt.current
    if (pose && pending.start && Math.hypot(pose.x - pending.start.x, pose.z - pending.start.z) > .08) {
      pending.start = { x: pose.x, z: pose.z }
      pending.movedAt = now
    }
    const lookedAround = Math.abs(Math.atan2(Math.sin(viewControls.yaw), Math.cos(viewControls.yaw))) > .08
      || Math.abs(viewControls.pitch - CAMERA.pitch) > .08
      || Math.abs(viewControls.distance - CAMERA.distance) > .5
    const settled = shownAt !== null && now - Math.max(shownAt, pending.movedAt) >= 2200
    const needsDistantView = !!pose && !!spawn && Math.hypot(pose.x - spawn[0], pose.z - spawn[2]) >= 26
    if (shownAt !== null && (needsDistantView || welcomeFlight.active || lookedAround || settled)) {
      pending.requestedStage = 1
      performance.mark('park-distant-facilities-start')
      preloadGateSurroundings()
      startTransition(() => setStage(1))
    }
  }, .6)
  useFrame(() => {
    if (!bakery || queuedBakery.current) return
    const pose = authoritativePose(useSession.getState().sessionId)
    if (!pose || Math.hypot(pose.x-bakery.reachPosition[0],pose.z-bakery.reachPosition[2]) > 22) return
    queuedBakery.current = true
    preloadBungeoppangView()
  })
  useFrame(({ camera, scene, gl }) => {
    const session = useSession.getState()
    const own = avatars.get(session.sessionId)
    let inside = false, inRoom = false
    const connected = session.status === 'connected' && session.mapCompatible && own?.connected
    const confirmed = connected && (secretCorridorContains(own.current) || interiorVisit.selected.length)
      ? authoritativePose(session.sessionId) : undefined
    const contains = secretCorridorContains(camera.position) ? secretCorridorContains
      : inAnnex(camera.position) ? inAnnex : undefined
    if (connected && !welcomeFlight.active && contains) {
      const serverPose = confirmed ?? authoritativePose(session.sessionId)
      const agreed = !!serverPose && contains(serverPose)
        && contains(sampleAvatar(own, performance.now(), displayedPose.current))
      inside = agreed && contains === secretCorridorContains
      inRoom = agreed && contains === inAnnex
    }
    if ((inside || inRoom) && !loadInterior.current) {
      loadInterior.current = true
      setLoaded(true)
    }
    const visible = inside && !!interior.current?.getObjectByName('underground-horror-zone')
    const ahead = visible && confirmed ? [
      camera.position.x - Math.sin(viewControls.yaw) * 1.45,
      confirmed.y,
      camera.position.z - Math.cos(viewControls.yaw) * 1.45,
    ] as const : undefined
    interiorVisit.update(visitScope(session.sessionId, session.roomId), confirmed, performance.now(), visible, ahead)
    const roomVisible = inRoom && !!annex.current?.getObjectByName('renewal-annex-interior')
    // NightLighting fades intensities to zero during the day. Keep its fixed
    // pool in the exterior shader layout so dusk never relinks the whole park
    // in one render pass. The exterior group's visibility still owns interiors.
    if (nightPool.current?.quality !== quality || !nightPool.current.group.parent) {
      const group = surface.current?.getObjectByName('night-lighting')
      nightPool.current = group ? { group, quality, lights: group.children.filter(light => light.userData.warmNightLight) } : undefined
    }
    for (const light of nightPool.current?.lights ?? []) light.visible = true
    if (surface.current) surface.current.visible = !visible && !roomVisible
    if (interior.current) interior.current.visible = visible
    if (annex.current) annex.current.visible = roomVisible
    const daylight = scene.getObjectByName('renewal-exterior-lighting')
    if (daylight) daylight.visible = !visible && !roomVisible
    if (stage >= 1 && !queuedAmbientShaders.current) {
      queuedAmbientShaders.current = true
      // Let the driver link the ambient animations before their first draw.
      if (gl.extensions.has('KHR_parallel_shader_compile')) {
        for (const name of ['mole-demo-impact-ring']) {
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
      <StableCityBackdrop distanceLod={RENEWAL_DISTANCE_LOD} />
      <StableScenicGround />
      <Suspense fallback={null}>
        <StableParkBoundary />
        <OriginalPlaza />
        <StableEntranceTrees />
        <StableEntranceBuilding id="pavilion" />
        <StableEntranceBuilding id="fortune" />
        <StableEntranceBuilding id="lottery" />
        <StableGachaKiosk live />
        <StableRentalPairs entrance />
        <StableEntranceLandscape quality={quality} showFitnessStations={entryPresented && stage >= 1} />
        <GroundMounted ready={groundMounted} />
      </Suspense>
      {entryPresented && stage >= 1 && <Suspense fallback={null}><StableScenicDetails includeGround={false} includeTrees={false} includeLandscape={false} distantReady={stage >= 2} live /></Suspense>}
      {entryPresented && stage >= 2 && <Suspense fallback={null}><StableBuildings live entrancePavilion={false} entranceDistricts={false} entranceFacilities={false} distantReady={distantReady} upperFacilitiesReady={stage >= 4}
        loadedRentalBatches={stage} /></Suspense>}
      {entryPresented && stage >= 3 && TABLES.map((anchor, index) => <Suspense key={anchor.id} fallback={null}>
        <StableTable index={index} boards={stage === finalStage || index < Math.max(0, stage - 3) * boardsPerStage} />
      </Suspense>)}
      {stage === finalStage && <Suspense fallback={null}><ParkDetailGeometry jumpCourse={false} deferDistant /></Suspense>}
      </LakeProgress.Provider>
    </group>
    <group ref={interior} name="renewal-secret-corridor" visible={false}>
      {loaded && <Suspense fallback={null}><HorrorZone /></Suspense>}
    </group>
    <group ref={annex} visible={false}>
      {loaded && <Suspense fallback={null}><AnnexDetails /></Suspense>}
    </group>
  </group>
}

function GroundMounted({ ready }: { ready: RefObject<boolean> }) {
  useLayoutEffect(() => {
    ready.current = true
    performance.mark('park-gate-ground-mounted')
    return () => { ready.current = false }
  }, [ready])
  return null
}
