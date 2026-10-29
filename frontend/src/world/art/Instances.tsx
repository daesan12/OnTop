import { SIMPLE_MAP } from './mapRenderProfile'
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  Color,
  Euler,
  Object3D,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from 'three'

export type XYZ = [number, number, number]
export interface Part {
  p: XYZ
  s: XYZ
  r?: XYZ
  c: string
}

/** Static vegetation sectors allow Three's frustum culling to skip whole groves. */
export function SpatialInstances(props: Parameters<typeof Instances>[0]) {
  const sectors = useMemo(() => {
    const result = new Map<string, Part[]>()
    for (const part of props.parts) {
      const key = `${Math.floor(part.p[0] / 24)}:${Math.floor(part.p[2] / 24)}`
      const batch = result.get(key) ?? []
      batch.push(part)
      result.set(key, batch)
    }
    return [...result]
  }, [props.parts])
  return (
    <>
      {sectors.map(([key, parts]) => (
        <Instances key={key} {...props} parts={parts} />
      ))}
    </>
  )
}

/** World yaw must precede the part's local tilt (Euler XYZ addition does not). */
export function yawPart(part: Part, yaw: number) {
  const q = new Quaternion().setFromEuler(new Euler(...(part.r ?? [0, 0, 0])))
  q.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw))
  const r = new Euler().setFromQuaternion(q)
  part.r = [r.x, r.y, r.z]
}

/** One draw per material/shape, regardless of prop count. Stable deterministic art data. */
export function Instances({
  parts,
  children,
  shadow = true,
  material,
}: {
  parts: readonly Part[]
  children: ReactNode
  shadow?: boolean
  material?: ReactNode
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current!
    const object = new Object3D()
    const color = new Color()
    parts.forEach((part, i) => {
      object.position.set(...part.p)
      object.scale.set(...part.s)
      object.rotation.set(...(part.r ?? [0, 0, 0]))
      object.updateMatrix()
      mesh.setMatrixAt(i, object.matrix)
      mesh.setColorAt(i, color.set(part.c))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [parts])
  return (
    <instancedMesh
      ref={ref}
      // The batch itself has an identity transform; only its instance matrices vary.
      matrixAutoUpdate={false}
      args={[undefined, undefined, parts.length]}
      castShadow={shadow}
      receiveShadow
    >
      {children}
      {material ?? (SIMPLE_MAP ? <meshLambertMaterial flatShading/> : <meshStandardMaterial roughness={0.88} />)}
    </instancedMesh>
  )
}

export function beam(from: XYZ, to: XYZ, radius: number, color: string): Part {
  const a = new Vector3(...from),
    b = new Vector3(...to)
  const object = new Object3D()
  object.quaternion.setFromUnitVectors(
    new Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  )
  return {
    p: a.clone().add(b).multiplyScalar(0.5).toArray(),
    s: [radius, a.distanceTo(b), radius],
    r: [object.rotation.x, object.rotation.y, object.rotation.z],
    c: color,
  }
}

export function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}
