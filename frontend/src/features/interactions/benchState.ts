import { create } from 'zustand'
import type { BenchLease } from './benchContracts'

interface BenchState {
  placements: Record<string, BenchLease>
  pending: boolean
  error: string
  epoch: number
}
export const useBenchState = create<BenchState>(() => ({ placements: {}, pending: false, error: '', epoch: 0 }))
let lifetime = new AbortController()
export const benchSignal = () => lifetime.signal
export function resetBenchState() {
  lifetime.abort()
  lifetime = new AbortController()
  useBenchState.setState(s => ({ placements: {}, pending: false, error: '', epoch: s.epoch + 1 }))
}
export const benchBusy = (userId: string) => useBenchState.getState().pending
  || !!useBenchState.getState().placements[userId]
