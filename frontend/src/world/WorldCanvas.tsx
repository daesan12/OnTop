import { useGame } from '../game/store'
import { useSession } from '../network/worldClient'
import { seatScope, useTableLobby } from '../features/tableLobby/state'
import { MAP_RENDER_BUDGET } from './art/mapRenderProfile'
import { ParkSoundscape } from '../audio/ParkSoundscape'
import { lazy } from 'react'
import { GENERATED_PARK_ENABLED, JUMPMAP_ENABLED, RENEWAL_GATE_STARTUP, RENEWAL_PARK_ENABLED } from '../park/mapSelection'
import { loadRenewalParkWorld } from '../park/loadRenewalParkWorld'
import { LIVE_MAP_IDENTITY } from '../network/mapContract'
import { ShaderPreparedGroup } from '../../park-renewal-preview/live/ShaderPreparedGroup'
import { useJumpmap } from '../features/jumpmap/state'
const GeneratedParkWorld=lazy(()=>import('../layout-preview/PreviewWorld').then(m=>({default:m.PreviewWorld})))
const RenewalParkWorld=RENEWAL_PARK_ENABLED ? lazy(loadRenewalParkWorld) : null
const ServiceJumpCourse=lazy(()=>import('../features/jumpmap/ServiceJumpCourse').then(m=>({default:m.ServiceJumpCourse})))
import { TableTablet3D } from '../features/tableLobby/TableTablet3D'
import { TABLET_ENABLED } from '../features/tableLobby/tabletFeature'
import { useFrame } from '@react-three/fiber'
import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping } from 'three'
import {
  CAMERA,
  QUALITY_PRESETS as QUALITY,
  effectiveDpr,
  type QualityPreset as QualityLevel,
} from '../config'
import { ParkSun } from './ParkSun'
import { EnvironmentScene } from './EnvironmentScene'
import { ParkPigeons } from './pigeons/ParkPigeons'
import { NightLighting } from './NightLighting'
import { OmokFocusLighting } from './boardFocusLighting'
import { CameraRig } from './CameraRig'
import { ParkXRBridge } from '../features/parkXR/ParkXRBridge'

import { Avatars } from './Avatars'
import {JokeJudgeActor} from '../features/ai/JokeJudgeActor'
import { CompanionActors } from '../features/ai/CompanionActors'
import { PoliceNpcs } from '../features/ai/PoliceNpcs'
import { AvatarPoseFrame } from './AvatarPoseFrame'
import { FollowRopes } from '../features/follow/FollowRopes'
import { RouteArrows } from '../features/navigation/RouteArrows'
import { AvatarOverlays, type OverlayTargets } from './AvatarOverlays'
import { PerformanceProbe } from '../performance/PerformanceProbe'
import { AdaptiveResolution } from '../performance/AdaptiveResolution'
import { Canvas, preloadWorldAssets } from './worldAssets'
import {ParkDebrisScene} from '../features/parkDebris/ParkDebrisScene'
import { getParkInteraction, interactWithPark } from '../features/interactions/parkInteraction'
import { prepareScene, prepareVisibleScenePrograms } from './prepareScene'
import { warmParkGeometry } from '../park/loadParkGeometry'
import { jumpmapPreparationViews } from '../features/jumpmap/preparation'
import { useGachaOverlay } from '../features/gacha/view'
import { useFortune } from '../features/fortune/state'

import { useBungeoppang } from '../features/bungeoppang/store'

const PlaceholderWorld = lazy(() => import('./PlaceholderWorld').then(module => ({ default: module.PlaceholderWorld })))
const RpsRouletteCabinet = lazy(() => import('../features/rpsRoulette/RpsRouletteCabinet').then(module => ({ default: module.RpsRouletteCabinet })))
const BungeoppangGrill = lazy(() => import('../features/bungeoppang/BungeoppangGrill').then(module => ({ default: module.BungeoppangGrill })))

preloadWorldAssets()

const interactWithRankingBoard = () => {
  if (getParkInteraction()?.id === 'layout-photo') interactWithPark()
}

function HoldAutomaticRender() {
  // Claim R3F's default render pass even while the park subtree is suspended.
  // SceneReady draws the gate once its camera, lighting and visible meshes agree.
  useFrame(() => {}, 1)
  return null
}

