import { TELESCOPE, TELESCOPES } from '../config'

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
export function zoomTelescope(delta: number) {
  telescopeView.zoom = Math.min(
    TELESCOPE.maxZoom,
    Math.max(TELESCOPE.minZoom, telescopeView.zoom + delta),
  )
}
