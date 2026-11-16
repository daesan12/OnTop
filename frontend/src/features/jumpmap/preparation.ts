import { Frustum, Matrix4, Object3D, Sprite, type Camera } from 'three'
import { COURSE, renewalCourse, START } from './activeCourse'

// Prepare normal prop LODs at the course entrance and above the park, before
// the player reaches them. These cameras never control the player's view.
const high = COURSE.find(p => p.top >= 35)!
export const jumpmapPreparationViews = [
  { x: START.x, y: START.y, z: START.z },
  { x: high.x, y: high.top, z: high.z },
].map(p => ({
  position: [p.x, p.y + 3, p.z + 5] as const,
  target: [p.x, p.y + 1, p.z] as const,
}))

// The renewal park's landing shaders are already prepared with the course.
// From the higher pads, the camera can also expose previously unseen park props.
export function collectJumpViewDrawables(surface: Object3D, camera: Camera, lakeView = false) {
  if (!renewalCourse) return []
  surface.updateWorldMatrix(true, true)
  const view = camera.clone()
  const projection = new Matrix4()
  const pads = COURSE.filter(pad => lakeView ? pad.theme === 'kite' : pad.stage <= 2)
  const elevatedViews = pads.filter((_, i) => i % 8 === 0 || i === pads.length - 1)
    .flatMap(pad => Array.from({ length: 6 }, (_, i) => {
      const angle = i * Math.PI / 3
      const height = lakeView ? 5.5 : 2.5
      view.position.set(pad.x + Math.sin(angle) * 5, pad.top + height, pad.z + Math.cos(angle) * 5)
      view.lookAt(pad.x, pad.top + .8, pad.z)
      view.updateMatrixWorld(true)
      return new Frustum().setFromProjectionMatrix(projection.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse), view.coordinateSystem, view.reversedDepth)
    }))
  const objects: Object3D[] = []
  surface.traverseVisible(object => {
    if (!('material' in object) || !object.layers.test(camera.layers)) return
    if (object.frustumCulled && !elevatedViews.some(view =>
      object instanceof Sprite ? view.intersectsSprite(object) : view.intersectsObject(object))) return
    objects.push(object)
  })
  return objects
}
