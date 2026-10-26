import { create } from 'zustand'

/** Personal look speed. Each view keeps its own base rate and multiplies it by this value. */
export const LOOK_SENSITIVITY = { min: 0.05, max: 2, step: 0.05, initial: 0.8 } as const
const storageKey = 'ontap-look-sensitivity-v1'

export function clampLookSensitivity(value: number) {
  if (!Number.isFinite(value)) return LOOK_SENSITIVITY.initial
  const stepped = Math.round(value / LOOK_SENSITIVITY.step) / 20
  return Math.min(LOOK_SENSITIVITY.max, Math.max(LOOK_SENSITIVITY.min, stepped))
}

/** Shown to players as a percentage; 100% is the original fixed speed. */
export const lookSensitivityLabel = (value: number) => `${Math.round(value * 100)}%`

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
