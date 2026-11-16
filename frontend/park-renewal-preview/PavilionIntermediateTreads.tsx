import { MeshStandardMaterial } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { SUB_PAVILION_SCALE } from './plan'

const scale = 1.1 * SUB_PAVILION_SCALE
const depth = .145
const tread = new RoundedBoxGeometry(1.52 * scale, .14 * scale, depth * scale, 1, .014)
const finishes = ['#d9c7af', '#cbbba5', '#d9c7af'].map(color =>
  new MeshStandardMaterial({ color, roughness: .88 }))

/** Mid-height treads use the existing opening and overlap each original riser. */
export function PavilionIntermediateTreads() {
  return <group name="pavilion-intermediate-treads" dispose={null}>
    {finishes.map((material, index) => {
      const top = (2.5 - index) * .19
      const front = 2.83 + index * .34 + .26
      return <mesh key={index} geometry={tread} material={material}
        position={[0, (top - .07) * scale, (front + depth / 2 - .018) * scale]} receiveShadow />
    })}
  </group>
}
