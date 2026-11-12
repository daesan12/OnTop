import { cameraWorldPosition } from './xrView'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  ShaderMaterial,
  type MeshStandardMaterial,
  type PointLight,
  type Group,
} from 'three'
import {
  ENVIRONMENT,
  ENVIRONMENT_QUALITY,
  LAMPS,
  MINI_PROPS,
  TABLES,
  smoothRange,
  type QualityPreset,
} from '../park/mapConfig'
import { environmentFrame as frame } from './environmentState'
import { Instances, type Part } from './art/Instances'
import { TraditionalPavilionLanterns } from './art/TraditionalPavilionLanterns'
import { GENERATED_PARK_ENABLED } from '../park/mapSelection'
import { FISH_SHOP_LANTERNS } from './art/shopLanternLayout'

export function NightMaterial({
  color = '#ece3cb',
  emission = ENVIRONMENT.palette.lamp,
  strength = 0.8,
  stagger = 0,
  vertexColors = false,
}: {
  color?: string
  emission?: string
  strength?: number
  stagger?: number
  vertexColors?: boolean
}) {
  const ref = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    if (ref.current)
      ref.current.emissiveIntensity =
        smoothRange(stagger, 1, frame.night) * strength
  })
  return (
    <meshStandardMaterial
      ref={ref}
      vertexColors={vertexColors}
      color={color}
      emissive={emission}
      emissiveIntensity={0}
      roughness={0.65}
    />
  )
}
const shop=MINI_PROPS[0],shopScale='scale' in shop?shop.scale:1,shopYaw='yaw' in shop?shop.yaw:0
const shopLights=GENERATED_PARK_ENABLED?FISH_SHOP_LANTERNS.map(([x,y,z])=>({
  x:shop.x+shopScale*(x*Math.cos(shopYaw)+z*Math.sin(shopYaw)),
  y:y*shopScale,
  z:shop.z+shopScale*(-x*Math.sin(shopYaw)+z*Math.cos(shopYaw)),
  floor:0,poolOffset:.012,radius:2.8,strength:18,color:'#FFD6A3',
})):[]
type NightCandidate = { x: number; y: number; z: number; floor: number; poolOffset: number; radius: number; strength: number; color: string }
const defaultCandidates: readonly NightCandidate[] = [
  // Reuse the bounded light pool; the new lanterns add no permanent point lights.
  ...shopLights,
  ...LAMPS.map(([x, y, z]) => ({
    x,
    y: y + 3.7,
    z,
    floor: y,
    poolOffset: GENERATED_PARK_ENABLED ? .012 : .105,
    radius: 4.2,
    strength: 24,
    color: ENVIRONMENT.palette.path,
  })),
  ...TABLES.map((t) => ({
    x: t.position[0],
    y: t.position[1] + 3.2,
    z: t.position[2],
    floor: t.position[1],
    poolOffset:.105,
    radius: 3.8,
    strength: 30,
    color: ENVIRONMENT.palette.table,
  })),
]
const pools: Part[] = defaultCandidates.map((p) => ({
  p: [p.x, p.floor + p.poolOffset, p.z],
  s: [p.radius, p.radius, 1],
  r: [-Math.PI / 2, 0, 0],
  c: p.color,
}))
export function NightLighting({ quality, placements }: {
  quality: QualityPreset
  placements?: readonly (readonly [number, number, number])[]
}) {
  const candidates = useMemo(() => placements?.map(([x, floor, z]) => ({
    x, y: floor + 3.7, z, strength: 24, color: ENVIRONMENT.palette.path,
  })) ?? defaultCandidates, [placements])
  const preset = ENVIRONMENT_QUALITY[quality]
  const lights = useRef<(PointLight | null)[]>([])
  const poolsGroup = useRef<Group>(null)
  const state = useMemo(
    () => ({
      ranked: candidates.map((p, i) => ({ ...p, i, distance: 0 })),
      slots: Array.from({ length: Math.min(preset.lights, candidates.length) }, () => ({
        index: -1,
        target: -1,
      })),
      elapsed: 1,
    }),
    [preset.lights, candidates],
  )
  const poolMaterial = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { night: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
        fragmentShader:
          `uniform float night;varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float a=pow(max(0.,1.-r*r),3.)*night*.19;gl_FragColor=vec4(.95,.65,.32,a);#include <colorspace_fragment>}`.replace(
            ';#',
            ';\n#',
          ),
      }),
    [],
  )
  useEffect(() => () => poolMaterial.dispose(), [poolMaterial])
  useFrame(({ camera }, delta) => {
    poolMaterial.uniforms.night.value = frame.night
    const nightVisible = frame.night > 0.001
    if (poolsGroup.current) poolsGroup.current.visible = nightVisible
    // Zero-intensity lights otherwise still occupy every surface shader's light loop.
    // Toggle the pool together at dawn/dusk, avoiding per-slot shader churn.
    for (const light of lights.current) if (light) light.visible = nightVisible
    if (!nightVisible) {
      for (const light of lights.current) if (light) light.intensity = 0
      state.elapsed = 1
      return
    }
    state.elapsed += delta
    if (state.elapsed > 0.4) {
      state.elapsed = 0
      for (const p of state.ranked)
        p.distance =
          (cameraWorldPosition(camera).x - p.x) ** 2 + (cameraWorldPosition(camera).z - p.z) ** 2
      state.ranked.sort((a, b) => a.distance - b.distance)
      for (let i = 0; i < state.slots.length; i++)
        state.slots[i].target = state.ranked[i].i
    }
    for (let i = 0; i < state.slots.length; i++) {
      const light = lights.current[i],
        slot = state.slots[i]
      if (!light) continue
      if (slot.index !== slot.target) {
        light.intensity *= Math.exp(-12 * delta)
        if (light.intensity < 0.05) {
          slot.index = slot.target
          const p = candidates[slot.index]
          light.position.set(p.x, p.y, p.z)
          light.color.set(p.color)
        }
      } else if (slot.index >= 0) {
        const p = candidates[slot.index]
        const distance = Math.hypot(
          cameraWorldPosition(camera).x - p.x,
          cameraWorldPosition(camera).z - p.z,
        )
        const target =
          p.strength * frame.night * (1 - smoothRange(18, 28, distance))
        light.intensity +=
          (target - light.intensity) * (1 - Math.exp(-5 * delta))
      }
    }
  })
  return (
    <group name="night-lighting">
      {!placements && <TraditionalPavilionLanterns />}
      {!placements && <group ref={poolsGroup}>
        <Instances
          parts={pools}
          shadow={false}
          material={<primitive object={poolMaterial} attach="material" />}
        >
          <circleGeometry args={[1, 32]} />
        </Instances>
      </group>}
      {state.slots.map((_, i) => (
        <pointLight
          key={i}
          userData={{ warmNightLight: true }}
          ref={(v) => {
            lights.current[i] = v
          }}
          intensity={0}
          distance={12}
          decay={2}
          layers-mask={3}
        />
      ))}
    </group>
  )
}
