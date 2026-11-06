import { cameraWorldPosition } from '../xrView'
import { SIMPLE_MAP } from './mapRenderProfile'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Object3D,
  type InstancedMesh,
} from 'three'
import { ENVIRONMENT_QUALITY, LAKE, type QualityPreset } from '../../config'
import { environmentFrame as frame } from '../environmentState'

/** Visual fish only. This pose is never an authoritative catch or reward. */
export function fishPose(index: number, seconds: number) {
  const angle = seconds * (0.055 + (index % 4) * 0.009) + index * 2.39996
  const radius = 0.38 + (index % 7) * 0.066
  const rx = LAKE.radiusX * radius,
    rz = LAKE.radiusZ * radius
  return {
    x: LAKE.x + Math.cos(angle) * rx,
    z: LAKE.z + Math.sin(angle) * rz,
    y: -0.23 + (index % 3) * 0.025,
    yaw: Math.atan2(-Math.sin(angle) * rx, Math.cos(angle) * rz),
  }
}
export function LakeFish({ quality }: { quality: QualityPreset }) {
  const body = useRef<InstancedMesh>(null),
    tail = useRef<InstancedMesh>(null)
  const preset = ENVIRONMENT_QUALITY[quality]
  const object = useMemo(() => new Object3D(), [])
  useLayoutEffect(() => {
    for (const mesh of [body.current!, tail.current!]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      for (let i = 0; i < preset.fish; i++)
        mesh.setColorAt(
          i,
          new Color(['#e6bd64', '#d88150', '#d9d0b4', '#748c80'][i % 4]),
        )
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [preset.fish])
  useFrame(({ camera }) => {
    const visible =
      Math.hypot(cameraWorldPosition(camera).x - LAKE.x, cameraWorldPosition(camera).z - LAKE.z) <
      preset.effectDistance
    for (const mesh of [body.current, tail.current])
      if (mesh) mesh.visible = visible
    if (!visible || !body.current || !tail.current) return
    for (let i = 0; i < preset.fish; i++) {
      const pose = fishPose(i, frame.seconds),
        size = 0.8 + (i % 4) * 0.13
      object.position.set(pose.x, pose.y, pose.z)
      object.rotation.set(0, pose.yaw, 0)
      object.scale.set(0.18 * size, 0.095 * size, 0.49 * size)
      object.updateMatrix()
      body.current.setMatrixAt(i, object.matrix)
      object.position.x -= Math.sin(pose.yaw) * 0.43 * size
      object.position.z -= Math.cos(pose.yaw) * 0.43 * size
      object.rotation.y += Math.sin(frame.seconds * 6 + i) * 0.42
      object.scale.setScalar(size)
      object.updateMatrix()
      tail.current.setMatrixAt(i, object.matrix)
    }
    body.current.instanceMatrix.needsUpdate = true
    tail.current.instanceMatrix.needsUpdate = true
  })
  return (
    <group name="lake-fish">
      <instancedMesh
        ref={body}
        args={[undefined, undefined, preset.fish]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, SIMPLE_MAP ? 6 : 12, SIMPLE_MAP ? 4 : 8]} />
        <meshStandardMaterial
          roughness={0.48}
          emissive="#5d4828"
          emissiveIntensity={0.12}
        />
      </instancedMesh>
      <instancedMesh
        ref={tail}
        args={[undefined, undefined, preset.fish]}
        frustumCulled={false}
      >
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([0, 0, 0, -0.21, 0, -0.38, 0.21, 0, -0.38]),
              3,
            ]}
          />
        </bufferGeometry>
        <meshBasicMaterial side={DoubleSide} />
      </instancedMesh>
    </group>
  )
}
