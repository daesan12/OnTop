import { cameraWorldPosition } from './xrView'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, type Group, type MeshBasicMaterial } from 'three'
import { Instances, type Part } from './art/Instances'
import { environmentFrame } from './environmentState'

// Eight silhouettes, three overlapping low-poly ellipsoids each. A single draw,
// one shared eighty-triangle geometry, no alpha blending or cloud image/noise.
const cloudScale = .55
const clouds: Part[] = Array.from({ length: 8 }, (_, i) => {
  const angle = i * Math.PI / 4, radius = 230 + i % 3 * 50
  return [-1, 0, 1].map((lobe): Part => ({
    p: [Math.cos(angle) * radius + lobe * 19 * cloudScale, 44 + i % 3 * 8 + (lobe === 0 ? 5 * cloudScale : 0), Math.sin(angle) * radius],
    s: [28 * cloudScale, (lobe === 0 ? 15 : 11) * cloudScale, 17 * cloudScale], c: '#ffffff',
  }))
}).flat()
const day = new Color('#fbfdfb'), night = new Color('#26334b'), sunset = new Color('#e29b9c')
export function SimpleSkyClouds() {
  const group = useRef<Group>(null), material = useRef<MeshBasicMaterial>(null)
  useFrame(({ camera }) => {
    group.current?.position.copy(cameraWorldPosition(camera))
    material.current?.color.copy(night).lerp(day, environmentFrame.daylight)
      .lerp(sunset, environmentFrame.twilight * .85)
  })
  return <group ref={group} name="simple-sky-clouds" userData={{ keepOpaque: true }}>
    <Instances parts={clouds} shadow={false}
      material={<meshBasicMaterial ref={material} fog={false} toneMapped={false} />}>
      <icosahedronGeometry args={[1, 1]} />
    </Instances>
  </group>
}
