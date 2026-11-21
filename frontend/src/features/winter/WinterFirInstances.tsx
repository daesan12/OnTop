import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type BufferGeometry, type Group, type InstancedMesh } from 'three'
import { Instances, type Part } from '../../world/art/Instances'
import { parkTreeResources } from '../../world/art/FacetedParkTreeInstances'

const sectorSize = 48
const detailedDistance = 72
const hysteresis = 8

function FirSector({ parts, geometry, distantGeometry }: {
  parts: Part[]; geometry: BufferGeometry; distantGeometry: BufferGeometry
}) {
  const root = useRef<Group>(null)
  const state = useRef({ distant: false, center: new Vector3() })
  useFrame(({ camera }) => {
    const mesh = root.current?.children[0] as InstancedMesh | undefined
    if (!mesh?.boundingSphere) return
    const current = state.current
    current.center.copy(mesh.boundingSphere.center).applyMatrix4(mesh.matrixWorld)
    const threshold = detailedDistance + (current.distant ? -hysteresis : hysteresis)
    current.distant = camera.position.distanceToSquared(current.center) > threshold * threshold
    // Reuse instance matrices and colors. Switching sectors never recreates or
    // reuploads the thousands of tree transforms, nor changes physics geometry.
    mesh.geometry = current.distant ? distantGeometry : geometry
  }, .65)
  return <group ref={root}>
    <Instances parts={parts} shadow={false}
      material={<primitive object={parkTreeResources.material} attach="material" dispose={null} />}>
      <primitive object={geometry} attach="geometry" dispose={null} />
    </Instances>
  </group>
}

export function WinterFirInstances({ parts, geometry, distantGeometry }: {
  parts: readonly Part[]; geometry: BufferGeometry; distantGeometry: BufferGeometry
}) {
  const sectors = useMemo(() => {
    const result = new Map<string, Part[]>()
    for (const part of parts) {
      const key = `${Math.floor(part.p[0] / sectorSize)}:${Math.floor(part.p[2] / sectorSize)}`
      const sector = result.get(key) ?? []
      sector.push(part); result.set(key, sector)
    }
    return [...result]
  }, [parts])
  return <>{sectors.map(([key, batch]) =>
    <FirSector key={key} parts={batch} geometry={geometry} distantGeometry={distantGeometry} />)}</>
}
