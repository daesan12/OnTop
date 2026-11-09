import { Box3, Matrix3, SkinnedMesh, Vector3, type Object3D } from 'three'
import { OBB } from 'three/addons/math/OBB.js'
import { drawnVertices } from './art/characterLook'

/** Fit the displayed head/hair and torso in bone space; fingers and supporting arms may touch. */
export function createCarryClearance(root: Object3D, padding = .025) {
  const boxes = new Map<Object3D, Box3>(), point = new Vector3()
  root.updateWorldMatrix(true, false)
  root.updateMatrixWorld(true)
  root.traverse(object => {
    if (!(object instanceof SkinnedMesh) || !object.name.startsWith('near-')) return
    const weights = object.geometry.getAttribute('skinWeight'), indices = object.geometry.getAttribute('skinIndex')
    for (const index of drawnVertices(object.geometry)) {
      let influence = 0
      for (let slot = 1; slot < 4; slot++) if (weights.getComponent(index, slot) > weights.getComponent(index, influence)) influence = slot
      const bone = object.skeleton.bones[indices.getComponent(index, influence)]!
      if (!['head', 'neck', 'chest', 'spine', 'hips'].includes(bone.name)) continue
      object.getVertexPosition(index, point); object.localToWorld(point); bone.worldToLocal(point)
      let box = boxes.get(bone)
      if (!box) { box = new Box3(); boxes.set(bone, box) }
      box.expandByPoint(point)
    }
  })
  const parts = [...boxes].map(([bone, box]) => {
    box.expandByScalar(padding)
    return { bone, local: new OBB(box.getCenter(new Vector3()), box.getSize(new Vector3()).multiplyScalar(.5), new Matrix3()), world: new OBB() }
  })
  return {
    parts,
    update() { for (const part of parts) part.world.copy(part.local).applyMatrix4(part.bone.matrixWorld) },
  }
}
type Clearance = ReturnType<typeof createCarryClearance>
export function carryBodiesOverlap(a: Clearance, b: Clearance) {
  return a.parts.some(left => b.parts.some(right => left.world.intersectsOBB(right.world)))
}

/** Only move the rendered target along a safe axis; never move authoritative physics. */
export function separateCarryBodies(a: Clearance, b: Clearance, target: Object3D, direction: Vector3, scratch: Vector3) {
  a.update(); b.update()
  if (!carryBodiesOverlap(a, b)) return 0
  scratch.copy(target.position)
  const overlapAt = (distance: number) => {
    target.position.copy(scratch).addScaledVector(direction, distance)
    target.updateMatrixWorld(true); b.update()
    return carryBodiesOverlap(a, b)
  }
  let low = 0, high = .04
  while (high < 4 && overlapAt(high)) high *= 2
  for (let n = 0; n < 12; n++) {
    const middle = (low + high) / 2
    if (overlapAt(middle)) low = middle; else high = middle
  }
  overlapAt(high + .015)
  return high + .015
}
