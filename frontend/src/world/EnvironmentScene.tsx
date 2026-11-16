import { ParkSky } from './ParkSky'
import { SIMPLE_MAP } from './art/mapRenderProfile'
import { SimpleParkEnvironment } from './SimpleParkEnvironment'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { outdoorReflectionMap } from './art/ornamentTextures'
import { sampleDay } from '../config'
import {
  Color,
  Fog,
  type HemisphereLight,
} from 'three'
import {
  environmentFrame as frame,
  updateEnvironmentFrame,
} from './environmentState'

type EnvironmentProps = { fixedTime?: number; matchServiceBrightness?: boolean }

function DetailedEnvironmentScene({ fixedTime, matchServiceBrightness }: EnvironmentProps = {}) {
  const scene = useThree((state) => state.scene)
  useEffect(() => {
    const previous = scene.environment
    const intensity = scene.environmentIntensity
    scene.environment = outdoorReflectionMap
    return () => {
      scene.environment = previous
      scene.environmentIntensity = intensity
    }
  }, [scene])
  const ambient = useRef<HemisphereLight>(null)
  const values = useMemo(
    () => ({
      dayHorizon: new Color('#c7d8e3'),
      clearHorizon: new Color('#c4edff'),
      nightHorizon: new Color('#293849'),
      sunset: new Color('#d7a28a'),
      dayLight: new Color('#e4edf6'),
      nightLight: new Color('#c9d7eb'),
      ground: new Color('#747464'),
      nightGround: new Color('#b1aa9a'),
      fog: new Fog('#c7d8e3', 220, 750),
    }),
    [],
  )
  useFrame(({ scene, gl }) => {
    if(fixedTime===undefined)updateEnvironmentFrame(performance.now())
    else Object.assign(frame,sampleDay(fixedTime),{serverTime:fixedTime,seconds:performance.now()/1000})
    const clearDay = matchServiceBrightness ? frame.daylight * (1 - frame.twilight) : 0
    values.fog.color.copy(values.nightHorizon).lerp(values.dayHorizon, frame.daylight)
      .lerp(values.sunset, frame.twilight * 0.65).lerp(values.clearHorizon, clearDay)
    scene.fog = values.fog
    if (ambient.current) {
      ambient.current.color
        .copy(values.nightLight)
        .lerp(values.dayLight, frame.daylight)
      ambient.current.groundColor
        .copy(values.nightGround)
        .lerp(values.ground, frame.daylight)
      // Balance diffuse fill against the shared outdoor reflection lighting.
      ambient.current.intensity = 1.45 + frame.daylight * 0.12
    }
    scene.environmentIntensity = 0.08 + frame.daylight * 0.42
    if (matchServiceBrightness) {
      // Keep the detailed sky and materials while matching the service map's paving exposure.
      gl.toneMappingExposure = 0.72 + 0.095 * frame.night
    }
    // Keep diagnostics on scene metadata, without subscriptions or React reconciliation.
    scene.userData.environment = frame
  }, -100)
  return (
    <>
      <ParkSky matchServiceBrightness={matchServiceBrightness} />
      <hemisphereLight ref={ambient} layers-mask={3} />
    </>
  )
}

export function EnvironmentScene(props: EnvironmentProps = {}) {
  return SIMPLE_MAP ? <SimpleParkEnvironment {...props}/> : <DetailedEnvironmentScene {...props}/>
}
