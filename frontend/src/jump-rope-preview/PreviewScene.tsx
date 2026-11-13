import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CatmullRomCurve3, PerspectiveCamera, QuadraticBezierCurve3, Vector3, type Group } from 'three'
import type { Demo, FinalePreview, PreviewSettings, RopeSimulation } from './JumpRopePreview'
import { PigeonActor, pigeonHeadPivot, type PigeonLook, type PigeonPose, type PigeonRig } from './PigeonActor'
import { PreviewAvatar } from './PreviewAvatar'
import { AlleyBackdrop } from './AlleyBackdrop'
import { ConcreteCourt } from './ConcreteCourt'
import { MissShockEffect } from './MissShockEffect'
import { createGameRopeGeometry, ropeCenter } from './gameRopeGeometry'
import { samplePigeonLaugh } from './pigeonLaugh'
import { blendSuccessPose, isSuccessActive, neutralSuccessPose, samplePigeonSuccess, type PigeonSuccessCue, type SuccessPose } from './pigeonSuccess'
import { ropeRestWeight, type PreviewRound } from './previewRound'
import { advanceRope, ropeGroundGap } from './jumpRopeJudgement'
import { ropePeriodMs } from './ropeAcceleration'
import { PigeonDistraction } from './PigeonDistraction'
import type { DistractionPose } from './pigeonDistractionMotion'
import { finaleImpactMs, sampleFinaleFlight } from './gameOverFinale'
import { completionEase, completionResultMs, sampleExhaustedHolder, sampleResignedAudience } from './completionFinale'
import { GrandpaIntruder } from './GrandpaIntruder'
import { grandpaFreeze, grandpaSuppressesReactions, sampleAudienceHop, sampleAvatarExtras, type AvatarExtras } from './grandpaPose'

const sky = '#a0caea'
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
const finalePigeon = 2
const dropFlightMs = 200
const dropReleasePath = sampleFinaleFlight(finaleImpactMs - dropFlightMs)!.path
const perches = audience.map(({ at, scale }) => {
  const point = utilityWire.getPoint(at)
  return point.set(point.x, point.y + wireRadius, point.z - 0.025 * scale)
})

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

