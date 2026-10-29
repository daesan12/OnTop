import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DynamicDrawUsage, Object3D, type InstancedMesh } from 'three'
import { LAKE, NETWORK } from '../config'
import { avatars } from '../network/worldClient'
import { sampleSwimmingPose } from './movementPresentation'

export function SwimmingRipples() {
  const mesh = useRef<InstancedMesh>(null),
    transform = useMemo(() => new Object3D(), [])
  const pose = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), [])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    let n = 0
    const now = performance.now()
    for (const avatar of avatars.values()) {
      if (n >= NETWORK.maxClients) break
      if (!sampleSwimmingPose(avatar, now, NETWORK.interpolationMs, pose)) continue
      transform.position.set(
        pose.x,
        LAKE.surfaceY + 0.014,
        pose.z,
      )
      transform.rotation.set(-Math.PI / 2, 0, 0)
      const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.08
      transform.scale.set(pulse, 0.75 * pulse, 1)
      transform.updateMatrix()
      mesh.current.setMatrixAt(n++, transform.matrix)
    }
    mesh.current.count = n
    mesh.current.visible = n > 0
    if (n) {
      mesh.current.instanceMatrix.needsUpdate = true
      mesh.current.computeBoundingSphere()
    }
  })
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, NETWORK.maxClients]}
      renderOrder={3}
      name="swimming-ripples"
      onUpdate={instance => instance.instanceMatrix.setUsage(DynamicDrawUsage)}
    >
      <ringGeometry args={[0.65, 0.69, 32]} />
      <meshBasicMaterial
        color="#c0e4dc"
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </instancedMesh>
  )
}
