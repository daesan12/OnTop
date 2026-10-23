import { create } from 'zustand'
import type { EmoteBindings, EmoteId } from './catalog'

export const emotePreview = import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
const initial = () => ({
  bindings: {} as EmoteBindings, pending: false, requestId: '', requested: '' as EmoteId | '', cancelled: false,
  readyAt: 0, error: '', notice: '', epoch: 0,
})
export const useEmoteState = create(initial)
let lifetime = new AbortController()
export const emoteSignal = () => lifetime.signal
export function resetEmotes(full = false) {
  lifetime.abort()
  lifetime = new AbortController()
  const state = useEmoteState.getState()
  useEmoteState.setState({ ...initial(), epoch: state.epoch + 1,
    ...(!full ? { bindings: state.bindings, readyAt: state.readyAt } : {}) })
}