function SceneReady({ onReady }: { onReady: () => void }) {
  const startup = useMemo(
    () => ({
      phase: 'cold' as 'cold' | 'compiling' | 'ready' | 'presented',
      disposed: false,
    }),
    [],
  )
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => {
    startup.disposed = false
    return () => {
      startup.disposed = true
    }
  }, [startup])
  useFrame(({ gl, scene, camera }) => {
    if (startup.phase === 'cold' && RENEWAL_PARK_ENABLED) {
      performance.mark('park-scene-prepare-start')
      if (RENEWAL_GATE_STARTUP && gl.extensions.has('KHR_parallel_shader_compile')) {
        startup.phase = 'compiling'
        const ready = () => { if (!startup.disposed) startup.phase = 'ready' }
        // Keep the gate image up while the visible programs link together.
        // A preparation failure falls back to the same first render.
        void prepareVisibleScenePrograms(gl, scene, camera, () => !startup.disposed).then(ready, ready)
        return
      }
      startup.phase = 'ready'
    }
    if (startup.phase === 'cold') {
      startup.phase = 'compiling'
      // Priority 1 runs after lighting, occlusion and camera updates. Compile all
      // original materials together with KHR_parallel_shader_compile where
      // supported, before a draw would synchronously wait on each program.
      // Keep shader error reporting enabled, including in production.
      // Scene modules and critical textures are available now. A cold optional
      // geometry file can warm the next visit without competing with those loads.
      warmParkGeometry()
      void prepareScene(gl, scene, camera, () => !startup.disposed, {
        warmGeometry: GENERATED_PARK_ENABLED, warmLighting: GENERATED_PARK_ENABLED,
        views: GENERATED_PARK_ENABLED ? jumpmapPreparationViews : undefined,
      }).then(
        () => {
          if (!startup.disposed) startup.phase = 'ready'
        },
        (cause: unknown) => {
          if (!startup.disposed)
            setError(cause instanceof Error ? cause : new Error(String(cause)))
        },
      )
      return
    }
    if (startup.phase === 'compiling') return
    // Owning this render pass prevents R3F from drawing the scene while shaders
    // are pending. Geometry, resolution, shadows and subsequent frames are unchanged.
    if (startup.phase === 'ready' && RENEWAL_GATE_STARTUP) performance.mark('park-gate-first-draw-start')
    gl.render(scene, camera)
    if (startup.phase === 'ready') {
      performance.mark('park-scene-presented')
      startup.phase = 'presented'
      onReady()
    }
  }, 1)
  if (error) throw error
  return null
}

