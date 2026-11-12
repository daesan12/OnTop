import { Frustum, Matrix4, type Camera } from 'three'
import { OverlayView } from '../../world/overlayProjection'

type NpcFrameView = { at: number; overlay: OverlayView; frustum: Frustum; clip: Matrix4 }
const cameras = new WeakMap<Camera, NpcFrameView>()

/** CameraRig has already updated the camera when NPCs sample this frame. */
export function npcFrameView(camera: Camera, width: number, height: number, at: number) {
  let view = cameras.get(camera)
  if (!view) {
    view = { at: -1, overlay: new OverlayView(), frustum: new Frustum(), clip: new Matrix4() }
    cameras.set(camera, view)
  }
  if (view.at !== at || view.overlay.width !== width || view.overlay.height !== height) {
    view.at = at
    camera.updateMatrixWorld()
    view.overlay.update(camera, width, height)
    if (view.overlay.changed) {
      view.frustum.setFromProjectionMatrix(view.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    }
  }
  return view
}
