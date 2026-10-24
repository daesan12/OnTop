import { create } from 'zustand'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import type { Destination, NavPoint } from './parkNavigation'

type NavigationStatus = 'idle' | 'planning' | 'guiding' | 'unreachable' | 'unavailable' | 'paused' | 'arrived'
const initial = () => ({ owner: '', channel: '', target: null as Destination | null, path: [] as NavPoint[], status: 'idle' as NavigationStatus })
/** Personal display state only. No persistence, WS action or movement command. */
export const useNavigation = create(initial)
export function selectDestination(target: Destination, owner: string, channel: string) {
  if (!owner || !channel || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return
  useNavigation.setState({ owner, channel, target: { ...target }, path: [], status: 'planning' })
}
export function cancelNavigation() { useNavigation.setState(initial(), true) }

export const useParkMap = create(() => ({ open: false }))
export function openParkMap() {
  if (useParkMap.getState().open) return
  inputState.mapOpen = true
  clearRoamingInput()
  useParkMap.setState({ open: true })
}
export function closeParkMap() {
  if (!useParkMap.getState().open) return
  useParkMap.setState({ open: false })
  inputState.mapOpen = false
  clearRoamingInput()
}
