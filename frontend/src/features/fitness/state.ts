import { create } from 'zustand'
import type { FitnessLease } from './contracts'

export const useFitnessState = create(() => ({ placements: {} as Record<string, FitnessLease>,
  pending: false, operation: '' as '' | 'enter' | 'leave', error: '', epoch: 0 }))
const lifetimes = new Map<string, AbortController>()
export function fitnessSignal(userId: string) {
  if (!lifetimes.has(userId)) lifetimes.set(userId, new AbortController())
  return lifetimes.get(userId)!.signal
}
export function releaseFitnessUser(userId: string) {
  lifetimes.get(userId)?.abort()
  lifetimes.delete(userId)
  const placements = { ...useFitnessState.getState().placements }
  delete placements[userId]
  useFitnessState.setState({ placements })
}
export function resetFitnessState() {
  for (const controller of lifetimes.values()) controller.abort()
  lifetimes.clear()
  useFitnessState.setState(s => ({ placements: {}, pending: false, operation: '', error: '', epoch: s.epoch + 1 }))
}
export const fitnessBusy = (userId: string) => useFitnessState.getState().pending || !!useFitnessState.getState().placements[userId]
