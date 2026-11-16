import { Euler, Group, MathUtils, Quaternion, Vector3, type Object3D } from 'three'
import { factory } from '../../../park-renewal-preview/assetFactories'
import { groundSurfaceHeight } from '../../../park-renewal-preview/groundSurface'
import type { createCharacterRig, Side } from '../../world/art/CharacterRig'
import { vehicles, type Vehicle } from './state'

type Rig = ReturnType<typeof createCharacterRig>
const prototypes = new Map<Vehicle, Group>()
const sides = ['L', 'R'] as const

export function prepareMountedVehicle(kind: Vehicle) {
  const cached = prototypes.get(kind)
  if (cached) return cached
  // Fit the moving bike to the short-limbed avatar. Rack display models keep their original scale.
  const source = factory(kind === 'BICYCLE' ? 'ebike' : 'kickboard', {
    ride: true, scale: kind === 'BICYCLE' ? .68 : 1, quality: 'light',
  })
  prototypes.set(kind, source)
  return source
}

function riderPose() {
  const target = new Vector3(), direction = new Vector3(), knee = new Vector3()
  const segment = new Vector3(), rotation = new Euler()
  const thigh = new Quaternion(), inverseThigh = new Quaternion(), shin = new Quaternion()
  const torso = new Quaternion(), inverseTorso = new Quaternion()
  const xAxis = new Vector3(1, 0, 0)
  const shoulderPoint = new Vector3(), elbowPoint = new Vector3(), wristPoint = new Vector3()
  const vehicleRotation = new Quaternion(), parentRotation = new Quaternion(), localRotation = new Quaternion()
  const armDirections = new WeakMap<Rig, { upper: Vector3; lower: Vector3 }[]>()

  function placeJoint(joint: Rig['bones']['hand_L'], vehicle: Group, point: Vector3, orientation: Quaternion) {
    const parent = joint.parent!
    vehicle.localToWorld(target.copy(point))
    joint.position.copy(parent.worldToLocal(target))
    joint.quaternion.copy(parent.getWorldQuaternion(parentRotation).invert())
      .multiply(vehicleRotation).multiply(orientation)
  }

  return {
    foot(model: Rig, side: Side, ankle: Vector3) {
      const bones = model.bones
      const upper = bones[`upperLeg_${side}`].position
      const lower = bones[`lowerLeg_${side}`].position
      const foot = bones[`foot_${side}`].position
      const a = lower.length(), b = foot.length()
      target.copy(ankle).sub(bones.hips.position).sub(upper)
      const distance = MathUtils.clamp(target.length(), Math.abs(a - b) + .001, a + b - .002)
      direction.copy(target).normalize()
      const along = (a * a - b * b + distance * distance) / (2 * distance)
      // Project the forward knee direction onto the bend plane.
      knee.set(0, 0, 1).addScaledVector(direction, -direction.z).normalize()
        .multiplyScalar(Math.sqrt(Math.max(0, a * a - along * along)))
        .addScaledVector(direction, along)
      thigh.setFromUnitVectors(segment.copy(lower).normalize(), target.copy(knee).normalize())
      target.copy(direction).multiplyScalar(distance).sub(knee).normalize()
      shin.setFromUnitVectors(segment.copy(foot).normalize(), target.applyQuaternion(inverseThigh.copy(thigh).invert()))
      rotation.setFromQuaternion(thigh)
      model.set(`upperLeg_${side}`, rotation.x, rotation.y, rotation.z)
      rotation.setFromQuaternion(shin)
      model.set(`lowerLeg_${side}`, rotation.x, rotation.y, rotation.z)
      rotation.setFromQuaternion(thigh.multiply(shin).invert())
      model.set(`foot_${side}`, rotation.x, rotation.y, rotation.z)
    },
    hands(model: Rig, grips: readonly Vector3[], figure: Vector3, forwardLean: number, firstPerson: boolean) {
      const spine = target.copy(model.bones.hips.position).add(model.bones.spine.position)
      torso.setFromAxisAngle(xAxis, forwardLean)
      inverseTorso.copy(torso).invert()
      model.set('spine', forwardLean)
      model.set('head', -forwardLean)
      for (const [index, side] of sides.entries()) {
        const sign = side === 'L' ? 1 : -1
        // Aim at the wrist behind the grip so the palm wraps around the bar.
        direction.copy(grips[index]!).sub(figure)
        direction.x -= sign * .04
        direction.y += .055
        direction.z -= .078
        direction.sub(spine).applyQuaternion(inverseTorso).add(spine)
        model.reachFitnessHand(side, direction.x, direction.y, direction.z,
          -1.12 - forwardLean, 0, sign * .13)
        model.handPose(side, firstPerson ? 'fist' : 'cup')
      }
    },
    alignFirstPersonHands(model: Rig, vehicle: Group, grips: readonly Vector3[]) {
      let rest = armDirections.get(model)
      if (!rest) {
        rest = sides.map(side => ({
          upper: model.bones[`lowerArm_${side}`].position.clone().normalize(),
          lower: model.bones[`hand_${side}`].position.clone().normalize(),
        }))
        armDirections.set(model, rest)
      }
      vehicle.getWorldQuaternion(vehicleRotation)
      for (const [index, side] of sides.entries()) {
        const sign = side === 'L' ? 1 : -1
        const grip = grips[index]!
        // Keep the character's wrist on the actual grip while the first-person sleeves
        // lead back below the view. The third-person shoulder placement is seat-relative.
        wristPoint.set(grip.x - sign * .025, grip.y + .037, grip.z - .054)
        elbowPoint.set(grip.x + sign * .074, grip.y - .043, grip.z - .34)
        shoulderPoint.set(grip.x + sign * .105, grip.y - .31, grip.z - .55)
        localRotation.setFromUnitVectors(rest[index]!.upper, direction.subVectors(elbowPoint, shoulderPoint).normalize())
        placeJoint(model.bones[`upperArm_${side}`], vehicle, shoulderPoint, localRotation)
        localRotation.setFromUnitVectors(rest[index]!.lower, direction.subVectors(wristPoint, elbowPoint).normalize())
        placeJoint(model.bones[`lowerArm_${side}`], vehicle, elbowPoint, localRotation)
        localRotation.setFromEuler(rotation.set(-Math.PI / 2, 0, sign * .14))
        placeJoint(model.bones[`hand_${side}`], vehicle, wristPoint, localRotation)
      }
    },
  }
}

