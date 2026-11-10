import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, QuadraticBezierCurve3, Vector3, type Group } from 'three'
import type { Demo, PreviewSettings, RopeSimulation } from './JumpRopePreview'
import { PigeonActor, pigeonHeadPivot, type PigeonLook, type PigeonPose, type PigeonRig } from './PigeonActor'
import { PreviewAvatar } from './PreviewAvatar'
import { MissShockEffect } from './MissShockEffect'
import { createGameRopeGeometry, ropeCenter } from './gameRopeGeometry'
import { samplePigeonLaugh } from './pigeonLaugh'
import { blendSuccessPose, isSuccessActive, neutralSuccessPose, samplePigeonSuccess, type PigeonSuccessCue, type SuccessPose } from './pigeonSuccess'
import { ropeRestWeight, type PreviewRound } from './previewRound'
import { advanceRope } from './jumpRopeJudgement'
import { ropePeriodMs } from './ropeAcceleration'
import { PigeonDistraction } from './PigeonDistraction'
import type { DistractionPose } from './pigeonDistractionMotion'

const sky = '#e6efeb'
const successBlendMs = 140
const leftPose = { head: [0.01, -0.07, -0.15], eyelids: [0.7, 0.85], gaze: [0.7, 0] } satisfies PigeonPose
const rightPose = { head: [0.08, 0.16, 0.22], eyelids: [0.53, 0.05], gaze: [-0.7, 0.4] } satisfies PigeonPose
const utilityWire = new QuadraticBezierCurve3(
  new Vector3(-5.6, 2.24, -3.46),
  new Vector3(-1.25, 1.57, -3.46),
  new Vector3(3.1, 2.4, -3.46),
)
const wireRadius = 0.014
const audience: { at: number; yaw: number; scale: number; look: PigeonLook; pose: PigeonPose }[] = [
  { at: 0.18, yaw: 0.12, scale: 0.72, look: 'pearl', pose: { head: [0.29, 0.18, -0.1], eyelids: [0.35, 0.48], gaze: [0.42, -0.46] } },
  { at: 0.315, yaw: -0.12, scale: 0.78, look: 'ash', pose: { head: [0.03, -0.38, 0.12], eyelids: [0.72, 0.64], gaze: [-0.62, 0.05] } },
  { at: 0.575, yaw: 0.08, scale: 0.67, look: 'lilac', pose: { head: [0.27, -0.16, 0.13], eyelids: [0.55, 0.43], gaze: [-0.23, -0.55] } },
  { at: 0.79, yaw: -0.13, scale: 0.74, look: 'sage', pose: { head: [0.06, -0.39, -0.16], eyelids: [0.48, 0.7], gaze: [-0.65, 0.02] } },
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
    camera.lookAt(0, 1, 0)
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

function GroundShadow({ x, y = 0.006, z, width, depth }: { x: number; y?: number; z: number; width: number; depth: number }) {
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, depth]} />
      <shaderMaterial vertexShader={shadowVertex} fragmentShader={shadowFragment} transparent depthWrite={false} />
    </mesh>
  )
}

function UtilityPole({ attachment }: { attachment: Vector3 }) {
  const { x, y, z } = attachment
  const ground = -0.17
  const top = y + 0.27
  const height = top - ground

  return (
    <group position={[x, 0, z - 0.19]}>
      <GroundShadow x={0} y={ground + 0.002} z={0} width={0.68} depth={0.49} />
      <mesh position-y={ground + height / 2}>
        <cylinderGeometry args={[0.098, 0.16, height, 8]} />
        <meshStandardMaterial color="#93918a" roughness={1} flatShading />
      </mesh>
      <mesh position-y={y - 0.17}>
        <cylinderGeometry args={[0.117, 0.119, 0.055, 8]} />
        <meshStandardMaterial color="#646964" roughness={0.9} />
      </mesh>
      <mesh position={[0, y - 0.115, 0.095]}>
        <boxGeometry args={[0.088, 0.07, 0.29]} />
        <meshStandardMaterial color="#60655f" roughness={0.9} />
      </mesh>
      <mesh position={[0, y - 0.115, 0.19]}>
        <boxGeometry args={[0.62, 0.07, 0.115]} />
        <meshStandardMaterial color="#73766e" roughness={0.96} />
      </mesh>
      <mesh position={[0, y - 0.051, 0.19]}>
        <cylinderGeometry args={[0.034, 0.056, 0.1, 8]} />
        <meshStandardMaterial color="#e1ded1" roughness={0.85} />
      </mesh>
      <mesh position={[0, y - 0.021, 0.19]}>
        <cylinderGeometry args={[0.06, 0.056, 0.025, 8]} />
        <meshStandardMaterial color="#b7b8ac" roughness={0.9} />
      </mesh>
    </group>
  )
}

