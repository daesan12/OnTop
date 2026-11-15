import { useEffect, useMemo, useRef } from 'react'
import { armUnlock } from '../../audio/bgm'
import { audibleStoneCues, STONE_HIT_EFFECT_MS, StoneFeedbackTracker, type StoneFeedbackFrame } from './feedback'
import { StonePigeonAudio } from './stonePigeonAudio'
import { StoneActionTracker } from './actionFeedback'
import type { StoneState } from './protocol'

export function useStoneFeedback(state: StoneState, enabled: boolean, viewId: string, ownId: string) {
  const tracker = useMemo(() => new StoneFeedbackTracker(), []), audio = useMemo(() => new StonePigeonAudio(), [])
  const actions = useMemo(() => new StoneActionTracker(), [])
  const frame = useRef<StoneFeedbackFrame>({ enabled: false, hits: new Map() })
  useEffect(() => {
    armUnlock()
    const prepare = () => audio.prepare()
    const hide = () => { if (document.hidden) { tracker.reset(); actions.reset(); frame.current.enabled = false; frame.current.hits.clear(); audio.stop() } }
    prepare()
    window.addEventListener('pointerdown', prepare); window.addEventListener('keydown', prepare)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('pointerdown', prepare); window.removeEventListener('keydown', prepare)
      document.removeEventListener('visibilitychange', hide)
      frame.current.enabled = false; frame.current.hits.clear(); tracker.reset(); actions.reset(); audio.stop()
    }
  }, [audio, tracker, actions, state.gameId])
  useEffect(() => {
    const active = enabled && !document.hidden
    const view = state.players.find(player => player.userId === viewId)
    const cues = [...tracker.read(state, active), ...actions.read(state, active, view)]
      .filter(cue => cue.kind !== 'eliminated' || cue.userId === ownId)
    frame.current.enabled = active && state.phase === 'RUNNING'
    if (!frame.current.enabled) frame.current.hits.clear()
    if (!active) { audio.stop(); return }
    const now = performance.now()
    for (const [id, hit] of frame.current.hits) if (now - hit.startedAt >= STONE_HIT_EFFECT_MS) frame.current.hits.delete(id)
    for (const cue of cues) if (cue.kind === 'hit') frame.current.hits.set(cue.userId, { hitAt: cue.at, startedAt: now })
    if (view) for (const cue of audibleStoneCues(cues, view)) void audio.play(cue, view).catch(() => {})
  }, [state, enabled, viewId, ownId, tracker, actions, audio])
  return frame
}