export function createMountedVehicle() {
  const root = new Group()
  root.name = 'park-mounted-vehicle'
  const models = new Map<Vehicle, Group>()
  const rigPose = riderPose()
  const origin = new Vector3()
  const figureOffset = new Vector3()
  const contact = new Vector3()
  const axleMidpoint = new Vector3()
  const grips = [new Vector3(), new Vector3()]
  let current: Vehicle | undefined
  let wheels: Object3D[] = []
  let pedals: Object3D[] = []
  let crank: Object3D | undefined
  let phase = 0, lastYaw = 0, lean = 0, lastX = 0, lastZ = 0, wheelPhase = 0
  let vehicleScale = 1
  let frontAxleZ = 0, rearAxleZ = 0, wheelRadius = 0, tireHalfWidth = 0

  return {
    root,
    apply(kind: Vehicle | undefined, pose: { x: number; z: number; yaw: number },
      floorY: number, delta: number, figure: Group, model: Rig, firstPerson = false) {
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
            vehicle = prepareMountedVehicle(kind).clone()
            models.set(kind, vehicle)
          }
          root.add(vehicle)
          const bicycle = kind === 'BICYCLE'
          const name = bicycle ? 'bicycle' : 'scooter'
          const anchor = (part: string) => vehicle.getObjectByName(name + '-' + part)!
          vehicleScale = vehicle.scale.x
          const frontWheel = anchor('front-wheel'), rearWheel = anchor('rear-wheel')
          wheels = [frontWheel, rearWheel]
          frontAxleZ = frontWheel.position.z * vehicleScale
          rearAxleZ = rearWheel.position.z * vehicleScale
          wheelRadius = frontWheel.position.y * vehicleScale
          tireHalfWidth = (bicycle ? .115 : .1) * vehicleScale / 2
          origin.copy(anchor(bicycle ? 'seat' : 'deck').position).multiplyScalar(vehicleScale)
          grips[0]!.copy(anchor('right-grip').position).multiplyScalar(vehicleScale)
          grips[1]!.copy(anchor('left-grip').position).multiplyScalar(vehicleScale)
          crank = vehicle.getObjectByName('bicycle-crank')
          pedals = bicycle ? [anchor('pedal-positive'), anchor('pedal-negative')] : []
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
      wheelPhase = (wheelPhase + distance / wheelRadius) % (2 * Math.PI)
      lean = MathUtils.damp(lean, bicycle || distance < .002 ? 0 : MathUtils.clamp(turn * 2.2, -.18, .18), 12, dt)
      const forwardX = Math.sin(pose.yaw), forwardZ = Math.cos(pose.yaw)
      const frontY = groundSurfaceHeight(pose.x + forwardX * frontAxleZ, pose.z + forwardZ * frontAxleZ)
      const rearY = groundSurfaceHeight(pose.x + forwardX * rearAxleZ, pose.z + forwardZ * rearAxleZ)
      // Only use terrain close to the avatar's floor; bridges, tunnels and ledges can have different support.
      const followGround = Math.max(Math.abs(frontY - floorY), Math.abs(rearY - floorY)) <= .35
      const slope = followGround ? (frontY - rearY) / (frontAxleZ - rearAxleZ) : 0
      const pitch = -Math.atan(slope)
      root.rotation.set(pitch, 0, lean)
      const midZ = (frontAxleZ + rearAxleZ) / 2
      axleMidpoint.set(0, wheelRadius, midZ).applyQuaternion(root.quaternion)
      // The rounded tread reaches the road even when the scooter banks into a turn.
      const bankCos = Math.cos(lean)
      const treadDepth = wheelRadius * .85 * bankCos
        + Math.hypot(wheelRadius * .15 * bankCos, tireHalfWidth * Math.sin(lean))
      root.position.y = (followGround ? (frontY + rearY) / 2 - floorY : 0)
        + slope * (axleMidpoint.z - midZ) + treadDepth / Math.cos(pitch) - axleMidpoint.y
      for (const wheel of wheels) wheel.rotation.x = wheelPhase

      model.reset()
      figureOffset.copy(origin)
      figureOffset.y += bicycle ? model.seatedHipLift - model.hipHeight : -.025
      figureOffset.z += bicycle ? .065 : .015
      figure.quaternion.copy(root.quaternion)
      figure.position.copy(figureOffset).applyQuaternion(figure.quaternion).add(root.position)
      rigPose.hands(model, grips, figureOffset, bicycle ? .65 : .16, firstPerson)
      if (crank) crank.rotation.x = phase
      for (const [index, side] of sides.entries()) {
        const foot = model.bones[`foot_${side}`]
        const ankleHeight = model.hipHeight + model.bones[`upperLeg_${side}`].position.y
          + model.bones[`lowerLeg_${side}`].position.y + foot.position.y
        if (crank) {
          const pedal = pedals[index]!
          // Counter-rotate the treads so each shoe rests flat as the crank turns.
          pedal.rotation.x = -phase
          contact.copy(pedal.position).applyQuaternion(crank.quaternion).add(crank.position)
            .multiplyScalar(vehicleScale)
          contact.y += .0175 * vehicleScale
          contact.z -= .045
        } else {
          contact.copy(origin)
          contact.x += side === 'L' ? .065 : -.065
          contact.z += side === 'L' ? .135 : -.16
        }
        contact.y += ankleHeight
        rigPose.foot(model, side, contact.sub(figureOffset))
      }
      model.apply(delta)
      if (firstPerson) rigPose.alignFirstPersonHands(model, root, grips)
      return true
    },
  }
}