function ParkUtilityLine({ showAudience, rigs }: { showAudience: boolean; rigs: (PigeonRig | null)[] }) {
  return (
    <group name="park-utility-line">
      <UtilityPole attachment={utilityWire.v0} />
      <UtilityPole attachment={utilityWire.v2} />
      <mesh name="park-background-wire">
        <tubeGeometry args={[utilityWire, 40, wireRadius, 6, false]} />
        <meshBasicMaterial color="#555954" />
      </mesh>
      <group visible={showAudience}>
        {audience.map(({ at, yaw, scale, look, pose }, index) => {
          const perch = utilityWire.getPoint(at)
          return (
            <group key={at} position={[perch.x, perch.y + wireRadius, perch.z - 0.025 * scale]} rotation-y={yaw} scale={scale}>
              <PigeonActor look={look} pose={pose} rigRef={rig => { rigs[index] = rig }} />
            </group>
          )
        })}
      </group>
    </group>
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

function nodAtGrip(grip: Group, base: [number, number, number], phase: number, strength: number) {
  // The grip is a child of the head, so its world position follows the nod.
  grip.parent?.rotation.set(
    base[0] + strength * (0.17 * Math.sin(phase) + 0.025 * Math.sin(phase * 2)),
    base[1] + strength * 0.035 * Math.cos(phase),
    base[2] + strength * 0.06 * Math.sin(phase - 0.6),
  )
}

function applyPigeonReaction(rig: PigeonRig, base: PigeonPose, pose: SuccessPose, laugh: ReturnType<typeof samplePigeonLaugh>) {
  rig.head.rotation.x = rig.head.rotation.x * (1 - laugh.lean) + pose.pitch + laugh.pitch
  rig.head.rotation.y = rig.head.rotation.y * (1 - 0.55 * laugh.lean) + pose.yaw
  rig.head.rotation.z = rig.head.rotation.z * (1 - 0.8 * laugh.lean) + pose.roll
  rig.head.position.set(pigeonHeadPivot[0], pigeonHeadPivot[1] + laugh.headLift, pigeonHeadPivot[2] + laugh.headForward)
  rig.leftWing.rotation.y = (base.leftWing?.[1] ?? 0) + pose.leftWing
  rig.rightWing.rotation.y = (base.rightWing?.[1] ?? 0) - pose.rightWing
  rig.leftWing.rotation.z = (base.leftWing?.[2] ?? 0) - pose.leftWing * 0.46
  rig.rightWing.rotation.z = (base.rightWing?.[2] ?? 0) + pose.rightWing * 0.46
  rig.jaw.rotation.x = (base.jaw ?? 0) + laugh.jaw
  // The feet are siblings of the body, so they stay planted during the laugh.
  rig.body.position.y = laugh.lift
  rig.body.rotation.z = pose.bodyRoll
  rig.setLidLift(pose.lidLift + laugh.lidLift)
}

export function PreviewScene({ settings, demoRef, successDemoRef, simulationRef, sampleDistraction, round, step }: {
  settings: PreviewSettings
  demoRef: RefObject<Demo | null>
  successDemoRef: RefObject<PigeonSuccessCue | null>
  simulationRef: RefObject<RopeSimulation | null>
  sampleDistraction: (now: number) => DistractionPose | null
  round: PreviewRound
  step: (now: number) => void
}) {
  const leftGrip = useRef<Group>(null)
  const rightGrip = useRef<Group>(null)
  const holderLeft = useRef<PigeonRig>(null)
  const holderRight = useRef<PigeonRig>(null)
  const audienceRigs = useRef<(PigeonRig | null)[]>([])
  const successFrame = useRef<{ cue: PigeonSuccessCue | null; from: SuccessPose[]; poses: SuccessPose[] }>({ cue: null, from: [], poses: [] })
  const { geometry, update, left, right, center } = useMemo(() => ({
    ...createGameRopeGeometry(),
    left: new Vector3(), right: new Vector3(), center: new Vector3(),
  }), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(() => {
    const now = performance.now()
    step(now)
    const { motion, phase } = round
    const simulation = simulationRef.current
    if (simulation) {
      const clock = settings.autoAcceleration ? { profile: settings, playedMs: simulation.sampleSeconds * 1000 } : undefined
      const sampleSpeed = 1000 / ropePeriodMs(settings.ropeSpeed, clock)
      simulation.angle = advanceRope(simulation.angle, simulation.lastAt, now, sampleSpeed).angle
      simulation.lastAt = now
    }
    const ropeAngle = simulation?.angle ?? motion.angle
    const demo = demoRef.current
    const elapsedMs = demo ? now - demo.startedAt : Infinity
    const laughDemo = demo?.action === 'laugh' || demo?.action === 'miss' ? demo : null
    const laughElapsed = phase.kind === 'reaction' ? now - phase.startedAt
      : laughDemo ? elapsedMs : Infinity
    const laughDuration = phase.kind === 'reaction' ? phase.durationMs : laughDemo?.durationMs ?? 0

    const live = round.successCue
    const preview = successDemoRef.current
    const candidate = preview && (!live || preview.startedAt >= live.startedAt) ? preview : live
    const canReact = (phase.kind === 'playing' || phase.kind === 'initialCountdown') && laughElapsed >= laughDuration
    const success = canReact && candidate && (!laughDemo || candidate.startedAt > laughDemo.startedAt)
      && isSuccessActive(candidate, now) ? candidate : null
    const frame = successFrame.current
    if (frame.cue !== success) {
      frame.from = frame.cue && success ? frame.poses.slice() : []
      frame.cue = success
    }

    function successPose(role: 'holder' | 'audience', index: number) {
      const slot = role === 'holder' ? index : index + 2
      const target = success ? samplePigeonSuccess(success, role, index, now) : neutralSuccessPose
      const from = frame.from[slot]
      const transition = success ? (now - success.startedAt) / successBlendMs : 1
      const pose = from && transition < 1 ? blendSuccessPose(from, target, transition) : target
      frame.poses[slot] = pose
      return pose
    }

    audience.forEach(({ pose }, index) => {
      const rig = audienceRigs.current[index]
      if (!rig) return
      rig.head.rotation.set(...(pose.head ?? [0, 0, 0]))
      applyPigeonReaction(rig, pose, successPose('audience', index), samplePigeonLaugh('audience', index, laughElapsed, laughDuration, settings.laughTilt))
    })

    const gripL = leftGrip.current, gripR = rightGrip.current
    if (gripL && gripR) {
      nodAtGrip(gripL, leftPose.head, ropeAngle, settings.pigeonNod)
      nodAtGrip(gripR, rightPose.head, ropeAngle + 0.57, settings.pigeonNod * 0.83)
      if (holderLeft.current) {
        applyPigeonReaction(holderLeft.current, leftPose, successPose('holder', 0), samplePigeonLaugh('holder', 0, laughElapsed, laughDuration, settings.laughTilt))
      }
      if (holderRight.current) {
        applyPigeonReaction(holderRight.current, rightPose, successPose('holder', 1), samplePigeonLaugh('holder', 1, laughElapsed, laughDuration, settings.laughTilt))
      }
      gripL.getWorldPosition(left)
      gripR.getWorldPosition(right)
      const radius = settings.ropeWidth / 2
      ropeCenter(center, ropeAngle, settings.avatarX, settings.avatarZ, settings.avatarScale,
        settings.ropeHeight, settings.ropeSag, radius)
      if (!simulation) center.z -= (0.5 * settings.avatarScale + radius) * ropeRestWeight(round, now)
      update(left, right, center, radius)
    }
  }, -1)

  const halfGap = settings.pigeonGap / 2
  return (
    <>
      <PreviewCamera angle={settings.cameraAngle} distance={settings.cameraDistance} height={settings.cameraHeight} fov={settings.fov} />
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 10, 21]} />
      <hemisphereLight args={['#fff5e4', '#788f87', 1.95]} />
      <directionalLight position={[2.5, 6, 4]} intensity={2.25} />
      <ParkCourt />
      <ParkUtilityLine showAudience={settings.audience} rigs={audienceRigs.current} />

      <GroundShadow x={settings.avatarX} z={settings.avatarZ} width={0.95 * settings.avatarScale} depth={0.62 * settings.avatarScale} />
      <group position={[settings.avatarX, 0, settings.avatarZ]}>
        <MissShockEffect round={round} demoRef={demoRef} scale={settings.avatarScale}>
          {shock => <Suspense fallback={null}><PreviewAvatar motion={round.motion} scale={settings.avatarScale} shock={shock} /></Suspense>}
        </MissShockEffect>
      </group>
      <GroundShadow x={-halfGap} z={-0.08} width={1.13 * settings.pigeonScale} depth={0.95 * settings.pigeonScale} />
      <group position={[-halfGap, 0, 0]} rotation={[0, 0.76, 0]} scale={settings.pigeonScale}>
        <PigeonActor look="sage" pose={leftPose} gripRef={leftGrip} rigRef={holderLeft} />
      </group>
      <GroundShadow x={halfGap} z={-0.08} width={1.13 * settings.pigeonScale} depth={0.95 * settings.pigeonScale} />
      <group position={[halfGap, 0, 0]} rotation={[0, -0.67, 0]} scale={settings.pigeonScale}>
        <PigeonActor look="lilac" pose={rightPose} gripRef={rightGrip} rigRef={holderRight} />
      </group>

      <mesh geometry={geometry} frustumCulled={false} name="park-jump-rope">
        <meshStandardMaterial color="#374a47" roughness={0.88} />
      </mesh>
      <PigeonDistraction sample={sampleDistraction} shadow={<GroundShadow x={0} z={0} width={1.02} depth={0.75} />} />
    </>
  )
}
