import { BALLOON_RIDE_ENABLED, RENEWAL_DISTANCE_LOD } from '../../src/park/mapSelection'
import { BalloonWayfindingLights } from '../../src/features/balloon/BalloonWayfinding'
import { EntranceAssetsReady, EntranceBuilding } from '../EntrancePavilion'
import { EntranceLandscape } from '../EntranceLandscape'
import { RentalPairs } from '../RentalPairs'
import { CityBackdrop } from '../CityBackdrop'
import { ScenicGround } from '../ScenicGround'
import { OriginalPlaza, ParkBoundary } from '../ParkBoundary'
import { TableFurniture } from '../../src/features/tables/TableFurniture'
import { TABLES } from '../../src/park/mapConfig'
import { STONE_RUMBLE_ANCHOR_ID } from '../../src/game/stone-rumble/entrance'
import { STONE_RUMBLE_ENABLED } from '../../src/features/tableLobby/model'
import { lazy, memo, Suspense, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, type Group } from 'three'
import { authoritativePose, avatars, sampleAvatar, useSession } from '../../src/network/worldClient'
import { secretCorridorContains } from '../horrorPlan'
import type { QualityPreset } from '../../src/config'
import { renewalMap } from '../../src/park/renewalMap'
import { viewControls } from '../../src/world/cameraPerspective'
import { welcomeFlight } from '../../src/features/welcomeTour/flight'
import { createLakeProgress, LakeProgress, LakeStage } from '../lakeStages'
import { LakeStreaming } from './LakeStreaming'
import { PreviewTreeBatches } from '../PreviewTreeBatches'
import { inAnnex } from '../interiorAccess'
import { interiorVisit, visitScope } from '../interiorEvents'
import { preloadBungeoppangView } from '../../src/features/bungeoppang/loadBungeoppangView'
import { preloadJumpRopeView } from '../../src/features/jumpRope/loadJumpRopeView'
import { useEntryStages } from './useEntryStages'
import { EntranceFacility, EntrancePartReady, EntranceReadiness } from './EntranceReadiness'
import { collectJumpViewDrawables } from '../../src/features/jumpmap/preparation'
import { useJumpmap } from '../../src/features/jumpmap/state'
import { site } from '../plan'
import { WinterScene } from '../../src/features/winter/WinterScene'
import { ParkGachaKiosk } from '../ParkGachaKiosk'
import { ParkMoleShop } from '../ParkMoleShop'

const HorrorZone = lazy(() => import('../HorrorZone').then(module => ({ default: module.HorrorZone })))
const AnnexDetails = lazy(() => import('../InteriorDetails').then(module => ({ default: module.AnnexDetails })))
const TableBoards = lazy(() => import('../../src/features/tables/TableBoards'))
const StoneRumbleEntranceStele = lazy(() => import('../../src/game/stone-rumble/StoneRumbleEntranceStele'))
const ParkDetailGeometry = lazy(() => import('../ParkDetailGeometry').then(module => ({ default: module.ParkDetailGeometry })))
const RenewalParkAdvertising = lazy(() => import('./RenewalParkAdvertising').then(module => ({ default: module.RenewalParkAdvertising })))

