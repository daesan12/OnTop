import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import { parkTreeResources } from '../../world/art/FacetedParkTreeInstances'
import { SpatialInstances } from '../../world/art/Instances'
import type { buildParkTreeParts } from '../../world/art/parkTreeParts'
import type { winterTreeParts } from './trees'
import { winterFirLightSnow, winterFirHeavySnow } from './winterFirGeometry'

/** Clip a thin snow skin from the upper crown, keeping the green silhouette underneath. */
function snowCap(source: BufferGeometry, floor: number) {
  const p = source.getAttribute('position'), index = source.index, vertices: number[] = []
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const triangle = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j))
    const clipped: Vector3[] = []
    for (let j = 0; j < 3; j++) {
      const a = triangle[j]!, b = triangle[(j + 1) % 3]!, aboveA = a.y >= floor, aboveB = b.y >= floor
      if (aboveA) clipped.push(a.clone())
      if (aboveA !== aboveB) clipped.push(a.clone().lerp(b, (floor - a.y) / (b.y - a.y)))
    }
    for (let j = 1; j < clipped.length - 1; j++) for (const v of [clipped[0]!, clipped[j]!, clipped[j + 1]!]) {
      vertices.push(v.x * 1.018, v.y * 1.018 + .012, v.z * 1.018)
    }
  }
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals(); return geometry
}
const crowns = snowCap(parkTreeResources.round, .5)

export function TreeSnowCaps({ parts }: { parts: ReturnType<typeof buildParkTreeParts> | ReturnType<typeof winterTreeParts> }) {
  if (!('snowCrowns' in parts)) return null
  return <group name="winter-tree-snow-caps">
    {[{ parts: parts.snowCrowns, geometry: crowns }, { parts: parts.snowCones, geometry: winterFirLightSnow },
      { parts: parts.snowConesHeavy, geometry: winterFirHeavySnow }].map(batch =>
      <SpatialInstances key={batch.geometry.uuid} parts={batch.parts} cellSize={96} shadow={false}
        material={<primitive object={parkTreeResources.material} attach="material" dispose={null} />}>
        <primitive object={batch.geometry} attach="geometry" dispose={null} />
      </SpatialInstances>,
    )}
  </group>
}
