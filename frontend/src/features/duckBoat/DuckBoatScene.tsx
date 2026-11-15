import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { MOVEMENT } from '../../config'
import { AVATAR } from '../../config/avatar'
import type { PredictionSimulation } from '../../network/localMovementPrediction'
import { characterUrls, createCharacterRig } from '../../world/art/CharacterRig'
import { createClipPose } from '../../world/art/characterClips'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { Buildings } from '../../../park-renewal-preview/Buildings'
import { CityBackdrop, ParkEnvironment } from '../../../park-renewal-preview/CityBackdrop'
import { ScenicDetails } from '../../../park-renewal-preview/ScenicDetails'
import { models } from '../../../park-renewal-preview/modelUrls'
import { LAKE, walkHeightAt } from '../../../park-renewal-preview/plan'
import { parkDisembark, parkWalkStart, returnRoute, returnStep, steer, walk, walkStart, type duckBoatDock } from './motion'

export type Stage = 'walk' | 'rent' | 'ride' | 'return' | 'done'
export type Direction = 'forward' | 'left' | 'back' | 'right'

interface Props {
  dock: ReturnType<typeof duckBoatDock>
  walker?: PredictionSimulation
  stage: Stage
  held: RefObject<Map<string, Direction>>
  onReach: (near: boolean) => void
  onReturned: () => void
  onReady: () => void
}

const footOffset = MOVEMENT.halfHeight + MOVEMENT.radius + MOVEMENT.offset
const walkingStep = 1 / 60

function groundPose(pose: {x: number; z: number; yaw: number}) {
  return { ...pose, y: walkHeightAt(pose.x, pose.z) + footOffset }
}

