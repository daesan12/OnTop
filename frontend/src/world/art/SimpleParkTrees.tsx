import { memo } from 'react'
import {
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
} from 'three'
import { SpatialInstances } from './Instances'
import { buildParkTreeParts, parkTreePlantings } from './parkTreeParts'

const { wood, crowns, cones } = buildParkTreeParts(parkTreePlantings)
// Shared resources stay alive across re-entry. Open branch ends sit inside foliage/wood.
const trunkGeometry = new CylinderGeometry(0.52, 1, 1, 6, 1, true)
const roundGeometry = new IcosahedronGeometry(1, 1)
const coneGeometry = new ConeGeometry(1, 2, 8)
const material = new MeshStandardMaterial({
  roughness: 0.94,
  flatShading: true,
})
const batches = [
  { parts: wood, geometry: trunkGeometry },
  { parts: crowns, geometry: roundGeometry },
  { parts: cones, geometry: coneGeometry },
]

export const SimpleParkTrees = memo(function SimpleParkTrees() {
  return (
    <group
      name="simple-park-trees"
      userData={{
        assetId: 'park/faceted-trees',
        treeCount: parkTreePlantings.length,
      }}
    >
      {batches.map(({ parts, geometry }) => (
        <SpatialInstances
          key={geometry.uuid}
          parts={parts}
          shadow={false}
          material={
            <primitive object={material} attach="material" dispose={null} />
          }
        >
          <primitive object={geometry} attach="geometry" dispose={null} />
        </SpatialInstances>
      ))}
    </group>
  )
})
