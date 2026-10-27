import { TELESCOPE, TELESCOPES } from '../park/mapConfig'
import { lookScale } from '../world/lookSensitivity'

// Immediate local aiming; server replication animates only the other users' props.
// CameraRig reads this object without rerendering React on mouse movement.
export const telescopeView = {
  id: '',
  yaw: 0,
  pitch: 0,
  zoom: TELESCOPE.defaultZoom as number,
}
export function resetTelescopeView(id: string) {
  const t = TELESCOPES.find((candidate) => candidate.id === id)
  telescopeView.id = t?.id ?? ''
  telescopeView.yaw = t?.yaw ?? 0
  telescopeView.pitch = TELESCOPE.initialPitch
  telescopeView.zoom = TELESCOPE.defaultZoom
}
/** Radians per pixel; a stronger zoom turns slower so the target stays easy to follow. */
export const telescopeTurnRate = () => 0.003 / Math.sqrt(telescopeView.zoom) * lookScale()
export function zoomTelescope(delta: number) {
  telescopeView.zoom = Math.min(
    TELESCOPE.maxZoom,
    Math.max(TELESCOPE.minZoom, telescopeView.zoom + delta),
  )
}
