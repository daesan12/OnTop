import { setCameraPerspective, useCameraPerspective, viewControls, type CameraPerspective } from './cameraPerspective'
import { mouseLookReturn, useMouseLook } from './mouseLook'

export interface RoamingView {
  perspective: CameraPerspective
  controls: { yaw: number; pitch: number; distance: number }
  mouseLook: boolean
}

/** A single outer visit survives nested facility/help/seat changes without resaving the temporary view. */
export class CameraReturn {
  private saved: { scope: string; view: RoamingView } | null = null
  remember(scope: string, view: RoamingView) {
    if (!scope || this.saved?.scope === scope) return
    this.saved = { scope, view: { ...view, controls: { ...view.controls } } }
  }
  finish(scope: string, busy: boolean): RoamingView | null {
    if (this.saved && this.saved.scope !== scope) this.reset()
    if (!this.saved || busy) return null
    const view = this.saved.view
    this.saved = null
    return view
  }
  cancelMouseLook() { if (this.saved) this.saved.view.mouseLook = false }
  reset() { this.saved = null }
}

const returns = new CameraReturn()
export const cameraScope = (userId: string, channelId: string) => userId && channelId ? JSON.stringify([userId, channelId]) : ''
export function rememberRoamingView(userId: string, channelId: string, mouseLook = useMouseLook.getState().active) {
  returns.remember(cameraScope(userId, channelId), {
    perspective: useCameraPerspective.getState().perspective, controls: viewControls, mouseLook,
  })
}
export function restoreRoamingView(userId: string, channelId: string, busy: boolean) {
  const saved = returns.finish(cameraScope(userId, channelId), busy)
  if (!saved) return
  Object.assign(viewControls, saved.controls)
  if (useCameraPerspective.getState().perspective !== saved.perspective) setCameraPerspective(saved.perspective)
  mouseLookReturn.requested = saved.mouseLook
}
export function cancelMouseLookReturn() { returns.cancelMouseLook(); mouseLookReturn.requested = false }
export function resetCameraReturn() { returns.reset(); mouseLookReturn.requested = false }