function ParkUtilityLine({ showAudience, rigs, birds }: {
  showAudience: boolean; rigs: (PigeonRig | null)[]; birds: (Group | null)[]
}) {
  return (
    <group name="park-utility-line">
      <UtilityPole attachment={utilityWire.v0} />
      <UtilityPole attachment={utilityWire.v2} />
      <mesh name="park-background-wire">
        <tubeGeometry args={[utilityWire, 40, wireRadius, 6, false]} />
        <meshBasicMaterial color="#555954" />
      </mesh>
      {audience.map(({ at, yaw, scale, look, pose }, index) => (
        <group key={at} ref={bird => { birds[index] = bird }} visible={showAudience}
          position={perches[index]!} rotation-y={yaw} scale={scale}>
          <PigeonActor look={look} pose={pose} rigRef={rig => { rigs[index] = rig }} />
        </group>
      ))}
    </group>
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
  rig.leftWing.rotation.x = base.leftWing?.[0] ?? 0
  rig.rightWing.rotation.x = base.rightWing?.[0] ?? 0
  rig.leftWing.rotation.y = (base.leftWing?.[1] ?? 0) + pose.leftWing
  rig.rightWing.rotation.y = (base.rightWing?.[1] ?? 0) - pose.rightWing
  rig.leftWing.rotation.z = (base.leftWing?.[2] ?? 0) - pose.leftWing * 0.46
  rig.rightWing.rotation.z = (base.rightWing?.[2] ?? 0) + pose.rightWing * 0.46
  rig.jaw.rotation.x = (base.jaw ?? 0) + laugh.jaw
  // The feet are siblings of the body, so they stay planted during the laugh.
  rig.body.position.y = laugh.lift
  rig.body.rotation.x = 0
  rig.body.rotation.z = pose.bodyRoll
  rig.setLidLift(pose.lidLift + laugh.lidLift)
  rig.setGaze(base.gaze?.[0] ?? 0, base.gaze?.[1] ?? 0)
}

export function PreviewScene({ settings, demoRef, successDemoRef, simulationRef, sampleDistraction, round, step, sceneTime, getFinalePreview, grandpa = false }: {
  settings: PreviewSettings
  demoRef: RefObject<Demo | null>
  successDemoRef: RefObject<PigeonSuccessCue | null>
  simulationRef: RefObject<RopeSimulation | null>
  /** One pose per distraction track, so two scheduled distractions can play at once. */
  sampleDistraction: (now: number) => (DistractionPose | null)[]
  round: PreviewRound
  step: (now: number) => void
  sceneTime: (now: number) => number
  getFinalePreview: () => FinalePreview | null
  /** Story 420 stage 1: mounts the grandpa raid. The ranked game never passes it. */
  grandpa?: boolean
}) {
  const avatarExtras = useRef<AvatarExtras>({ duck: 0, stun: 0, stunAgeMs: 0 })
  // The grandpa preview stages the rope closer to the camera. The ranked game keeps the original court.
  const forward = grandpa ? settings.courtForward : 0
  const avatarZ = settings.avatarZ + forward
  const leftGrip = useRef<Group>(null)
  const rightGrip = useRef<Group>(null)
  const holderLeft = useRef<PigeonRig>(null)
  const holderRight = useRef<PigeonRig>(null)
  const audienceRigs = useRef<(PigeonRig | null)[]>([])
  const audienceGroups = useRef<(Group | null)[]>([])
  // The start point is a copy: a poop raid sets it to the raider's own perch each frame.
  const flightPath = useMemo(() => new CatmullRomCurve3([
    perches[finalePigeon]!.clone(), new Vector3(), new Vector3(), new Vector3(),
  ]), [])
  const heading = useMemo(() => new Vector3(), [])
  const drop = useRef<Group>(null)
  const manholePose = useRef<DistractionPose | null>(null)
  const firstIntruder = useRef<DistractionPose | null>(null)
  const secondIntruder = useRef<DistractionPose | null>(null)
  const dropTarget = useMemo(() => new Vector3(), [])
  const successFrame = useRef<{ cue: PigeonSuccessCue | null; from: SuccessPose[]; poses: SuccessPose[] }>({ cue: null, from: [], poses: [] })
  const completionFrom = useRef<SuccessPose[] | null>(null)
  const { geometry, update, left, right, center } = useMemo(() => ({
    ...createGameRopeGeometry(),
    left: new Vector3(), right: new Vector3(), center: new Vector3(),
  }), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ camera }) => {
    const wallNow = performance.now()
    step(wallNow)
    const lanes = sampleDistraction(wallNow)
    // Each track has its own intruder pigeon. The manhole and the poop raid occur at most once at a time.
    manholePose.current = lanes.find(pose => pose?.kind === 'manhole') ?? null
    ;[firstIntruder, secondIntruder].forEach((intruder, lane) => {
      const pose = lanes[lane] ?? null
      intruder.current = pose?.kind === 'poop' ? null : pose
    })
    const raidPose = lanes.find(pose => pose?.kind === 'poop') ?? null
    const now = sceneTime(wallNow)
    const { motion, phase } = round
    const finalePreview = getFinalePreview()
    const finaleAge = finalePreview?.reason === 'missLimit' ? wallNow - finalePreview.startedAt
      : phase.kind === 'gameOver' ? now - phase.startedAt
        : round.endReason === 'missLimit' ? Infinity : null
    const completionAge = finalePreview?.reason === 'time' ? wallNow - finalePreview.startedAt
      : phase.kind === 'completion' ? now - phase.startedAt
        : round.endReason === 'time' ? completionResultMs : null
    const isFinale = finaleAge !== null || completionAge !== null
    const simulation = simulationRef.current
    if (simulation) {
      const clock = settings.autoAcceleration ? { profile: settings, playedMs: simulation.sampleSeconds * 1000 } : undefined
      const sampleSpeed = 1000 / ropePeriodMs(settings.ropeSpeed, clock)
      simulation.angle = advanceRope(simulation.angle, simulation.lastAt, now, sampleSpeed).angle
      simulation.lastAt = now
    }
    const ropeAngle = simulation?.angle ?? motion.angle
    const raid = grandpa && !round.ranked ? round.grandpa : undefined
    // The pigeons hold their GOOD, PERFECT, combo and MISS reactions while the grandpa visits.
    const quiet = grandpaSuppressesReactions(raid)
    const freeze = raid ? grandpaFreeze(round, now) : 0
    avatarExtras.current = sampleAvatarExtras(raid, round)
    const demo = demoRef.current
    const elapsedMs = demo ? now - demo.startedAt : Infinity
    const laughDemo = demo?.action === 'laugh' || demo?.action === 'miss' ? demo : null
    const laughElapsed = isFinale || quiet ? Infinity : phase.kind === 'reaction' ? now - phase.startedAt
      : laughDemo ? elapsedMs : Infinity
    const laughDuration = phase.kind === 'reaction' ? phase.durationMs : laughDemo?.durationMs ?? 0

    const live = round.successCue
    const preview = successDemoRef.current
    const candidate = preview && (!live || preview.startedAt >= live.startedAt) ? preview : live
    const canReact = !isFinale && !quiet && (phase.kind === 'playing' || phase.kind === 'initialCountdown' || phase.kind === 'menu') && laughElapsed >= laughDuration
    const success = canReact && candidate && (!laughDemo || candidate.startedAt > laughDemo.startedAt)
      && isSuccessActive(candidate, now) ? candidate : null
    const frame = successFrame.current
    if (completionAge === null) completionFrom.current = null
    else completionFrom.current ??= frame.poses.slice()
    if (frame.cue !== success) {
      frame.from = frame.cue && success ? frame.poses.slice() : []
      frame.cue = success
    }

    function successPose(role: 'holder' | 'audience', index: number) {
      const slot = role === 'holder' ? index : index + 2
      if (completionAge !== null) {
        const before = completionFrom.current?.[slot] ?? neutralSuccessPose
        const pose = blendSuccessPose(before, neutralSuccessPose, completionAge / 220)
        frame.poses[slot] = pose
        return pose
      }
      const target = success ? samplePigeonSuccess(success, role, index, now) : neutralSuccessPose
      const from = frame.from[slot]
      const transition = success ? (now - success.startedAt) / successBlendMs : 1
      const pose = from && transition < 1 ? blendSuccessPose(from, target, transition) : target
      frame.poses[slot] = pose
      return pose
    }

    if (drop.current) drop.current.visible = false
    // A poop raid flies the game-over path from its raider's perch. The game-over finale always takes precedence.
    const poopRaid = finaleAge === null && raidPose?.kind === 'poop' ? raidPose : null
    const attacker = finaleAge !== null ? finalePigeon : poopRaid ? poopRaid.pigeon : -1
    const attackAge = finaleAge ?? poopRaid?.elapsed ?? null
    audience.forEach(({ pose, yaw }, index) => {
      const rig = audienceRigs.current[index]
      const bird = audienceGroups.current[index]
      if (!rig || !bird) return
      const attacking = index === attacker && attackAge !== null
      const flight = attacking ? sampleFinaleFlight(attackAge) : null
      bird.visible = attacking ? flight !== null : settings.audience || completionAge !== null
      bird.position.copy(perches[index]!)
      bird.rotation.set(0, yaw, 0)
      rig.leftWing.rotation.set(0, 0, 0)
      rig.rightWing.rotation.set(0, 0, 0)
      for (const { foot } of rig.legs) foot.rotation.x = 0
      rig.head.rotation.set(...(pose.head ?? [0, 0, 0]))
      const reaction = successPose('audience', index)
      applyPigeonReaction(rig, pose, reaction, samplePigeonLaugh('audience', index, laughElapsed, laughDuration, settings.laughTilt))
      if (raid && !isFinale) {
        // Hop in place on the wire as the broom swings, and settle back onto it through a MISS freeze.
        const hop = sampleAudienceHop(raid, round.playedMs, index)
        const awake = 1 - freeze
        bird.position.y += hop.lift * awake
        rig.leftWing.rotation.y += 1.2 * hop.flap * awake
        rig.rightWing.rotation.y -= 1.2 * hop.flap * awake
        rig.leftWing.rotation.z -= 0.5 * hop.flap * awake
        rig.rightWing.rotation.z += 0.5 * hop.flap * awake
        for (const { foot } of rig.legs) foot.rotation.x = 0.5 * Math.min(1, hop.lift * 6) * awake
      }
      if (completionAge !== null) {
        const poseEnd = sampleResignedAudience(completionAge, index)
        const facing = Math.atan2(settings.avatarX - bird.position.x, avatarZ - bird.position.z) - yaw
        rig.head.rotation.y += poseEnd.yaw + (facing - (pose.head?.[1] ?? 0)) * poseEnd.slump
        rig.head.rotation.x += poseEnd.pitch
        rig.head.rotation.z += poseEnd.roll
        rig.head.position.y -= poseEnd.headDrop
        rig.head.position.z += poseEnd.headForward
        rig.body.position.y += poseEnd.sink
        rig.body.rotation.x = 0.1 * poseEnd.slump
        rig.leftWing.rotation.x += poseEnd.wingDrop
        rig.rightWing.rotation.x += poseEnd.wingDrop
        rig.setLidLift(reaction.lidLift + poseEnd.lidLift)
        rig.setGaze(
          (pose.gaze?.[0] ?? 0) * (1 - poseEnd.slump) + poseEnd.gazeX,
          (pose.gaze?.[1] ?? 0) * (1 - poseEnd.slump) + poseEnd.gazeY,
        )
      }
      if (!flight) return
      const lean = flight.lean * flight.lean * (3 - 2 * flight.lean)
      rig.head.rotation.x += 0.47 * lean - 0.53 * flight.wing
      rig.head.rotation.y -= 0.22 * lean
      if (flight.path === 0) return

      flightPath.points[0]!.copy(perches[index]!)
      flightPath.points[1]!.set(settings.avatarX + 0.18, Math.max(2.5, 2.85 * settings.avatarScale), avatarZ + 0.12)
      flightPath.points[2]!.set(0.12, -0.09, -2.04).applyMatrix4(camera.matrixWorld)
      flightPath.points[3]!.set(3.6, 0.72, -1.4).applyMatrix4(camera.matrixWorld)
      flightPath.getPoint(flight.path, bird.position)
      flightPath.getTangent(flight.path, heading)
      const turn = Math.atan2(heading.x, heading.z) - yaw
      bird.rotation.set(-0.2 * heading.y * flight.wing, yaw + Math.atan2(Math.sin(turn), Math.cos(turn)) * flight.wing,
        (0.07 * flight.beat - 0.36 * Math.max(0, (flight.path - 0.48) / 0.52)) * flight.wing)
      const spread = (1.42 + 0.14 * flight.beat) * flight.wing
      const flap = (0.12 + 0.93 * flight.beat) * flight.wing
      rig.leftWing.rotation.set(-0.12 * flight.wing, spread, flap, 'ZXY')
      rig.rightWing.rotation.set(-0.12 * flight.wing, -spread, -flap, 'ZXY')
      rig.head.rotation.x -= 0.08 * flight.beat * flight.wing
      for (const { foot } of rig.legs) foot.rotation.x = 0.43 * flight.wing

      if (drop.current && attackAge !== null && attackAge >= finaleImpactMs - dropFlightMs && attackAge < finaleImpactMs) {
        const progress = 1 - (finaleImpactMs - attackAge) / dropFlightMs
        flightPath.getPoint(dropReleasePath, drop.current.position)
        drop.current.position.y += 0.13
        dropTarget.set(0, -0.05, -0.35).applyMatrix4(camera.matrixWorld)
        drop.current.position.lerp(dropTarget, progress * progress)
        drop.current.rotation.set(progress * 4, progress * 3, progress * 6)
        drop.current.visible = true
      }
    })

    const gripL = leftGrip.current, gripR = rightGrip.current
    if (gripL && gripR) {
      nodAtGrip(gripL, leftPose.head, ropeAngle, settings.pigeonNod)
      nodAtGrip(gripR, rightPose.head, ropeAngle + 0.57, settings.pigeonNod * 0.83)
      function poseHolder(rig: PigeonRig | null, base: PigeonPose, index: number) {
        if (!rig) return
        const reaction = successPose('holder', index)
        applyPigeonReaction(rig, base, reaction, samplePigeonLaugh('holder', index, laughElapsed, laughDuration, settings.laughTilt))
        if (completionAge === null) return
        const slump = sampleExhaustedHolder(completionAge, index)
        rig.body.position.y += slump.sink
        rig.body.rotation.z += slump.roll
        rig.head.rotation.x += slump.pitch
        rig.leftWing.rotation.x += slump.wingDrop
        rig.rightWing.rotation.x += slump.wingDrop
        rig.setLidLift(reaction.lidLift + slump.lidLift)
      }
      poseHolder(holderLeft.current, leftPose, 0)
      poseHolder(holderRight.current, rightPose, 1)
      gripL.getWorldPosition(left)
      gripR.getWorldPosition(right)
      const radius = settings.ropeWidth / 2
      ropeCenter(center, ropeAngle, settings.avatarX, avatarZ, settings.avatarScale,
        settings.ropeHeight, settings.ropeSag, radius)
      if (!simulation) center.z -= (0.5 * settings.avatarScale + radius) * ropeRestWeight(round, now)
      if (completionAge !== null) {
        // Move to the same side as the stopped arc before lowering it, away from the avatar.
        const side = center.z > avatarZ + 0.001 ? 1 : -1
        const offset = Math.max(Math.abs(center.z - avatarZ), 0.76 * settings.avatarScale)
        center.z += (avatarZ + side * offset - center.z) * completionEase(completionAge, 0, 330)
        center.y += (radius + ropeGroundGap - center.y) * completionEase(completionAge, 210, 820)
      }
      update(left, right, center, radius)
    }
  }, -1)

  const halfGap = settings.pigeonGap / 2
  return (
    <>
      <PreviewCamera angle={settings.cameraAngle} distance={settings.cameraDistance} height={settings.cameraHeight} fov={settings.fov} />
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 13.5, 29]} />
      <hemisphereLight args={['#fff5e4', '#788f87', 1.95]} />
      <directionalLight position={[2.5, 6, 4]} intensity={2.25} />
      <ConcreteCourt distractionPose={manholePose} />
      <AlleyBackdrop />
      <ParkUtilityLine showAudience={settings.audience} rigs={audienceRigs.current} birds={audienceGroups.current} />
      <group ref={drop} visible={false}>
        <mesh scale={[0.075, 0.055, 0.09]}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#795338" flatShading />
        </mesh>
        <mesh position={[0.025, 0.025, -0.023]} scale={[0.038, 0.037, 0.045]}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#a17a53" flatShading />
        </mesh>
      </group>

      <GroundShadow x={settings.avatarX} z={avatarZ} width={0.95 * settings.avatarScale} depth={0.62 * settings.avatarScale} />
      <group position={[settings.avatarX, 0, avatarZ]}>
        <MissShockEffect round={round} demoRef={demoRef} scale={settings.avatarScale} sceneTime={sceneTime} getFinalePreview={getFinalePreview}>
          {shock => <Suspense fallback={null}>
            <PreviewAvatar motion={round.motion} scale={settings.avatarScale} shock={shock} extras={grandpa ? avatarExtras : undefined} />
          </Suspense>}
        </MissShockEffect>
      </group>
      {grandpa && <Suspense fallback={null}>
        <GrandpaIntruder round={round} sceneTime={sceneTime} avatar={{ x: settings.avatarX, z: avatarZ }} getFinalePreview={getFinalePreview} />
      </Suspense>}
      <GroundShadow x={-halfGap} z={forward - 0.08} width={1.13 * settings.pigeonScale} depth={0.95 * settings.pigeonScale} />
      <group position={[-halfGap, 0, forward]} rotation={[0, 0.76, 0]} scale={settings.pigeonScale}>
        <PigeonActor look="sage" pose={leftPose} gripRef={leftGrip} rigRef={holderLeft} />
      </group>
      <GroundShadow x={halfGap} z={forward - 0.08} width={1.13 * settings.pigeonScale} depth={0.95 * settings.pigeonScale} />
      <group position={[halfGap, 0, forward]} rotation={[0, -0.67, 0]} scale={settings.pigeonScale}>
        <PigeonActor look="lilac" pose={rightPose} gripRef={rightGrip} rigRef={holderRight} />
      </group>

      <mesh geometry={geometry} frustumCulled={false} name="park-jump-rope">
        <meshStandardMaterial color="#374a47" roughness={0.88} />
      </mesh>
      <PigeonDistraction poseRef={firstIntruder} shadow={<GroundShadow x={0} z={0} width={1.02} depth={0.75} />} />
      <PigeonDistraction poseRef={secondIntruder} look="pearl" lift={0.32} nearer={0.4} shadow={<GroundShadow x={0} z={0} width={1.02} depth={0.75} />} />
    </>
  )
}
