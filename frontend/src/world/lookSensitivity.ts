import { create } from 'zustand'

/** Personal look speed in percent. 100% is each view's own default rate. */
export const LOOK_SENSITIVITY = { min: 1, max: 200, step: 1, initial: 100 } as const
// v1 stored a raw multiplier; percentages use a new key so an old 0.8 is never read as 0.8%.
const storageKey = 'ontap-look-sensitivity-v2'

export function clampLookSensitivity(percent: number) {
  if (!Number.isFinite(percent)) return LOOK_SENSITIVITY.initial
  return Math.min(LOOK_SENSITIVITY.max, Math.max(LOOK_SENSITIVITY.min, Math.round(percent)))
}

export const lookSensitivityLabel = (percent: number) => `${percent}%`

function savedSensitivity() {
  try {
    const value = localStorage.getItem(storageKey)
    return value === null ? LOOK_SENSITIVITY.initial : clampLookSensitivity(Number(value))
  } catch {
    return LOOK_SENSITIVITY.initial
  }
}

export const useLookSensitivity = create<{ sensitivity: number }>(() => ({ sensitivity: savedSensitivity() }))

/** Multiplier for a view's default rate. */
export const lookScale = () => useLookSensitivity.getState().sensitivity / 100

export function setLookSensitivity(percent: number) {
  const sensitivity = clampLookSensitivity(percent)
  useLookSensitivity.setState({ sensitivity })
  try {
    localStorage.setItem(storageKey, String(sensitivity))
  } catch {
    // Storage can be blocked; the value still applies for this session.
  }
}