// HUD/chat updates must not reconcile the static park or upload instance data again.
export const WorldCanvas = memo(function WorldCanvas({
  quality,
  active,
  onReady,
}: {
  quality: QualityLevel
  active: boolean
  onReady: () => void
}) {
  const [distantReady, setDistantReady] = useState(false)
  const [jumpPreviewReady, setJumpPreviewReady] = useState(false)
  const jumpRunActive = useJumpmap(state => !!state.run)
  const breadActive = useBungeoppang(state => state.phase !== 'idle')
  const firstFrameAt = useRef<number | null>(null)
  const jumpPreviewTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(jumpPreviewTimer.current), [])
  const reportFirstFrame = useCallback(() => {
    firstFrameAt.current = performance.now()
    if (RENEWAL_PARK_ENABLED) jumpPreviewTimer.current = window.setTimeout(() => setJumpPreviewReady(true), 1500)
    onReady()
  }, [onReady])
  const boardPlayer = useGame(s => s.game?.role === 'PLAYER' && (s.game?.omok?.status === 'PLAYING' || s.game?.alkkagi?.status === 'PLAYING'))
  const boardSpectator = useGame(s => s.game?.role === 'SPECTATOR' && (s.game?.omok?.status === 'PLAYING' || s.game?.alkkagi?.status === 'PLAYING'))
  const scope = useSession(seatScope), lookScope = useTableLobby(s=>s.lookScope), spectatorView = useTableLobby(s=>s.spectatorView)
  const boardDetail = boardPlayer && !!scope && scope !== lookScope || boardSpectator && spectatorView === 'board'
  const preset = QUALITY[quality]
  const overlayTargets = useMemo<OverlayTargets>(() => new Map(), [])
  const [visible, setVisible] = useState(() => !document.hidden)
  const gachaOverlay = useGachaOverlay(s => s.open)
  const fortuneOpen = useFortune(s => s.open)
  const [viewport, setViewport] = useState(() => ({
    width: innerWidth,
    height: Math.max(620, innerHeight),
    dpr: devicePixelRatio,
  }))
  useEffect(() => {
    const resize = () =>
      setViewport({
        width: innerWidth,
        height: Math.max(620, innerHeight),
        dpr: devicePixelRatio,
      })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    const changed = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', changed)
    return () => document.removeEventListener('visibilitychange', changed)
  }, [])
  const dpr = effectiveDpr(
    quality,
    viewport.width,
    viewport.height,
    viewport.dpr,
  )
  // 판만 표시하는 시점에서는 공원용720p 예산 대신 최대FullHD/기기DPR1을 사용한다.
  // 주변 보기/종료 시 기존 사용자 화질 예산으로 돌아간다.
  const renderDpr = boardDetail ? effectiveDpr('high', viewport.width, viewport.height, viewport.dpr)
    : (GENERATED_PARK_ENABLED || RENEWAL_PARK_ENABLED) ? Math.min(dpr, MAP_RENDER_BUDGET.maxDpr, Math.sqrt(MAP_RENDER_BUDGET.maxPixels / Math.max(1, viewport.width * viewport.height))) : dpr
  return (
    <>
      <Canvas
        // Keep sockets alive in hidden tabs; authoritative match state still arrives.
        frameloop={!visible || !active || gachaOverlay || (fortuneOpen && firstFrameAt.current !== null) ? 'never' : 'always'}
        shadows={!GENERATED_PARK_ENABLED&&!RENEWAL_PARK_ENABLED&&preset.shadows ? 'percentage' : false}
        dpr={renderDpr}
        camera={{
          position: [110, 115, 138],
          fov: CAMERA.fov,
          near: 0.1,
          // Keep the 650m mountain silhouette and 600m sky visible from park edges.
          far: 800,
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: ACESFilmicToneMapping,
        }}
        fallback={
          <div className="unsupported">
            WebGL 2를 사용할 수 없습니다. 브라우저의 하드웨어 가속 설정을 확인해
            주세요.
          </div>
        }
      >
        <AvatarPoseFrame>
          {RENEWAL_GATE_STARTUP && <HoldAutomaticRender />}
          <ParkXRBridge />
          <group name={RENEWAL_PARK_ENABLED ? 'renewal-exterior-lighting' : undefined}>
            <EnvironmentScene matchServiceBrightness={RENEWAL_PARK_ENABLED} />
            <ParkSun quality={quality} serviceNightLight={RENEWAL_PARK_ENABLED || undefined} />
          </group>
          <ParkSoundscape />
          {!RENEWAL_PARK_ENABLED && <NightLighting quality={GENERATED_PARK_ENABLED ? 'low' : quality} />}
          <Suspense fallback={null}>
            {RenewalParkWorld ? <group name="park-service-map" userData={{...LIVE_MAP_IDENTITY}}><RenewalParkWorld quality={quality} firstFrameAt={firstFrameAt} onDistantReady={setDistantReady} /></group>
              : GENERATED_PARK_ENABLED ? <group name="park-service-map" userData={{...LIVE_MAP_IDENTITY}}><GeneratedParkWorld live onRankingBoardInteract={interactWithRankingBoard}/></group>
                : <PlaceholderWorld quality={quality} />}
            {JUMPMAP_ENABLED && !RENEWAL_PARK_ENABLED && <ServiceJumpCourse />}
            {!RENEWAL_PARK_ENABLED && <RpsRouletteCabinet />}
            {/* Same Suspense boundary as SceneReady: both use positive frame priorities around its render. */}
            <OmokFocusLighting />
            <SceneReady onReady={reportFirstFrame} />
          </Suspense>
          {RENEWAL_PARK_ENABLED && (distantReady || jumpPreviewReady || jumpRunActive) &&
            <Suspense fallback={null}><ShaderPreparedGroup priority={.75}><ServiceJumpCourse /></ShaderPreparedGroup></Suspense>}
          <Avatars overlayTargets={overlayTargets} firstGateFrameAt={RENEWAL_GATE_STARTUP ? firstFrameAt : undefined} />
        <PoliceNpcs />
        <CompanionActors />
        <JokeJudgeActor />          <FollowRopes />
          <RouteArrows />
        {breadActive && <Suspense fallback={null}><BungeoppangGrill /></Suspense>}
          <ParkDebrisScene />

          {!GENERATED_PARK_ENABLED&&!RENEWAL_PARK_ENABLED&&<ParkPigeons quality={quality} />}
          <CameraRig />
          {TABLET_ENABLED && <TableTablet3D />}
          <PerformanceProbe />
          {!boardDetail && <AdaptiveResolution ceiling={renderDpr} />}
        </AvatarPoseFrame>
      </Canvas>
      <AvatarOverlays targets={overlayTargets} />
    </>
  )
})
