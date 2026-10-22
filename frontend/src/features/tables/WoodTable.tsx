import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { Mesh } from 'three'
import { ParkAssetLoader } from '../../world/art/assetLoader'

import { TABLE_SEATS } from '../../config'
import { woodTableUrl } from '../../world/worldAssets'
import { Instances, type Part } from '../../world/art/Instances'
import { SurfaceMaterial } from '../../world/art/SurfaceMaterial'
import { BeveledBox } from '../../world/art/BeveledBox'

const timber: Part[] = [{ p: [0, 0.99, 0], s: [2.1, 0.14, 1.6], c: '#96704c' }]
for (const x of [-0.82, 0.82]) {
  for (const z of [-0.59, 0.59])
    timber.push({ p: [x, 0.46, z], s: [0.12, 0.92, 0.12], c: '#795338' })
  timber.push({ p: [x, 0.83, 0], s: [0.1, 0.18, 1.24], c: '#835c3d' })
}
for (const z of [-0.59, 0.59])
  timber.push({ p: [0, 0.83, z], s: [1.64, 0.18, 0.1], c: '#835c3d' })
const chairs: Part[] = TABLE_SEATS.map(({ x, z, yaw }) => ({
  p: [x, 0, z],
  s: [1, 1, 1],
  r: [0, yaw - Math.PI, 0],
  c: '#ffffff',
}))
/** Offline-extracted chair, shared by every table through the loader cache. */
export function WoodTable({ seatCount = 2 }: { seatCount?: 2 | 4 }) {
  const visibleChairs = useMemo(() => chairs.slice(0, seatCount), [seatCount])
  const gltf = useLoader(ParkAssetLoader, woodTableUrl)
  const chair = useMemo(() => {
    let mesh: Mesh | undefined
    gltf.scene.traverse((node) => {
      if (node instanceof Mesh && !mesh) mesh = node
    })
    if (!mesh) throw new Error('목재 의자 모델을 읽을 수 없습니다.')
    return { geometry: mesh.geometry, material: mesh.material }
  }, [gltf])
  return (
    <group name="wooden-table-and-chairs">
      <Instances
        parts={timber}
        material={<SurfaceMaterial kind="wood" mapping="box" strength={0.22} />}
      >
        <BeveledBox />
      </Instances>
      <Instances
        parts={visibleChairs}
        material={
          <primitive object={chair.material} attach="material" dispose={null} />
        }
      >
        <primitive object={chair.geometry} attach="geometry" dispose={null} />
      </Instances>
    </group>
  )
}
