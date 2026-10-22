import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, type InstancedMesh } from 'three'
import { LAKE, NETWORK } from '../config'
import { avatars } from '../network/worldClient'

export function SwimmingRipples() {
  const mesh = useRef<InstancedMesh>(null),
    transform = useMemo(() => new Object3D(), [])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    let n = 0
    for (const avatar of avatars.values()) {
      if (!avatar.swimming) continue
      transform.position.set(
        avatar.current.x,
        LAKE.surfaceY + 0.014,
        avatar.current.z,
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