export function DuckBoatScene({ dock, walker, stage, held, onReach, onReturned, onReady }: Props) {
  const { berth, landing, hullHeight } = dock
  const avatar = useRef<Group>(null)
  const boatGroup = useRef<Group>(null)
  const character = useLoader(ParkAssetLoader, characterUrls[0]!)
  const boat = useLoader(ParkAssetLoader, models.boat!)
  const rig = useMemo(() => createCharacterRig(character), [character])
  const hull = useMemo(() => boat.scene.clone(true), [boat])
  const driver = hull.getObjectByName('anchor_driver')!.position
  const motion = useRef({
    player: walker ? parkWalkStart : walkStart, boat: berth, lastStage: 'walk' as Stage, near: false,
    walkingTime: 0, centerHeight: undefined as number | undefined,
    route: [] as ReturnType<typeof returnRoute>, targetIndex: 0,
    eye: new Vector3(), look: new Vector3(), target: new Vector3(), driverPosition: new Vector3(),
    started: false, arrivalSent: false, gait: createClipPose(),
  })

  useEffect(() => () => rig.dispose(), [rig])
  useEffect(() => {
    if (walker) walker.reset(groundPose(parkWalkStart), 0, true)
    onReady()
  }, [onReady, walker])

  // Renewal scenery uses positive frame priorities for visibility updates.
  useFrame(({ gl, scene, camera }) => gl.render(scene, camera), 1)

  useFrame(({ camera, size }, delta) => {
    if (!avatar.current || !boatGroup.current) return
    const state = motion.current
    const dt = Math.min(delta, .2)
    const across = Number(hasDirection(held.current, 'right')) - Number(hasDirection(held.current, 'left'))
    const forward = Number(hasDirection(held.current, 'forward')) - Number(hasDirection(held.current, 'back'))
    const aboard = stage === 'ride' || stage === 'return'
    const previousStage = state.lastStage
    state.lastStage = stage
    let moving = false

    if (stage === 'walk' && walker) {
      const length = Math.max(1, Math.hypot(across, forward))
      const input = { dx: across / length, dz: -forward / length, run: false, jump: false }
      state.walkingTime += dt
      const old = state.player
      while (state.walkingTime >= walkingStep) {
        walker.step(input, walkingStep)
        state.walkingTime -= walkingStep
      }
      const pose = walker.pose()
      moving = Math.hypot(pose.x - old.x, pose.z - old.z) > .001
      state.player = pose
      state.centerHeight = pose.y
    } else if (stage === 'walk') {
      for (let remaining = dt; remaining > 0; remaining -= .05) {
        const next = walk(state.player, across, forward, Math.min(remaining, .05))
        moving ||= next !== state.player
        state.player = next
      }
    } else if (stage === 'ride') {
      if (previousStage !== 'ride') state.boat = berth
      for (let remaining = dt; remaining > 0; remaining -= .05) {
        state.boat = steer(state.boat, across, forward, Math.min(remaining, .05))
      }
    } else if (stage === 'return') {
      if (previousStage !== 'return') {
        state.route = returnRoute(state.boat, berth)
        state.targetIndex = 0
        state.arrivalSent = false
      }
      const target = state.route[state.targetIndex]
      if (target) {
        state.boat = returnStep(state.boat, target, dt)
        if (Math.hypot(state.boat.x - target.x, state.boat.z - target.z) < .02) state.targetIndex++
      } else if (!state.arrivalSent) {
        state.arrivalSent = true
        state.boat = berth
        state.player = walker ? parkDisembark : landing
        if (walker) {
          const pose = groundPose(state.player)
          walker.reset(pose, 0, true)
          state.centerHeight = pose.y
          state.walkingTime = 0
        }
        onReturned()
      }
    }

    const reachable = stage === 'walk' && dock.canRent(state.player, state.centerHeight)
    if (state.near !== reachable) {
      state.near = reachable
      onReach(reachable)
    }
    boatGroup.current.position.set(state.boat.x, hullHeight, state.boat.z)
    boatGroup.current.rotation.y = state.boat.yaw

    rig.reset()
    if (aboard) {
      boatGroup.current.updateMatrixWorld(true)
      state.driverPosition.copy(driver)
      boatGroup.current.localToWorld(state.driverPosition)
      avatar.current.position.copy(state.driverPosition)
      avatar.current.position.y += (rig.seatedContactLift - rig.hipHeight) * AVATAR.scale
      avatar.current.rotation.y = state.boat.yaw + Math.PI
      for (const side of ['L', 'R'] as const) {
        rig.set(`upperLeg_${side}`, -Math.PI / 2)
        rig.set(`lowerLeg_${side}`, Math.PI * .37)
        rig.set(`upperArm_${side}`, -.45)
        rig.set(`lowerArm_${side}`, -.8)
      }
    } else {
      const { x, z, yaw } = state.player
      const floor = state.centerHeight === undefined ? walkHeightAt(x, z) : state.centerHeight - footOffset
      avatar.current.position.set(x, floor, z)
      avatar.current.rotation.y = yaw
      state.gait.ground(dt, Number(moving), 0, rig.set)
    }
    rig.apply(dt)

    if (aboard) {
      const { x, z, yaw } = state.boat
      const offset = size.width < size.height ? 8.8 : 6.6
      state.eye.set(x + Math.sin(yaw) * offset, LAKE.y + 3.7, z + Math.cos(yaw) * offset)
      // At the berth, look from the water side of the kiosk instead of through its roof.
      const dockView = Math.max(0, 1 - Math.hypot(x - berth.x, z - berth.z) / 9)
      state.look.set(x - 5, LAKE.y + 5.2, z + 1.8)
      state.eye.lerp(state.look, dockView)
      state.look.set(x - Math.sin(yaw) * 3, LAKE.y + .9, z - Math.cos(yaw) * 3)
    } else {
      const { x, z } = state.player
      const y = avatar.current.position.y
      state.eye.set(x - 3.4, y + 3.1, z + 5.1)
      state.look.set(x + 1.1, y + .9, z - 1.4)
    }
    const board = stage === 'ride' && previousStage !== 'ride'
    const blend = state.started && !board ? 1 - Math.exp(-dt * 8) : 1
    camera.position.lerp(state.eye, blend)
    state.target.lerp(state.look, blend)
    camera.lookAt(state.target)
    state.started = true
  })

  return <>
    <ParkEnvironment night={false} />
    <CityBackdrop />
    <directionalLight position={[-100, 190, 90]} intensity={2.2} color="#fff0d6" />
    <ScenicDetails />
    <Buildings ambientBoats={false} />
    <group name="rental-duck-boat" ref={boatGroup}><primitive object={hull} dispose={null} /></group>
    <group name="duck-boat-driver" ref={avatar} scale={AVATAR.scale}><primitive object={rig.root} dispose={null} /></group>
  </>
}

function hasDirection(held: Map<string, Direction>, direction: Direction) {
  for (const value of held.values()) if (value === direction) return true
  return false
}
