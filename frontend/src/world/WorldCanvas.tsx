import { useGame } from '../game/store'
import { useSession } from '../network/worldClient'
import { seatScope, useTableLobby } from '../features/tableLobby/state'
import { MAP_RENDER_BUDGET } from './art/mapRenderProfile'
import { ParkSoundscape } from '../audio/ParkSoundscape'
import { lazy } from 'react'
import { GENERATED_PARK_ENABLED } from '../park/mapSelection'
import { LIVE_MAP_IDENTITY } from '../network/mapContract'
const GeneratedParkWorld=lazy(()=>import('../layout-preview/PreviewWorld').then(m=>({default:m.PreviewWorld})))
const ServiceJumpCourse=lazy(()=>import('../features/jumpmap/ServiceJumpCourse').then(m=>({default:m.ServiceJumpCourse})))
import { TableTablet3D } from '../features/tableLobby/TableTablet3D'
import { TABLET_ENABLED } from '../features/tableLobby/tabletFeature'
import { useFrame } from '@react-three/fiber'
import { memo, Suspense, useEffect, useMemo, useState } from 'react'
import { ACESFilmicToneMapping } from 'three'
import {
  CAMERA,
  QUALITY_PRESETS as QUALITY,
  effectiveDpr,
  type QualityPreset as QualityLevel,
} from '../config'
import { PlaceholderWorld } from './PlaceholderWorld'
import { ParkSun } from './ParkSun'
import { EnvironmentScene } from './EnvironmentScene'
import { ParkPigeons } from './pigeons/ParkPigeons'
import { NightLighting } from './NightLighting'
import { CameraRig } from './CameraRig'

import { Avatars } from './Avatars'
import { AvatarPoseFrame } from './AvatarPoseFrame'
import { FollowRopes } from '../features/follow/FollowRopes'
import { RouteArrows } from '../features/navigation/RouteArrows'
import { AvatarOverlays, type OverlayTargets } from './AvatarOverlays'
import { PerformanceProbe } from '../performance/PerformanceProbe'
import { AdaptiveResolution } from '../performance/AdaptiveResolution'
import { Canvas, preloadWorldAssets } from './worldAssets'
import { BungeoppangGrill } from '../features/bungeoppang/BungeoppangGrill'
import {ParkDebrisScene} from '../features/parkDebris/ParkDebrisScene'
import { getParkInteraction, interactWithPark } from '../features/interactions/parkInteraction'
import { prepareScene } from './prepareScene'
import { warmParkGeometry } from '../park/loadParkGeometry'
import { jumpmapPreparationViews } from '../features/jumpmap/preparation'
import { RpsRouletteCabinet } from '../features/rpsRoulette/RpsRouletteCabinet'

preloadWorldAssets()

const interactWithRankingBoard = () => {
  if (getParkInteraction()?.id === 'layout-photo') interactWithPark()
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
  const boardPlayer = useGame(s => s.game?.role === 'PLAYER' && (s.game?.omok?.status === 'PLAYING' || s.game?.alkkagi?.status === 'PLAYING'))
  const boardSpectator = useGame(s => s.game?.role === 'SPECTATOR' && (s.game?.omok?.status === 'PLAYING' || s.game?.alkkagi?.status === 'PLAYING'))
  const scope = useSession(seatScope), lookScope = useTableLobby(s=>s.lookScope), spectatorView = useTableLobby(s=>s.spectatorView)
  const boardDetail = boardPlayer && !!scope && scope !== lookScope || boardSpectator && spectatorView === 'board'
  const preset = QUALITY[quality]
  const overlayTargets = useMemo<OverlayTargets>(() => new Map(), [])
  const [visible, setVisible] = useState(() => !document.hidden)
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
    : GENERATED_PARK_ENABLED ? Math.min(dpr, MAP_RENDER_BUDGET.maxDpr, Math.sqrt(MAP_RENDER_BUDGET.maxPixels / Math.max(1, viewport.width * viewport.height))) : dpr
  return (
    <>
      <Canvas
        // Keep sockets alive in hidden tabs; authoritative match state still arrives.
        frameloop={!visible || !active ? 'never' : 'always'}
        shadows={!GENERATED_PARK_ENABLED&&preset.shadows ? 'percentage' : false}
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
          <EnvironmentScene />
          <ParkSoundscape />
          <ParkSun quality={quality} />
          <NightLighting quality={GENERATED_PARK_ENABLED ? 'low' : quality} />
          <Suspense fallback={null}>
            {GENERATED_PARK_ENABLED?<group name="park-service-map" userData={{...LIVE_MAP_IDENTITY}}><GeneratedParkWorld live onRankingBoardInteract={interactWithRankingBoard}/></group>:<PlaceholderWorld quality={quality} />}
            {GENERATED_PARK_ENABLED && <ServiceJumpCourse />}
            <RpsRouletteCabinet />
            <SceneReady onReady={onReady} />
          </Suspense>
          <Avatars overlayTargets={overlayTargets} />
          <FollowRopes />
          <RouteArrows />
          <BungeoppangGrill />
          <ParkDebrisScene />

          {!GENERATED_PARK_ENABLED&&<ParkPigeons quality={quality} />}
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
