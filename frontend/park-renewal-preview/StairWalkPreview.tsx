import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { ParkAssetLoader } from '../src/world/art/assetLoader'
import { characterUrls, createCharacterRig } from '../src/world/art/CharacterRig'
import { createGait, sampleGait } from '../src/world/art/characterMotion'
import { MONUMENT_STAIRS as stairs, walkHeightAt } from './plan'
import { createStairWalk, STAIR_WALK_TICK, stepStairWalk } from './stairWalk'
import { buildStairFlight, createFlightWalker, stepFlightWalker, type FlightId } from './stairFlightWalk'
import { stairFlightOptions, type StairFlightId } from './stairFlightOptions'

const keys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'])

export default function StairWalkPreview({ lane }: { lane: number }) {
  const [flight, setFlight] = useState(() => {
    const id = new URLSearchParams(window.location.search).get('flight') ?? 'monument'
    return Object.hasOwn(stairFlightOptions, id) ? id as StairFlightId : 'monument'
  })
  useEffect(() => {
    const change = (event: Event) => setFlight((event as CustomEvent<StairFlightId>).detail)
    window.addEventListener('park-stair-flight', change)
    return () => window.removeEventListener('park-stair-flight', change)
  }, [])
  return flight === 'monument' ? <MonumentWalkPreview lane={lane} /> : <FlightWalkPreview key={flight} flightId={flight} />
}

function MonumentWalkPreview({ lane }: { lane: number }) {
  const root = useRef<Group>(null)
  const rig = useMemoRig()
  const state = useMemo(() => ({
    actor: createStairWalk(lane), keys: new Set<string>(), manual: false,
    direction: -1, remaining: 0, phase: 0, gait: createGait(),
    eye: new Vector3(), target: new Vector3(), foot: new Vector3(), initialized: false,
  }), [lane])

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      if (!keys.has(key) || (event.target instanceof HTMLElement && event.target.closest('select,input,textarea,button'))) return
      event.preventDefault()
      state.manual = true
      state.keys.add(key)
    }
    const keyup = (event: KeyboardEvent) => state.keys.delete(event.key.toLowerCase())
    const blur = () => state.keys.clear()
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', blur)
    }
  }, [state])

  useFrame(({ camera }, delta) => {
    if (!root.current) return
    const { actor, gait } = state
    const dt = Math.min(delta, .08)
    const held = (a: string, b: string) => Number(state.keys.has(a) || state.keys.has(b))
    const x = held('d', 'arrowright') - held('a', 'arrowleft')
    const z = state.manual ? held('s', 'arrowdown') - held('w', 'arrowup') : state.direction
    const speed = .55 / Math.max(1, Math.hypot(x, z))
    let distance = 0
    state.remaining += dt
    while (state.remaining >= STAIR_WALK_TICK) {
      state.remaining -= STAIR_WALK_TICK
      const movement = stepStairWalk(actor, { dx: x * speed, dz: z * speed, run: false, jump: false })
      distance += Math.hypot(movement.x, movement.z)
    }
    if (!state.manual && state.direction < 0 && actor.z < stairs.zTop - 1) state.direction = 1
    if (!state.manual && state.direction > 0 && actor.z > stairs.zBottom + 1) state.direction = 0
    state.phase += distance * 4
    poseWalk(rig, gait, state.phase, distance, dt)
    root.current.position.set(actor.x, actor.foot, actor.z)
    root.current.rotation.y = actor.yaw
    root.current.updateMatrixWorld(true)
    const lift = rig.groundShift()
    let support = actor.foot
    for (const foot of [rig.bones.foot_L, rig.bones.foot_R]) {
      foot.getWorldPosition(state.foot)
      for (const offset of [0, .09]) {
        const x = state.foot.x + Math.sin(actor.yaw) * offset
        const z = state.foot.z + Math.cos(actor.yaw) * offset
        support = Math.max(support, walkHeightAt(x, z, actor.foot))
      }
    }
    rig.root.position.y = lift + (support - actor.foot) + .004

    const alpha = state.initialized ? 1 - Math.exp(-dt * 7) : 1
    state.eye.set(actor.x + 3.2, actor.foot + 2.8, actor.z + 4.1)
    camera.position.lerp(state.eye, alpha)
    state.eye.set(actor.x, actor.foot + .85, actor.z - .25)
    state.target.lerp(state.eye, alpha)
    camera.lookAt(state.target)
    state.initialized = true
  })
  return <group ref={root} name="monument-stair-walk-avatar"><primitive object={rig.root} dispose={null}/></group>
}

