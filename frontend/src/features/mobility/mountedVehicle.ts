import { Group, MathUtils, type Object3D } from 'three'
import { factory } from '../../../park-renewal-preview/assetFactories'
import type { createCharacterRig } from '../../world/art/CharacterRig'
import { vehicles, type Vehicle } from './state'

type Rig = ReturnType<typeof createCharacterRig>
const prototypes = new Map<Vehicle, Group>()

function cloneVehicle(kind: Vehicle) {
  let source = prototypes.get(kind)
  if (!source) {
    source = factory(kind === 'BICYCLE' ? 'ebike' : 'kickboard', { ride: true, quality: 'light' })
    prototypes.set(kind, source)
  }
  return source.clone()
}

export function createMountedVehicle() {
  const root = new Group()
  const models = new Map<Vehicle, Group>()
  let current: Vehicle | undefined
  let wheels: Object3D[] = []
  let crank: Object3D | undefined
  let phase = 0, lastYaw = 0, lean = 0, lastX = 0, lastZ = 0, wheelPhase = 0

  return {
    root,
    apply(kind: Vehicle | undefined, pose: { x: number; z: number; yaw: number },
      delta: number, figure: Group, model: Rig) {
      if (current !== kind) {
        current = kind
        root.clear()
        phase = wheelPhase = lean = 0
        lastYaw = pose.yaw
        lastX = pose.x
        lastZ = pose.z
        if (kind) {
          let vehicle = models.get(kind)
          if (!vehicle) {
            vehicle = cloneVehicle(kind)
            models.set(kind, vehicle)
          }
          root.add(vehicle)
          const name = kind === 'BICYCLE' ? 'bicycle' : 'scooter'
          wheels = ['front-wheel', 'rear-wheel'].flatMap(part => {
            const wheel = vehicle.getObjectByName(name + '-' + part)
            return wheel ? [wheel] : []
          })
          crank = vehicle.getObjectByName('bicycle-crank')
        }
      }
      if (!kind) return false
      const bicycle = kind === 'BICYCLE'
      const dt = Math.min(delta, .08)
      const distance = Math.min(vehicles[kind].speed * dt, Math.hypot(pose.x - lastX, pose.z - lastZ))
      const turn = Math.atan2(Math.sin(pose.yaw - lastYaw), Math.cos(pose.yaw - lastYaw))
      lastX = pose.x
      lastZ = pose.z
      lastYaw = pose.yaw
      phase = (phase + distance * 1.8) % (2 * Math.PI)
      wheelPhase = (wheelPhase + distance / (bicycle ? .35 : .155)) % (2 * Math.PI)
      lean = MathUtils.damp(lean, bicycle || distance < .002 ? 0 : MathUtils.clamp(turn * 2.2, -.18, .18), 12, dt)
      root.rotation.z = lean
      for (const wheel of wheels) wheel.rotation.x = wheelPhase
      if (crank) crank.rotation.x = phase
      model.reset()
      figure.rotation.set(0, 0, lean)
      figure.position.set(0, bicycle ? 1.07 - model.hipHeight : .259, bicycle ? -.43 : -.12)
      for (const [side, offset] of [['L', 0], ['R', Math.PI]] as const) {
        const stride = bicycle ? Math.sin(phase + offset) * .26 : 0
        model.set(`upperLeg_${side}`, bicycle ? -.95 + stride : side === 'L' ? -.22 : .12)
        model.set(`lowerLeg_${side}`, bicycle ? 1.26 - stride * .8 : .2)
        model.set(`foot_${side}`, bicycle ? -.28 : -.14)
        model.reachFitnessHand(side, (side === 'L' ? -1 : 1) * (bicycle ? .29 : .22),
          bicycle ? 1.21 - figure.position.y : 1.235 - figure.position.y,
          bicycle ? .4 - figure.position.z : .315 - figure.position.z, 0, 0, 0)
        model.handPose(side, 'cup')
      }
      model.apply(delta)
      return true
    },
  }
}
