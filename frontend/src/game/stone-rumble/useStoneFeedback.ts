import { useEffect, useMemo, useRef } from 'react'
import { armUnlock } from '../../audio/bgm'
import { audibleStoneCues, STONE_HIT_EFFECT_MS, StoneFeedbackTracker, type StoneFeedbackFrame } from './feedback'
import { StonePigeonAudio } from './stonePigeonAudio'
import { StoneActionTracker } from './actionFeedback'
import type { StoneState } from './protocol'
import { StoneFeedbackTimeline } from './feedbackTimeline'

export function useStoneFeedback(state: StoneState, enabled: boolean, viewId: string, ownId: string) {
  const tracker = useMemo(() => new StoneFeedbackTracker(), []), audio = useMemo(() => new StonePigeonAudio(), [])
  const actions = useMemo(() => new StoneActionTracker(), [])
  const timeline = useMemo(() => new StoneFeedbackTimeline(), [])
  const listener = useRef<StoneState['players'][number] | undefined>(undefined)
  const activeNow = useRef(false), animation = useRef(0), wake = useRef(() => {})
  const frame = useRef<StoneFeedbackFrame>({ enabled: false, hits: new Map() })
  useEffect(() => {
    const tick = () => {
      animation.current = 0
      if (!activeNow.current || document.hidden) { timeline.reset(); return }
      const now = performance.now(), cues = timeline.drain(now), view = listener.current
      for (const [id, hit] of frame.current.hits) if (now - hit.startedAt >= STONE_HIT_EFFECT_MS) frame.current.hits.delete(id)
      if (frame.current.enabled) for (const cue of cues) if (cue.kind === 'hit') {
        frame.current.hits.set(cue.userId, { hitAt: cue.at, startedAt: now })
        if (cue.owner === ownId) frame.current.confirmedAt = now
      }
      if (view) for (const cue of audibleStoneCues(cues, view)) void audio.play(cue, view).catch(() => {})
      if (timeline.size || frame.current.hits.size) animation.current = requestAnimationFrame(tick)
    }
    wake.current = () => { if (!animation.current && timeline.size) animation.current = requestAnimationFrame(tick) }
    return () => { cancelAnimationFrame(animation.current); animation.current = 0; timeline.reset() }
  }, [timeline, audio, state.gameId, viewId, ownId])
  useEffect(() => {
    armUnlock()
    const prepare = () => audio.prepare()
    const hide = () => { if (document.hidden) { tracker.reset(); actions.reset(); timeline.reset(); frame.current.enabled = false; frame.current.hits.clear(); audio.stop() } }
    prepare()
    window.addEventListener('pointerdown', prepare); window.addEventListener('keydown', prepare)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('pointerdown', prepare); window.removeEventListener('keydown', prepare)
      document.removeEventListener('visibilitychange', hide)
      frame.current.enabled = false; frame.current.hits.clear(); frame.current.confirmedAt = 0; tracker.reset(); actions.reset(); timeline.reset(); audio.stop()
    }
  }, [audio, tracker, actions, timeline, state.gameId])
  useEffect(() => {
    const active = enabled && !document.hidden
    const view = state.players.find(player => player.userId === viewId)
    activeNow.current = active; listener.current = view
    const cues = [...tracker.read(state, active), ...actions.read(state, active, view)]
      .filter(cue => cue.kind !== 'eliminated' || cue.userId === ownId)
    frame.current.enabled = active && state.phase === 'RUNNING'
    if (!frame.current.enabled) frame.current.hits.clear()
    if (!active) { timeline.reset(); audio.stop(); return }
    timeline.accept(state.gameId, state.serverTime, cues, performance.now(), ownId)
    wake.current()
  }, [state, enabled, viewId, ownId, tracker, actions, audio, timeline])
  return frame
}
