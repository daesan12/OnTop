import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, Fog, type HemisphereLight } from 'three'
import { ENVIRONMENT, sampleDay } from '../config'
import { environmentFrame as frame, updateEnvironmentFrame } from './environmentState'
import { Instances, type Part } from './art/Instances'

// All clouds share one coarse sphere and one material, rather than a full-screen
// multi-octave noise shader. Background landmarks still use the existing map.
const clouds: Part[] = Array.from({ length: 12 }, (_, i) => {
  const angle = i * Math.PI / 6
  return Array.from({ length: 3 }, (_, j): Part => ({
    p: [Math.cos(angle) * 340 + (j - 1) * 15, 105 + i % 3 * 18 + j % 2 * 5, Math.sin(angle) * 340],
    s: [24, 10 + j % 2 * 4, 15], c: '#e3e8e4',
  }))
}).flat()

export function SimpleParkEnvironment({ fixedTime }: { fixedTime?: number }) {
  const scene = useThree(s => s.scene)
  const light = useRef<HemisphereLight>(null)
  const values = useMemo(() => ({ day: new Color('#9bbdd1'), night: new Color(ENVIRONMENT.palette.nightSky), sky: new Color(), fog: new Fog('#9bbdd1', 220, 750) }), [])
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
    if (light.current) light.current.intensity = 1.15 + frame.daylight * .4
  }, -100)
  return <>
    <hemisphereLight ref={light} color="#e5edf3" groundColor="#858772" layers-mask={3}/>
    <group name="simple-shared-clouds"><Instances parts={clouds} shadow={false} material={<meshLambertMaterial flatShading/>}><icosahedronGeometry args={[1, 1]}/></Instances></group>
  </>
}
