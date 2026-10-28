import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, type Group, type MeshBasicMaterial } from 'three'
import { Instances, type Part } from './art/Instances'
import { environmentFrame } from './environmentState'

// Eight silhouettes, three overlapping low-poly ellipsoids each. A single draw,
// one shared twenty-triangle geometry, no alpha blending or cloud image/noise.
const clouds: Part[] = Array.from({ length: 8 }, (_, i) => {
  const angle = i * Math.PI / 4, radius = 230 + i % 3 * 50
  return [-1, 0, 1].map((lobe): Part => ({
    p: [Math.cos(angle) * radius + lobe * 19, 110 + i % 3 * 12 + (lobe === 0 ? 5 : 0), Math.sin(angle) * radius],
    s: [28, lobe === 0 ? 15 : 11, 17], c: '#ffffff',
  }))
}).flat()
const day = new Color('#e5eced'), night = new Color('#343d51')
export function SimpleSkyClouds() {
  const group = useRef<Group>(null), material = useRef<MeshBasicMaterial>(null)
  useFrame(({ camera }) => {
    group.current?.position.copy(camera.position)
    material.current?.color.copy(night).lerp(day, environmentFrame.daylight)
  })
  return <group ref={group} name="simple-sky-clouds" userData={{ keepOpaque: true }}>
    <Instances parts={clouds} shadow={false}
      material={<meshBasicMaterial ref={material} fog={false} />}>
      <icosahedronGeometry args={[1, 0]} />
    </Instances>
  </group>
}
