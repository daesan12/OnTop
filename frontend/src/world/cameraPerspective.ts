import { create } from 'zustand'
import { CAMERA } from '../config'

export const viewControls = { yaw: 0, pitch: CAMERA.pitch as number, distance: CAMERA.distance as number }

export type CameraPerspective = 'first-person' | 'third-person'
const storageKey = 'ontap-camera-perspective-v1'
function savedPerspective(): CameraPerspective {
  try {
    return localStorage.getItem(storageKey) === 'first-person'
      ? 'first-person'
      : 'third-person'
  } catch {
    return 'third-person'
  }
}

/** Personal roaming preference; table/telescope cameras temporarily override it. */
export const useCameraPerspective = create<{ perspective: CameraPerspective }>(
  () => ({ perspective: savedPerspective() }),
)

export function toggleCameraPerspective() {
  const perspective =
    useCameraPerspective.getState().perspective === 'third-person'
      ? 'first-person'
      : 'third-person'
  setCameraPerspective(perspective)
}

export function setCameraPerspective(perspective: CameraPerspective) {
  useCameraPerspective.setState({ perspective })
  try {
    localStorage.setItem(storageKey, perspective)
  } catch {
    // Storage can be blocked; switching still works for this session.
  }
}
