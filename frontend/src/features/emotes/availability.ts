import { avatars, estimatedServerTime, useSession } from '../../network/worldClient'
import { tableBusy } from '../../game/store'
import { useBenchState } from '../interactions/benchState'
import { useFitnessState } from '../fitness/state'
import { useTelescopeState } from '../telescopes/state'
import { inputState } from '../../world/inputOwnership'
import { findEmote, type EmoteId } from './catalog'
import { emotePreview, useEmoteState } from './state'

export function emoteSource(id: EmoteId): 'server' | 'mock' | 'unavailable' {
  if (useEmoteState.getState().bindings[id]) return 'server'
  return emotePreview && id !== 'EMOTE_WAVE' && id !== 'EMOTE_CLAP' ? 'mock' : 'unavailable'
}
export function emoteUnavailable(id: EmoteId, now = estimatedServerTime()): string {
  const session = useSession.getState(), state = useEmoteState.getState()
  const avatar = avatars.get(session.sessionId)
  if (!findEmote(id) || emoteSource(id) === 'unavailable') return '서버 연결 준비 중'
  if (session.status !== 'connected' || !session.roomId || !session.mapCompatible || !avatar?.connected) return '공원 연결을 확인해주세요'
  if (state.pending) return '감정표현 응답을 기다리고 있어요'
  if (now < state.readyAt) return `다음 감정표현까지 ${Math.ceil((state.readyAt - now) / 1000)}초`
  if (session.pending || useBenchState.getState().pending || useFitnessState.getState().pending || useTelescopeState.getState().pending || tableBusy()) return '현재 작업을 마친 뒤 사용해주세요'
  if (avatar.seatIndex >= 0 || session.tableId || session.benchId || avatar.fitnessId || avatar.telescopeId || avatar.swimming) return '시설 이용·수영을 마친 뒤 사용해주세요'
  if (avatar.moving) return '잠시 멈춘 뒤 사용해주세요'
  if (inputState.blocked || inputState.chatOpen || inputState.manualOpen || inputState.mapOpen || inputState.minigameOpen || inputState.feedbackOpen || inputState.notesOpen) return '열린 창을 닫은 뒤 사용해주세요'
  return ''
}
