import { create } from 'zustand'

/** Personal look speed. Each view keeps its own base rate and multiplies it by this value. */
export const LOOK_SENSITIVITY = { min: 0.2, max: 2, step: 0.1, initial: 1 } as const
const storageKey = 'ontap-look-sensitivity-v1'

export function clampLookSensitivity(value: number) {
  if (!Number.isFinite(value)) return LOOK_SENSITIVITY.initial
  const stepped = Math.round(value / LOOK_SENSITIVITY.step) / 10
  return Math.min(LOOK_SENSITIVITY.max, Math.max(LOOK_SENSITIVITY.min, stepped))
}

function savedSensitivity() {
  try {
    const value = localStorage.getItem(storageKey)
    return value === null ? LOOK_SENSITIVITY.initial : clampLookSensitivity(Number(value))
  } catch {
    return LOOK_SENSITIVITY.initial
  }
}

export const useLookSensitivity = create<{ sensitivity: number }>(() => ({ sensitivity: savedSensitivity() }))
export const lookSensitivity = () => useLookSensitivity.getState().sensitivity

export function setLookSensitivity(value: number) {
  const sensitivity = clampLookSensitivity(value)
  useLookSensitivity.setState({ sensitivity })
  try {
    localStorage.setItem(storageKey, String(sensitivity))
  } catch {
    // Storage can be blocked; the value still applies for this session.
  }
}
