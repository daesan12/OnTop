import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'

type SceneLayerProps = {
  onDemoObjectClick: () => void
}

function DemoObject({ onClick }: { onClick: () => void }) {
  const mesh = useRef<Mesh>(null)

  useFrame((_, delta) => {
    if (mesh.current) mesh.current.rotation.y += delta * 0.35
  })

  return (
    <mesh ref={mesh} onClick={onClick}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#c8a65a" />
    </mesh>
  )
}

export function SceneLayer({ onDemoObjectClick }: SceneLayerProps) {
  return (
    <div className="scene-layer" aria-label="3D 테이블 장면">
      <Canvas camera={{ position: [0, 1, 7], fov: 50 }}>
        <color attach="background" args={["#18251e"]} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[3, 5, 4]} intensity={2} />
        <DemoObject onClick={onDemoObjectClick} />
      </Canvas>
    </div>
  )
}
