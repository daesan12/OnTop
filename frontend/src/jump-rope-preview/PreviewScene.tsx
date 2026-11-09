import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, type Group, type Mesh } from 'three'
import type { Demo, PreviewSettings } from './JumpRopePreview'

function PreviewCamera({ angle, distance, height, fov }: {
  angle: number
  distance: number
  height: number
  fov: number
}) {
  const camera = useThree(state => state.camera)

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const azimuth = angle * Math.PI / 180
    camera.position.set(Math.sin(azimuth) * distance, height, Math.cos(azimuth) * distance)
    camera.fov = fov
    camera.lookAt(0, 0.8, 0)
    camera.updateProjectionMatrix()
  }, [angle, camera, distance, fov, height])

  return null
}

function AvatarPlaceholder() {
  return (
    <>
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[0.42, 0.41, 0.35]} />
        <meshStandardMaterial color="#f7ca94" />
      </mesh>
      <mesh position={[0, 1.49, 0.02]}>
        <boxGeometry args={[0.47, 0.09, 0.4]} />
        <meshStandardMaterial color="#345058" />
      </mesh>
      <mesh position={[0, 0.81, 0]}>
        <boxGeometry args={[0.5, 0.45, 0.29]} />
        <meshStandardMaterial color="#db7449" />
      </mesh>
      {[-1, 1].map(side => (
        <group key={side}>
          <mesh position={[side * 0.1, 1.28, 0.179]}>
            <boxGeometry args={[0.043, 0.052, 0.012]} />
            <meshStandardMaterial color="#243b34" />
          </mesh>
          <mesh position={[side * 0.31, 0.81, 0]} rotation={[0, 0, side * 0.22]}>
            <boxGeometry args={[0.12, 0.37, 0.16]} />
            <meshStandardMaterial color="#db7449" />
          </mesh>
          <mesh position={[side * 0.13, 0.32, 0]}>
            <boxGeometry args={[0.2, 0.52, 0.22]} />
            <meshStandardMaterial color="#416f69" />
          </mesh>
          <mesh position={[side * 0.13, 0.06, 0.048]}>
            <boxGeometry args={[0.23, 0.12, 0.34]} />
            <meshStandardMaterial color="#243b34" />
          </mesh>
        </group>
      ))}
    </>
  )
}

function PigeonPlaceholder() {
  return (
    <>
      <mesh position={[0, 0.25, 0]} scale={[1, 0.8, 1.35]}>
        <sphereGeometry args={[0.29, 12, 8]} />
        <meshStandardMaterial color="#88989c" flatShading />
      </mesh>
      <mesh position={[0, 0.5, 0.18]}>
        <sphereGeometry args={[0.19, 12, 8]} />
        <meshStandardMaterial color="#4d7c74" flatShading />
      </mesh>
      <mesh position={[0, 0.52, 0.38]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.072, 0.18, 5]} />
        <meshStandardMaterial color="#e2a563" />
      </mesh>
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * 0.145, 0.55, 0.27]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshStandardMaterial color="#243b34" />
        </mesh>
      ))}
    </>
  )
}

export function PreviewScene({ settings, demo }: { settings: PreviewSettings; demo: Demo | null }) {
  const avatar = useRef<Group>(null)
  const leftPigeon = useRef<Group>(null)
  const rightPigeon = useRef<Group>(null)
  const speedMarker = useRef<Mesh>(null)
  const phase = useRef(0)

  useFrame((_, delta) => {
    const elapsed = demo ? (performance.now() - demo.startedAt) / 1000 : Infinity
    if (avatar.current) {
      const jumping = (demo?.action === 'jump' || demo?.action === 'perfect') && elapsed < settings.jumpDuration
      const progress = jumping ? elapsed / settings.jumpDuration : 0
      avatar.current.position.y = 4 * settings.jumpHeight * progress * (1 - progress)
      avatar.current.rotation.z = demo?.action === 'miss' && elapsed < 0.45
        ? Math.sin(elapsed / 0.45 * Math.PI * 2) * 0.2 : 0
    }
    const laughing = (demo?.action === 'laugh' || demo?.action === 'miss') && elapsed < 1.2
    const bob = laughing ? Math.abs(Math.sin(elapsed * 17)) * 0.15 : 0
    if (leftPigeon.current) leftPigeon.current.position.y = bob
    if (rightPigeon.current) rightPigeon.current.position.y = bob

    if (speedMarker.current) {
      phase.current = (phase.current + Math.min(delta, 0.05) * settings.ropeSpeed) % 1
      const angle = phase.current * Math.PI * 2
      speedMarker.current.position.y = settings.ropeHeight + Math.cos(angle) * 0.18
      speedMarker.current.position.z = Math.sin(angle) * 0.18
    }
  })

  return (
    <>
      <PreviewCamera angle={settings.cameraAngle} distance={settings.cameraDistance} height={settings.cameraHeight} fov={settings.fov} />
      <color attach="background" args={['#e3efe6']} />
      <fog attach="fog" args={['#e3efe6', 10, 23]} />
      <hemisphereLight args={['#fff5df', '#607c73', 2.2]} />
      <directionalLight position={[3, 6, 4]} intensity={2} />

      <mesh position={[0, -0.14, 0]}>
        <cylinderGeometry args={[3.55, 3.65, 0.26, 48]} />
        <meshStandardMaterial color="#b2c7ad" />
      </mesh>
      <gridHelper args={[20, 40, '#adbfaf', '#c7d5c7']} position={[0, -0.275, 0]} />
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.58, 0.603, 40]} />
        <meshBasicMaterial color="#f8f2d7" />
      </mesh>

      <group position={[settings.avatarX, 0, settings.avatarZ]}>
        <group ref={avatar} scale={settings.avatarScale}><AvatarPlaceholder /></group>
      </group>
      <group position={[-settings.pigeonGap / 2, 0, 0]}>
        <group ref={leftPigeon} rotation={[0, 1.06, 0]} scale={settings.pigeonScale}><PigeonPlaceholder /></group>
      </group>
      <group position={[settings.pigeonGap / 2, 0, 0]}>
        <group ref={rightPigeon} rotation={[0, -1.06, 0]} scale={settings.pigeonScale}><PigeonPlaceholder /></group>
      </group>

      <mesh position={[0, settings.ropeHeight, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[settings.ropeWidth / 2, settings.ropeWidth / 2, settings.pigeonGap - 0.65, 12]} />
        <meshStandardMaterial color="#36534b" />
      </mesh>
      <mesh ref={speedMarker} position={[-settings.pigeonGap / 2 + 0.55, settings.ropeHeight, 0]}>
        <sphereGeometry args={[0.066, 12, 8]} />
        <meshBasicMaterial color="#df6f32" />
      </mesh>

      {settings.audience && [-1.6, -0.8, 0, 0.8, 1.6].map((x, index) => (
        <group key={x} position={[x, 0, -1.8 - (index % 2) * 0.32]} rotation={[0, x * -0.35, 0]} scale={0.7}>
          <PigeonPlaceholder />
        </group>
      ))}
    </>
  )
}