const spawn = renewalMap?.data.physics.spawn.position
const jumpEntrance = renewalMap?.data.jumpCourse?.start
const bakery = renewalMap?.data.interactions.recreation?.find(anchor => anchor.id === 'fish-bread')
const jumpRopeShop = renewalMap?.data.interactions.recreation?.find(anchor => anchor.id === 'pigeon-jump-rope')
const finalStage = 8
const boardsPerStage = 4
const balloonStation = site('balloon')
const StableCityBackdrop = memo(CityBackdrop)
const StableScenicDetails = lazy(() => import('../ScenicDetails').then(module => ({ default: memo(module.ScenicDetails) })))
const StableScenicGround = memo(ScenicGround)
const StableEntranceLandscape = memo(EntranceLandscape)
const StableParkBoundary = memo(ParkBoundary)
const StableEntranceBuilding = memo(EntranceBuilding)
const StableGachaKiosk = memo(ParkGachaKiosk)
const StableMoleShop = memo(ParkMoleShop)
const StableRentalPairs = memo(RentalPairs)
const StableEntranceTrees = memo(PreviewTreeBatches)
const StableBuildings = lazy(() => import('../Buildings').then(module => ({ default: memo(module.Buildings) })))
const StableTable = memo(function StableTable({ index, boards }: { index: number; boards: boolean }) {
  const anchor = TABLES[index]!
  return <>
    <TableFurniture anchor={anchor} nativeFurniture={!!anchor.pavilionId}>
      {boards && <Suspense fallback={null}><TableBoards anchor={anchor} nativeFurniture={!!anchor.pavilionId} /></Suspense>}
    </TableFurniture>
    {STONE_RUMBLE_ENABLED && anchor.id === STONE_RUMBLE_ANCHOR_ID &&
      <Suspense fallback={null}><StoneRumbleEntranceStele anchor={anchor} /></Suspense>}
  </>
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
  const jumpViewDrawables = useRef<Object3D[] | undefined>(undefined)
  const queuedLakeViewShaders = useRef(false)
  const jumpViewIndex = useRef(0)
  const jumpViewSelection = useRef<Object3D | undefined>(undefined)
  const queuedBakery = useRef(false)
  const queuedJumpRope = useRef(false)
  const nightPool = useRef<{ group: Object3D; lights: Object3D[]; quality: QualityPreset } | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [lakeProgress] = useState(createLakeProgress)
  const [stage, setStage] = useState(() => !atEntrance() || welcomeFlight.active ? finalStage : 0)
  const distantReady = stage > 0
  const entranceReadiness = useMemo(() => new EntranceReadiness(groundMounted), [groundMounted])
  useEntryStages({ stage, finalStage, firstFrameAt, onStage: setStage })

  useLayoutEffect(() => {
    // The jump-course scene is another large batch. Do not start it alongside
    // the first scenery batch while entrance locomotion is becoming interactive.
    if (entryPresented && stage === finalStage) onDistantReady(true)
  }, [stage, entryPresented, onDistantReady])

  useLayoutEffect(() => () => interiorVisit.reset(), [])

  useFrame(() => {
    const needsBakery = bakery && !queuedBakery.current
    const needsJumpRope = jumpRopeShop && !queuedJumpRope.current
    if (firstFrameAt.current === null || (!needsBakery && !needsJumpRope)) return
    const pose = authoritativePose(useSession.getState().sessionId)
    if (!pose) return
    if (needsBakery && Math.hypot(pose.x-bakery.reachPosition[0],pose.z-bakery.reachPosition[2]) <= 32) {
      queuedBakery.current = true
      preloadBungeoppangView()
    }
    if (needsJumpRope && Math.hypot(pose.x-jumpRopeShop.reachPosition[0],pose.z-jumpRopeShop.reachPosition[2]) <= 28) {
      queuedJumpRope.current = true
      preloadJumpRopeView()
    }
  })
  useFrame(({ camera, scene, gl }) => {
    const root = surface.current
    if (!jumpEntrance || stage < finalStage || !root?.visible || !gl.extensions.has('KHR_parallel_shader_compile')) return
    const { sessionId } = useSession.getState()
    const pose = avatars.get(sessionId)?.current
    if (!pose) return
    const nearJumpEntrance = pose.y <= jumpEntrance.y + 4
      && Math.hypot(pose.x - jumpEntrance.x, pose.z - jumpEntrance.z) <= 32
    const { owner, run } = useJumpmap.getState()
    const running = owner === sessionId && !!run
    if (!nearJumpEntrance && !running) return
    if (nearJumpEntrance) jumpViewDrawables.current ??= collectJumpViewDrawables(root, camera)

    // The lake's streamed props did not exist when the entrance views were
    // collected, so queue the steep kite views after those stages mount.
    if (running && !queuedLakeViewShaders.current && lakeProgress.getStage() === LakeStage.Boats) {
      queuedLakeViewShaders.current = true
      const lakeDrawables = collectJumpViewDrawables(root, camera, true)
      const queue = jumpViewDrawables.current ??= []
      // Keep every queued object once, including those compiled at the entrance.
      const queued = new Set(queue)
      for (const object of lakeDrawables) if (!queued.has(object)) queue.push(object)
    }
    const objects = jumpViewDrawables.current
    const index = jumpViewIndex.current
    if (!objects || index >= objects.length) return
    const selection = jumpViewSelection.current ??= new Object3D()
    const deadline = performance.now() + 2
    let end = index
    // Submit only a small amount of work each frame on the approach.
    do {
      const object = objects[end++]!
      if (!object.parent) continue
      selection.traverse = visit => visit(object)
      gl.compile(selection, camera, scene)
    } while (end < objects.length && performance.now() < deadline)
    jumpViewIndex.current = end
    if (end === objects.length) performance.mark('park-jump-view-shaders-submitted')
  }, .8)
  useFrame(({ camera, scene }) => {
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
  }, .5)
  return <group name="renewal-220-world">
    <group ref={surface} name="renewal-park-surface">
      {/* Inserting lights in stage four would relink shaders across the visible park. */}
      {BALLOON_RIDE_ENABLED && <BalloonWayfindingLights x={balloonStation.x} z={balloonStation.z}
        lit={entryPresented && stage >= 4} />}
      <LakeProgress.Provider value={lakeProgress}>
      <LakeStreaming progress={lakeProgress} />
      <StableCityBackdrop distanceLod={RENEWAL_DISTANCE_LOD} />
      <StableScenicGround />
      <Suspense fallback={null}>
        <EntranceAssetsReady>
          <WinterScene low={quality === 'low'} />
          <StableParkBoundary />
          <OriginalPlaza />
          <StableEntranceTrees live />
          <StableEntranceBuilding id="pavilion" />
          {/* Include nearby facilities and decorations in the entrance shader pass. */}
          <StableEntranceBuilding id="fortune" />
          <StableEntranceBuilding id="lottery" />
          <EntranceFacility readiness={entranceReadiness} part="gacha"><StableGachaKiosk live /></EntranceFacility>
          <EntranceFacility readiness={entranceReadiness} part="mole"><StableMoleShop optimizedReady={entryPresented && stage >= 3} /></EntranceFacility>
          <StableRentalPairs area="gate" />
          <StableRentalPairs area="nearby" />
          <StableEntranceLandscape quality={quality} showFitnessStations />
          <EntrancePartReady readiness={entranceReadiness} part="ground" />
        </EntranceAssetsReady>
      </Suspense>
      {entryPresented && stage >= 1 && (
        <>
          <Suspense fallback={null}><RenewalParkAdvertising /></Suspense>
          <Suspense fallback={null}><StableScenicDetails includeGround={false} includeTrees={false} includeLandscape={false} distantReady={stage >= 2} live /></Suspense>
        </>
      )}
      {entryPresented && stage >= 2 && <Suspense fallback={null}><StableBuildings live entrancePavilion={false} entranceDistricts={false} entranceFacilities={false} distantReady={distantReady} upperFacilitiesReady={stage >= 4}
        loadedRentalBatches={stage} /></Suspense>}
      {entryPresented && stage >= 3 && TABLES.map((anchor, index) => <Suspense key={anchor.id} fallback={null}>
        <StableTable index={index} boards={stage === finalStage || index < Math.max(0, stage - 3) * boardsPerStage} />
      </Suspense>)}
      {entryPresented && stage === finalStage && <Suspense fallback={null}><ParkDetailGeometry jumpCourse={false} deferDistant /></Suspense>}
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
