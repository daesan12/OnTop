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
import { FollowRopes } from '../features/follow/FollowRopes'
import { RouteArrows } from '../features/navigation/RouteArrows'
import { AvatarOverlays, type OverlayTargets } from './AvatarOverlays'
import { PerformanceProbe } from '../performance/PerformanceProbe'
import { AdaptiveResolution } from '../performance/AdaptiveResolution'
import { Canvas, preloadWorldAssets } from './worldAssets'
import { BungeoppangGrill } from '../features/bungeoppang/BungeoppangGrill'
import { prepareScene } from './prepareScene'
import { warmParkGeometry } from '../park/loadParkGeometry'

preloadWorldAssets()

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
      void prepareScene(gl, scene, camera, () => !startup.disposed).then(
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
  return (
    <>
      <Canvas
        // Keep sockets alive in hidden tabs; authoritative match state still arrives.
        frameloop={!visible || !active ? 'never' : 'always'}
        shadows={preset.shadows ? 'percentage' : false}
        dpr={dpr}
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
        <EnvironmentScene />
        <ParkSun quality={quality} />
        <NightLighting quality={quality} />
        <Suspense fallback={null}>
          <PlaceholderWorld quality={quality} />
          <SceneReady onReady={onReady} />
        </Suspense>
        <Avatars overlayTargets={overlayTargets} />
        <FollowRopes />
        <RouteArrows />
        <BungeoppangGrill />

        <ParkPigeons quality={quality} />
        <CameraRig />
        {TABLET_ENABLED && <TableTablet3D />}
        <PerformanceProbe />
        <AdaptiveResolution ceiling={dpr} />
      </Canvas>
      <AvatarOverlays targets={overlayTargets} />
    </>
  )
})