function FlightWalkPreview({ flightId }: { flightId: FlightId }) {
  const root = useRef<Group>(null)
  const rig = useMemoRig()
  const state = useMemo(() => ({
    flight: undefined as ReturnType<typeof buildStairFlight>,
    actor: undefined as ReturnType<typeof createFlightWalker> | undefined,
    direction: -1, remaining: 0, phase: 0, gait: createGait(),
    eye: new Vector3(), target: new Vector3(), foot: new Vector3(), initialized: false,
  }), [flightId])

  useFrame(({ camera, scene }, delta) => {
    if (!root.current) return
    const flight = state.flight ??= buildStairFlight(flightId, scene)
    if (!flight) return
    const actor = state.actor ??= createFlightWalker(flight)
    const dt = Math.min(delta, .08)
    let distance = 0
    state.remaining += dt
    while (state.remaining >= STAIR_WALK_TICK) {
      state.remaining -= STAIR_WALK_TICK
      if (!state.direction) continue
      distance += stepFlightWalker(actor, flight, state.direction)
      if (state.direction < 0 && actor.distance === flight.near) {
        state.direction = 1
        actor.motion.stopHorizontal()
      } else if (state.direction > 0 && actor.distance === flight.far) {
        state.direction = 0
      }
    }

    const [x, z] = flight.at(actor.distance), foot = flight.floor(actor.distance)
    const yaw = flight.heading(actor.distance), sin = Math.sin(yaw), cos = Math.cos(yaw)
    state.phase += distance * 4
    poseWalk(rig, state.gait, state.phase, distance, dt)
    root.current.visible = true
    root.current.position.set(x, foot, z)
    root.current.rotation.y = yaw + (state.direction < 0 ? Math.PI : 0)
    root.current.updateMatrixWorld(true)
    const lift = rig.groundShift()
    let support = foot
    for (const bone of [rig.bones.foot_L, rig.bones.foot_R]) {
      bone.getWorldPosition(state.foot)
      const projection = (state.foot.x - x) * sin + (state.foot.z - z) * cos
      support = Math.max(support, flight.floor(actor.distance + projection),
        flight.floor(actor.distance + projection + (state.direction < 0 ? -.08 : .08)))
    }
    rig.root.position.y = lift + support - foot + .004

    const alpha = state.initialized ? 1 - Math.exp(-dt * 7) : 1
    state.eye.set(x + cos * 2.7 + sin * 3.2, foot + 2.35, z - sin * 2.7 + cos * 3.2)
    camera.position.lerp(state.eye, alpha)
    state.eye.set(x, foot + .8, z)
    state.target.lerp(state.eye, alpha)
    camera.lookAt(state.target)
    state.initialized = true
    root.current.userData = { flightId, direction: state.direction, distance: actor.distance, blocked: actor.blocked }
  })
  return <group ref={root} name="park-stair-flight-avatar" visible={false}><primitive object={rig.root} dispose={null}/></group>
}

function poseWalk(rig: ReturnType<typeof createCharacterRig>, gait: ReturnType<typeof createGait>, phase: number, distance: number, dt: number) {
  sampleGait(phase, dt ? Math.min(1, distance / dt / 2) : 0, 0, gait)
  rig.root.position.y = 0
  rig.reset()
  rig.set('upperLeg_L', gait.thighL, 0, 0)
  rig.set('upperLeg_R', gait.thighR, 0, 0)
  rig.set('lowerLeg_L', gait.kneeL, 0, 0)
  rig.set('lowerLeg_R', gait.kneeR, 0, 0)
  rig.set('foot_L', gait.ankleL, 0, 0)
  rig.set('foot_R', gait.ankleR, 0, 0)
  rig.set('upperArm_L', gait.armL, 0, 0)
  rig.set('upperArm_R', gait.armR, 0, 0)
  rig.apply(dt)
}

function useMemoRig() {
  const source = useLoader(ParkAssetLoader, characterUrls[0])
  const rig = useMemo(() => createCharacterRig(source), [source])
  useEffect(() => () => rig.dispose(), [rig])
  return rig
}
