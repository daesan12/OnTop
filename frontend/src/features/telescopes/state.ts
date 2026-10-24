import { create } from 'zustand'
import { resetTelescopeView } from '../telescopeView'
import type { TelescopeLease } from './contracts'

export const useTelescopeState = create(() => ({ placements: {} as Record<string, TelescopeLease>,
  pending: false, operation: '' as '' | 'enter' | 'leave', error: '', epoch: 0 }))
const lifetimes = new Map<string, AbortController>()
export function telescopeSignal(userId: string) {
  if (!lifetimes.has(userId)) lifetimes.set(userId, new AbortController())
  return lifetimes.get(userId)!.signal
}
export function releaseTelescopeUser(userId: string) {
  lifetimes.get(userId)?.abort()
  lifetimes.delete(userId)
  const placements = { ...useTelescopeState.getState().placements }
  delete placements[userId]
  useTelescopeState.setState({ placements })
}
export function resetTelescopeState() {
  for (const controller of lifetimes.values()) controller.abort()
  lifetimes.clear()
  resetTelescopeView('')
  useTelescopeState.setState(s => ({ placements: {}, pending: false, operation: '', error: '', epoch: s.epoch + 1 }))
}
export const telescopeBusy = (userId: string) => useTelescopeState.getState().pending || !!useTelescopeState.getState().placements[userId]
