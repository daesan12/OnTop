import { Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, QuadraticBezierCurve3, TubeGeometry, Vector3, type Group, type Mesh } from 'three'
import type { Demo, PreviewSettings } from './JumpRopePreview'
import { PigeonActor, type PigeonLook, type PigeonPose } from './PigeonActor'
import { PreviewAvatar } from './PreviewAvatar'

const sky = '#e6efeb'
const leftPose: PigeonPose = { head: [0.01, -0.07, -0.15], eyelids: [0.7, 0.85], gaze: [0.7, 0] }
const rightPose: PigeonPose = { head: [0.08, 0.16, 0.22], eyelids: [0.53, 0.05], gaze: [-0.7, 0.4] }
const audience: { x: number; z: number; scale: number; look: PigeonLook; pose: PigeonPose }[] = [
  { x: -2.45, z: -1.63, scale: 0.68, look: 'pearl', pose: { head: [-0.13, 0.09, -0.22], eyelids: [0.1, 0.1] } },
  { x: -1.38, z: -2.16, scale: 0.75, look: 'ash', pose: { head: [0.08, -0.06, 0.08], eyelids: [0.7, 0.7], gaze: [0.5, 0] } },
  { x: 0.37, z: -2.31, scale: 0.62, look: 'lilac', pose: { head: [-0.16, 0.15, 0.18], jaw: 0.14 } },
  { x: 1.66, z: -1.93, scale: 0.72, look: 'sage', pose: { head: [0.05, -0.11, -0.19], eyelids: [0.2, 0.5] } },
]

function PreviewCamera({ angle, distance, height, fov }: {
  angle: number
  distance: number
  height: number
  fov: number
}) {
  const camera = useThree(state => state.camera)
  const { width, height: viewportHeight } = useThree(state => state.size)

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || width === 0) return
    const azimuth = angle * Math.PI / 180
    // Preserve the horizontal frame when the developer panel narrows the viewport.
    const framing = Math.max(1, 1.23 * viewportHeight / width)
    camera.position.set(Math.sin(azimuth) * distance, height, Math.cos(azimuth) * distance)
    camera.fov = 360 / Math.PI * Math.atan(Math.tan(fov * Math.PI / 360) * framing)
    camera.lookAt(0, 0.8, 0)
    camera.updateProjectionMatrix()
  }, [angle, camera, distance, fov, height, viewportHeight, width])

  return null
}

const shadowVertex = `
  varying vec2 shadowUv;
  void main() {
    shadowUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const shadowFragment = `
  varying vec2 shadowUv;
  void main() {
    float edge = smoothstep(0.18, 1.0, length(2.0 * shadowUv - 1.0));
    gl_FragColor = vec4(0.27, 0.24, 0.19, (1.0 - edge) * 0.28);
  }
