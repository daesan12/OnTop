import {
  CatmullRomCurve3, CylinderGeometry, Group, Mesh, MeshStandardMaterial, TubeGeometry, Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// In vehicle coordinates +Z is forward, and the handlebar runs along X.
// The same immutable meshes can be instanced for either hand and either vehicle.
function makeGripPose() {
  const glove = new MeshStandardMaterial({ color: '#c39362', roughness: .88 })
  const sleeve = new MeshStandardMaterial({ color: '#344e70', roughness: .96 })
  const cuff = new MeshStandardMaterial({ color: '#ded3bb', roughness: 1 })
  const hand = new Group()
  const palm = new Mesh(new RoundedBoxGeometry(.098, .043, .085, 2, .014), glove)
  palm.position.set(0, .046, -.021)
  hand.add(palm)

  const curledFinger = new TubeGeometry(new CatmullRomCurve3([
    new Vector3(0, .054, -.008),
    new Vector3(0, .049, .034),
    new Vector3(0, .014, .046),
    new Vector3(0, -.025, .035),
  ]), 8, .012, 7, false)
  for (const x of [-.035, -.012, .012, .035]) {
    const finger = new Mesh(curledFinger, glove)
    finger.position.x = x
    hand.add(finger)
  }
  const thumb = new Mesh(new TubeGeometry(new CatmullRomCurve3([
    new Vector3(-.028, .044, -.05),
    new Vector3(-.054, .014, -.035),
    new Vector3(-.047, -.016, -.022),
    new Vector3(-.034, -.029, .004),
  ]), 8, .014, 7, false), glove)
  hand.add(thumb)

  function armSection(from: Vector3, to: Vector3, startRadius: number, endRadius: number, material: MeshStandardMaterial) {
    const direction = to.clone().sub(from)
    const section = new Mesh(new CylinderGeometry(endRadius, startRadius, direction.length(), 10), material)
    section.position.copy(from).lerp(to, .5)
    section.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize())
    hand.add(section)
  }
  const wrist = new Vector3(.007, .046, -.051)
  const seam = new Vector3(.024, .047, -.121)
  armSection(wrist, seam, .035, .046, cuff)
  const sleeveCurve = new CatmullRomCurve3([
    seam, new Vector3(.057, .044, -.27), new Vector3(.108, .02, -.46), new Vector3(.16, -.25, -.64),
  ])
  hand.add(new Mesh(new TubeGeometry(sleeveCurve, 14, .054, 10, false), sleeve))
  return hand
}

let gripPose: Group | undefined

export function createRideHands() {
  gripPose ??= makeGripPose()
  const root = new Group()
  root.name = 'park-xr-ride-hands'
  const left = gripPose.clone()
  left.name = 'park-xr-ride-left-hand'
  const right = gripPose.clone()
  right.name = 'park-xr-ride-right-hand'
  right.scale.x = -1
  root.add(left, right)
  return {
    root,
    place(leftGrip: Vector3, rightGrip: Vector3) {
      left.position.copy(leftGrip)
      right.position.copy(rightGrip)
    },
  }
}
