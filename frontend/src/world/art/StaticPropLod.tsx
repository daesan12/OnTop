import { useLayoutEffect, useRef } from 'react'
import { extend } from '@react-three/fiber'
import { LOD, type Group, type BufferGeometry } from 'three'
import { PropModel } from './PropModel'
import type { PropFinish, XYZ } from './propGeometry'

const StaticLOD = extend(LOD)
type Art = Partial<Record<PropFinish, BufferGeometry>>

/** Both levels share a world-space origin and keep the original close-up art.
 * Hysteresis avoids switching repeatedly on a distance boundary. */
export function StaticPropLod({
  near,
  far,
  center,
  distance,
  name,
}: {
  near: Art
  far: Art
  center: XYZ
  distance: number
  name: string
}) {
  const lod = useRef<LOD>(null),
    detail = useRef<Group>(null),
    distant = useRef<Group>(null)
  useLayoutEffect(() => {
    const object = lod.current!
    object.addLevel(detail.current!, 0)
    object.addLevel(distant.current!, distance, 0.15)
    return () => {
      object.levels.length = 0
    }
  }, [distance])
  return (
    <StaticLOD ref={lod} name={name} position={center}>
      <group ref={detail} position={[-center[0], -center[1], -center[2]]}>
        <PropModel art={near} name={`${name}-near`} />
      </group>
      <group ref={distant} position={[-center[0], -center[1], -center[2]]}>
        <PropModel art={far} name={`${name}-far`} shadow={false} />
      </group>
    </StaticLOD>
  )
}
