import { Box3, OrthographicCamera, Vector3 } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { createCharacterRig } from '../../world/art/CharacterRig'

/** Fit the actual posed upper body, including both hands, rather than assuming a camera distance. */
export function createTabletPortrait(source: GLTF) {
  const rig = createCharacterRig(source)
  rig.reset()
  rig.root.updateMatrixWorld(true)
  for (const side of ['L', 'R'] as const) {
    const shoulder = rig.bones[`upperArm_${side}`].getWorldPosition(new Vector3())
    // Keep sleeves and hands outside and in front of the jacket instead of folding them into the torso.
    rig.reachFitnessHand(side, shoulder.x + (side === 'L' ? .12 : -.12), shoulder.y - .2, shoulder.z + .16, 0, 0, 0)
  }
  for (let i = 0; i < 12; i++) rig.apply(.1)
  rig.root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(rig.root, true)
  const left = rig.bones.hand_L.getWorldPosition(new Vector3())
  const right = rig.bones.hand_R.getWorldPosition(new Vector3())
  bounds.min.y = Math.max(bounds.min.y, Math.min(rig.hipHeight - .06, left.y - .12, right.y - .12))
  return { rig, bounds }
}

export function fitTabletPortrait(camera: OrthographicCamera, bounds: Box3, width: number, height: number) {
  if (width <= 0 || height <= 0 || bounds.isEmpty()) return
  const center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3())
  const aspect = width / height
  camera.left = -aspect; camera.right = aspect; camera.top = 1; camera.bottom = -1
  camera.zoom = .88 * Math.min(2 / size.y, 2 * aspect / size.x)
  camera.position.set(center.x, center.y, bounds.max.z + 4)
  camera.lookAt(center)
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
}
