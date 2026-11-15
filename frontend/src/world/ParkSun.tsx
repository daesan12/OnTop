import { useMemo, useRef } from 'react'
import { SIMPLE_MAP } from './art/mapRenderProfile'
import { simpleEnvironmentPalette } from './simpleEnvironmentPalette'
import { useFrame } from '@react-three/fiber'
import { Color, type DirectionalLight } from 'three'
import { environmentFrame as environment } from './environmentState'
import { QUALITY_PRESETS, smoothRange, type QualityPreset } from '../config'
import { avatars, useSession } from '../network/worldClient'
import { ShadowCadence, SHADOW_HZ } from '../performance/shadowCadence'

/** One local shadow map follows the visitor; the whole park never needs a giant map. */
export function ParkSun({ quality, serviceNightLight = SIMPLE_MAP }: { quality: QualityPreset; serviceNightLight?: boolean }) {
  const light = useRef<DirectionalLight>(null),
    preset = QUALITY_PRESETS[quality]
  const cadence = useMemo(
    () => new ShadowCadence(SHADOW_HZ[quality]),
    [quality],
  )
  const colors = useMemo(
    () => ({
      day: new Color('#fff3df'),
      dusk: new Color('#ffc393'),
      night: new Color(serviceNightLight ? simpleEnvironmentPalette.nightKeyColor : '#a2b3cc'),
    }),
    [serviceNightLight],
  )
  useFrame((_, delta) => {
    if (!light.current) return
    const visitor = avatars.get(useSession.getState().sessionId)?.current
    const x = Math.round((visitor?.x ?? 0) / 2) * 2,
      y = visitor?.y ?? 0,
      z = Math.round((visitor?.z ?? 0) / 2) * 2
    light.current.position.set(
      x + environment.sunX * 75,
      y + (serviceNightLight ? Math.max(simpleEnvironmentPalette.minimumKeyElevation, environment.sunY) : environment.sunY) * 75,
      z + environment.sunZ * 75,
    )
    light.current.intensity = 2.5 * smoothRange(0, 0.35, environment.elevation)
      + (serviceNightLight ? environment.night * simpleEnvironmentPalette.nightKey : 0)
    const refreshShadow = cadence.advance(
      delta,
      preset.shadows && light.current.intensity > 0.001,
    )
    // Even at night, an enabled PCF shadow sampler needs a real depth texture.
    // Initialize once on entry/quality changes, then keep the nighttime pause.
    // Otherwise WebGL rejects the surface draws with INVALID_OPERATION.
    if (preset.shadows && (light.current.shadow.map === null || refreshShadow))
      light.current.shadow.needsUpdate = true
    light.current.color
      .copy(colors.night)
      .lerp(colors.day, environment.daylight)
      .lerp(colors.dusk, environment.twilight * 0.55)
    light.current.target.position.set(x, y, z)
    light.current.target.updateMatrixWorld()
  })
  return (
    <directionalLight
      ref={light}
      layers-mask={3}
      key={quality}
      position={[-35, 70, 40]}
      intensity={2.5}
      color="#fff3df"
      castShadow={preset.shadows}
      shadow-autoUpdate={false}
      shadow-mapSize={[preset.shadowSize, preset.shadowSize]}
      shadow-camera-left={-45}
      shadow-camera-right={45}
      shadow-camera-top={45}
      shadow-camera-bottom={-45}
      shadow-camera-near={1}
      shadow-camera-far={170}
      shadow-bias={-0.001}
      shadow-normalBias={0.04}
    />
  )
}