`

function GroundShadow({ x, z, width, depth }: { x: number; z: number; width: number; depth: number }) {
  return (
    <mesh position={[x, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, depth]} />
      <shaderMaterial vertexShader={shadowVertex} fragmentShader={shadowFragment} transparent depthWrite={false} />
    </mesh>
  )
}

function ParkCourt() {
  return (
    <>
      <mesh position={[0, -0.17, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[75, 75]} />
        <meshStandardMaterial color="#b9cba9" roughness={1} />
      </mesh>
      <mesh position={[0, -0.079, -0.18]} scale={[1, 1, 0.81]}>
        <cylinderGeometry args={[3.68, 3.74, 0.156, 48]} />
        <meshStandardMaterial color="#bfaa91" roughness={1} />
      </mesh>
      <mesh position={[0, 0.001, -0.18]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.81, 1]}>
        <circleGeometry args={[3.6, 48]} />
        <meshStandardMaterial color="#dfc19e" roughness={0.98} />
      </mesh>
      <mesh position={[0, 0.003, -0.18]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.81, 1]}>
        <ringGeometry args={[3.37, 3.39, 48]} />
        <meshBasicMaterial color="#b9a78e" />
      </mesh>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.83, 1]}>
        <ringGeometry args={[0.68, 0.707, 36]} />
        <meshBasicMaterial color="#f5e7cc" />
      </mesh>
      <group position={[0, 0.004, -0.18]} scale={[1, 1, 0.81]}>
        {Array.from({ length: 16 }, (_, index) => {
          const angle = index * Math.PI / 8
          return (
            <group key={index} rotation-y={angle}>
              <mesh position-z={3.525} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[0.019, 0.27]} />
                <meshBasicMaterial color="#b9a78e" />
              </mesh>
            </group>
          )
        })}
      </group>

      {[-1, 1].map(side => (
        <group key={side}>
          <group position={[side * 3.15, -0.17, -2.9]} rotation={[0, side * 0.38, 0]}>
            {[-0.45, 0.45].map(x => (
              <mesh key={x} position={[x, 0.15, 0]}>
                <boxGeometry args={[0.17, 0.3, 0.32]} />
                <meshStandardMaterial color="#a3a59b" roughness={0.94} />
              </mesh>
            ))}
            <mesh position={[0, 0.315, 0]}>
              <boxGeometry args={[1.25, 0.12, 0.42]} />
              <meshStandardMaterial color="#baa58c" roughness={0.91} />
            </mesh>
          </group>
          {[0, 1, 2].map(index => (
            <mesh key={index} position={[side * (3.65 + index * 0.48), 0.05 + (index % 2) * 0.17, -3.32 - index * 0.15]} scale={[0.66, 0.39 + index * 0.045, 0.48]}>
              <icosahedronGeometry args={[1, 1]} />
              <meshStandardMaterial color={index === 1 ? '#a9bf9f' : '#b6c8a9'} roughness={1} flatShading />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

export function PreviewScene({ settings, demo }: { settings: PreviewSettings; demo: Demo | null }) {
  const avatar = useRef<Group>(null)
  const leftPigeon = useRef<Group>(null)
  const rightPigeon = useRef<Group>(null)
  const leftGrip = useRef<Group>(null)
  const rightGrip = useRef<Group>(null)
  const rope = useRef<Mesh>(null)
  const speedMarker = useRef<Mesh>(null)
  const ropeShape = useRef({
    curve: new QuadraticBezierCurve3(),
    left: new Vector3(),
    right: new Vector3(),
    slack: -1,
    width: -1,
  })

  useEffect(() => {
    const mesh = rope.current
    return () => mesh?.geometry.dispose()
  }, [])

  useFrame(() => {
    const elapsed = demo ? (performance.now() - demo.startedAt) / 1000 : Infinity
    const jumping = (demo?.action === 'jump' || demo?.action === 'perfect') && elapsed < settings.jumpDuration
    if (avatar.current) {
      const progress = jumping ? elapsed / settings.jumpDuration : 0
      avatar.current.position.y = 4 * settings.jumpHeight * progress * (1 - progress)
      avatar.current.rotation.z = demo?.action === 'miss' && elapsed < 0.45
        ? Math.sin(elapsed / 0.45 * Math.PI * 2) * 0.2 : 0
    }
    const laughing = (demo?.action === 'laugh' || demo?.action === 'miss') && elapsed < 1.2
    const bob = laughing ? Math.abs(Math.sin(elapsed * 17)) * 0.15 : 0
    if (leftPigeon.current) leftPigeon.current.position.y = bob
    if (rightPigeon.current) rightPigeon.current.position.y = bob

    const { curve, left, right } = ropeShape.current
    if (rope.current && leftGrip.current && rightGrip.current) {
      leftGrip.current.getWorldPosition(left)
      rightGrip.current.getWorldPosition(right)
      if (!curve.v0.equals(left) || !curve.v2.equals(right)
        || ropeShape.current.slack !== settings.ropeHeight || ropeShape.current.width !== settings.ropeWidth) {
        const gripHeight = (left.y + right.y) / 2
        const centerHeight = Math.max(0.055, gripHeight - settings.ropeHeight)
        curve.v0.copy(left)
        curve.v1.lerpVectors(left, right, 0.5)
        curve.v1.y = 2 * centerHeight - gripHeight
        curve.v1.z += 0.88 + settings.ropeHeight * 0.55
        curve.v2.copy(right)
        curve.updateArcLengths()
        ropeShape.current.slack = settings.ropeHeight
        ropeShape.current.width = settings.ropeWidth
        rope.current.geometry.dispose()
        rope.current.geometry = new TubeGeometry(curve, 32, settings.ropeWidth / 2, 8, false)
      }
    }

    if (speedMarker.current) {
      speedMarker.current.visible = demo?.action === 'jump' && jumping
      if (speedMarker.current.visible) {
        const phase = elapsed * settings.ropeSpeed * 2 * Math.PI
        speedMarker.current.position.copy(curve.v0)
        speedMarker.current.position.y += Math.cos(phase) * 0.16
        speedMarker.current.position.z += Math.sin(phase) * 0.16
      }
    }
  })

  const halfGap = settings.pigeonGap / 2
  return (
    <>
      <PreviewCamera angle={settings.cameraAngle} distance={settings.cameraDistance} height={settings.cameraHeight} fov={settings.fov} />
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 10, 21]} />
      <hemisphereLight args={['#fff5e4', '#788f87', 1.95]} />
      <directionalLight position={[2.5, 6, 4]} intensity={2.25} />
      <ParkCourt />

      <GroundShadow x={settings.avatarX} z={settings.avatarZ} width={0.95 * settings.avatarScale} depth={0.62 * settings.avatarScale} />
      <group position={[settings.avatarX, 0, settings.avatarZ]}>
        <group ref={avatar} scale={settings.avatarScale}>
          <Suspense fallback={null}><PreviewAvatar /></Suspense>
        </group>
      </group>
      <GroundShadow x={-halfGap} z={-0.08} width={1.13 * settings.pigeonScale} depth={0.95 * settings.pigeonScale} />
      <group ref={leftPigeon} position={[-halfGap, 0, 0]} rotation={[0, 0.76, 0]} scale={settings.pigeonScale}>
        <PigeonActor look="sage" pose={leftPose} gripRef={leftGrip} />
      </group>
      <GroundShadow x={halfGap} z={-0.08} width={1.13 * settings.pigeonScale} depth={0.95 * settings.pigeonScale} />
      <group ref={rightPigeon} position={[halfGap, 0, 0]} rotation={[0, -0.67, 0]} scale={settings.pigeonScale}>
        <PigeonActor look="lilac" pose={rightPose} gripRef={rightGrip} />
      </group>

      <mesh ref={rope} name="park-jump-rope">
        <meshStandardMaterial color="#374a47" roughness={0.88} />
      </mesh>
      <mesh ref={speedMarker} visible={false}>
        <sphereGeometry args={[0.042, 10, 8]} />
        <meshBasicMaterial color="#d4975d" />
      </mesh>

      {settings.audience && audience.map(({ x, z, scale, look, pose }) => (
        <group key={x}>
          <GroundShadow x={x} z={z - 0.06} width={1.12 * scale} depth={0.95 * scale} />
          <group position={[x, 0, z]} rotation={[0, x * -0.24, 0]} scale={scale}>
            <PigeonActor look={look} pose={pose} />
          </group>
        </group>
      ))}
    </>
  )
}
