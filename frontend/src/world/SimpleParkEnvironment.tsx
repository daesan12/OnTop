import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, Fog, type HemisphereLight } from 'three'
import { sampleDay } from '../config'
import { environmentFrame as frame, updateEnvironmentFrame } from './environmentState'
import { simpleEnvironmentPalette } from './simpleEnvironmentPalette'
import { SimpleSkyClouds } from './SimpleSkyClouds'

export function SimpleParkEnvironment({ fixedTime }: { fixedTime?: number }) {
  const scene = useThree(s => s.scene)
  const light = useRef<HemisphereLight>(null)
  const values = useMemo(() => ({ day: new Color(simpleEnvironmentPalette.daySky), night: new Color(simpleEnvironmentPalette.nightSky), sky: new Color(), dayLight:new Color(simpleEnvironmentPalette.dayLight),nightLight:new Color(simpleEnvironmentPalette.nightLight),dayGround:new Color(simpleEnvironmentPalette.dayGround),nightGround:new Color(simpleEnvironmentPalette.nightGround),fog: new Fog(simpleEnvironmentPalette.daySky, 260, 750) }), [])
  useEffect(() => {
    const previous = { environment: scene.environment, background: scene.background, fog: scene.fog }
    scene.environment = null
    return () => { Object.assign(scene, previous) }
  }, [scene])
  useFrame(() => {
    if (fixedTime === undefined) updateEnvironmentFrame(performance.now())
    else Object.assign(frame, sampleDay(fixedTime), { serverTime: fixedTime, seconds: performance.now() / 1000 })
    values.sky.copy(values.night).lerp(values.day, frame.daylight)
    values.fog.color.copy(values.sky)
    scene.background = values.sky
    scene.fog = values.fog
    scene.userData.environment = frame
    if (light.current) {
      light.current.color.copy(values.nightLight).lerp(values.dayLight,frame.daylight)
      light.current.groundColor.copy(values.nightGround).lerp(values.dayGround,frame.daylight)
      light.current.intensity = simpleEnvironmentPalette.nightFill + frame.daylight * (simpleEnvironmentPalette.dayFill-simpleEnvironmentPalette.nightFill)
    }
  }, -100)
  return <>
    <SimpleSkyClouds />
    <hemisphereLight ref={light} color="#e5edf3" groundColor="#858772" layers-mask={3}/>
  </>
}
