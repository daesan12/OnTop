import { memo } from 'react'
import {
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshLambertMaterial,
} from 'three'
import { SpatialInstances } from './Instances'
import { buildParkTreeParts, parkTreePlantings } from './parkTreeParts'

const { wood, crowns, cones } = buildParkTreeParts(parkTreePlantings)
// Shared resources stay alive across re-entry. Open branch ends sit inside foliage/wood.
const trunkGeometry = new CylinderGeometry(0.52, 1, 1, 6, 1, true)
const roundGeometry = new IcosahedronGeometry(1, 0)
const coneGeometry = new ConeGeometry(1, 2, 8)
const material = new MeshLambertMaterial()
// Stable indices let CameraOcclusionFader hide just the obstructing tree part.
// Shared geometry is still divided into static spatial sectors: submitting the
// entire forest as three draws lost CPU-throttled performance in comparison.
export const parkTreeBatches = [
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
      {parkTreeBatches.map(({ parts, geometry }) => (
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
