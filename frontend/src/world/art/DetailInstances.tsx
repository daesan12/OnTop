import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, type ThreeElements } from '@react-three/fiber'
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Sphere,
  type InstancedMesh,
  type MeshStandardMaterial,
} from 'three'
import { DetailBatch } from './detailBatch'
import type { Part } from './Instances'

/** Fade tiny meshes to their origin before their sector leaves the distance budget. */
export function DetailMaterial({
  range,
  ...props
}: {
  range: number
} & Omit<
  ThreeElements['meshStandardMaterial'],
  'onBeforeCompile' | 'customProgramCacheKey'
>) {
  const uniform = useMemo(() => ({ value: range }), [])
  useLayoutEffect(() => {
    uniform.value = range
  }, [uniform, range])
  const compile = useMemo<MeshStandardMaterial['onBeforeCompile']>(
    () => (shader) => {
      shader.uniforms.detailRange = uniform
      shader.vertexShader = `uniform float detailRange;\n${shader.vertexShader}`
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
      #include <begin_vertex>
      vec3 detailCenter = (modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.)).xyz;
      float detailFade = 1. - smoothstep(detailRange * .75, detailRange, distance(detailCenter, cameraPosition));
      transformed *= detailFade;
    `,
      )
    },
    [uniform],
  )
  return (
    <meshStandardMaterial
      roughness={1}
      {...props}
      onBeforeCompile={compile}
      customProgramCacheKey={() => 'park-detail-v2'}
    />
  )
}

/** Non-shadow-casting decorations and remote background batches. Infinity keeps
 * full distance visibility while still compacting offscreen sectors. Do not use
 * for interactive/fading instances: their stable indices must be preserved. */
export function DetailInstances({
  parts,
  range,
  name,
  children,
  material,
}: {
  parts: readonly Part[]
  range: number
  name: string
  children: ReactNode
  material?: ReactNode
}) {
  const ref = useRef<InstancedMesh>(null)
  const batch = useRef<DetailBatch | null>(null)
  useLayoutEffect(() => {
    const mesh = ref.current!
    const next = new DetailBatch(parts, mesh.geometry)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.instanceColor = new InstancedBufferAttribute(
      new Float32Array(parts.length * 3),
      3,
    ).setUsage(DynamicDrawUsage)
    mesh.boundingBox = next.bounds.clone()
    mesh.boundingSphere = next.bounds.getBoundingSphere(new Sphere())
    mesh.count = 0
    batch.current = next
    return () => {
      batch.current = null
    }
  }, [parts])
  // CameraRig runs at -0.5, so demand rendering and abrupt turns use this frame's view.
  useFrame(({ camera }) => {
    if (ref.current) batch.current?.update(ref.current, camera, range)
  })
  return (
    <instancedMesh
      ref={ref}
      matrixAutoUpdate={false}
      name={name}
      args={[undefined, undefined, parts.length]}
      receiveShadow
    >
      {children}
      {material ?? <DetailMaterial range={range} />}
    </instancedMesh>
  )
}
