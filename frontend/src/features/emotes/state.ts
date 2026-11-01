import { create } from 'zustand'
import type { EmoteBindings, EmoteId } from './catalog'

export const emotePreview = import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
const initial = () => ({
  bindings: {} as EmoteBindings, pending: false, requestId: '', requested: '' as EmoteId | '', cancelled: false,
  readyAt: 0, error: '', notice: '', epoch: 0,
})
export const useEmoteState = create(initial)
let feedbackTimer: ReturnType<typeof setTimeout> | undefined
// Every feedback writer shares this lifetime; request and playback state stay authoritative.
useEmoteState.subscribe((state, previous) => {
  if (state.error === previous.error && state.notice === previous.notice) return
  clearTimeout(feedbackTimer)
  feedbackTimer = undefined
  if (!state.error && !state.notice) return
  feedbackTimer = setTimeout(() => {
    const current = useEmoteState.getState()
    if (current.epoch === state.epoch && current.error === state.error && current.notice === state.notice)
      useEmoteState.setState({ error: '', notice: '' })
  }, 2000)
})
let lifetime = new AbortController()
const retiredRequests = new Set<string>()
export const retiredEmoteRequest = (id: string | null) => !!id && retiredRequests.has(id)
export const emoteSignal = () => lifetime.signal
export function resetEmotes(full = false) {
  lifetime.abort()
  lifetime = new AbortController()
  const state = useEmoteState.getState()
  if (full) retiredRequests.clear()
  else if (state.pending && state.requestId) {
    retiredRequests.add(state.requestId)
    if (retiredRequests.size > 128) retiredRequests.delete(retiredRequests.values().next().value!)
  }
  useEmoteState.setState({ ...initial(), epoch: state.epoch + 1,
    ...(!full ? { bindings: state.bindings, readyAt: state.readyAt } : {}) })
}
