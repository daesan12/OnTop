import { create } from 'zustand'
import { useGame } from '../store'
import { forfeitBlocksInput } from '../forfeit'
import type { HalliGalli, HalliInput } from './protocol'

export type RingMark = 'queued' | 'sent'
const initial = () => ({ gameId: '', rings: {} as Record<number, RingMark>, notice: '', noticeAt: 0 })
/**
 * Bell windows this tab already rang in, per game. The server keeps a window open after a wrong ring and would
 * charge every new actionId again, so a window stays blocked for the whole game, not just while it is the last event.
 */
export const useHalliUI = create(initial)
export const resetHalliUI = () => useHalliUI.setState(initial(), true)

export function markHalliRing(gameId: string, bellWindowId: number, mark: RingMark | null) {
  const ui = useHalliUI.getState(), rings = ui.gameId === gameId ? { ...ui.rings } : {}
  if (mark) rings[bellWindowId] = mark
  else delete rings[bellWindowId]
  useHalliUI.setState({ gameId, rings })
}
export const halliRingMark = (gameId: string, bellWindowId: number): RingMark | undefined => {
  const ui = useHalliUI.getState()
  return ui.gameId === gameId ? ui.rings[bellWindowId] : undefined
}
export const halliNotice = (notice: string, now = Date.now()) => useHalliUI.setState({ notice, noticeAt: now })

function ownGame(ownId: string) {
  const s = useGame.getState(), g = s.game
  if (!g?.halli || g.role !== 'PLAYER' || !ownId || g.gameId !== s.permittedGameId || s.recovery !== 'RESTORED'
    || ['STARTING', 'CONFIRMED', 'SETTLING'].includes(s.start?.phase ?? '') || s.uncertain || forfeitBlocksInput(g.gameId)
    || g.halli.status !== 'PLAYING' || !g.halli.players.some(p => p.userId === ownId && p.active)) return null
  return { s, g, h: g.halli }
}
/** Own turn, own draw pile, and the 1s result pause is over. The 5s deadline is the server's: no local auto flip. */
export function canFlipHalli(ownId: string, now = Date.now()) {
  const own = ownGame(ownId)
  if (!own || own.s.pending || own.g.version < own.s.awaitingVersion) return false
  const { h } = own
  return h.turnUserId === ownId && (h.players.find(p => p.userId === ownId)?.drawCount ?? 0) > 0
    && (!h.resultUntil || Date.parse(h.resultUntil) <= now)
}
/**
 * The bell is judged only by the server. bellWindowId must be the window the player saw: a press for a window
 * that is no longer the shown one is dropped, never moved to the newer window. A pending own request does not
 * block here; the runtime queues one ring behind it.
 */
export function canRingHalli(ownId: string, bellWindowId: number) {
  const own = ownGame(ownId)
  return !!own && own.h.bellWindowId !== null && own.h.bellWindowId === bellWindowId
    && halliRingMark(own.g.gameId, bellWindowId) === undefined
}

export type HalliOutcome = { kind: 'quiet' | 'rejected' | 'uncertain'; message: string }
/**
 * quiet: the server answered and nothing changed for a reason the next GAME_STATE already shows.
 * rejected: definite rejection, no state change. uncertain: no answer or an unknown result, never auto-resent.
 */
export function classifyHalliError(kind: HalliInput['kind'], code: string | null): HalliOutcome {
  if (kind === 'ring' && code === 'GAME_ACTION_STALE_VERSION')
    return { kind: 'quiet', message: '이미 처리된 종이에요. 바뀐 카드를 보고 다시 판단해 주세요.' }
  if (kind === 'flip' && ['GAME_ACTION_STALE_VERSION', 'GAME_ACTION_NOT_YOUR_TURN', 'GAME_ACTION_INVALID_ACTION'].includes(code ?? ''))
    return { kind: 'quiet', message: '서버가 이미 카드를 공개했거나 아직 공개할 수 없어요.' }
  if (code === 'GAME_ACTION_INVALID_ACTION' || code === 'GAME_ACTION_NOT_YOUR_TURN' || code === 'GAME_ACTION_GAME_FINISHED')
    return { kind: 'rejected', message: '지금은 종을 칠 수 없어요.' }
  if (code === 'GAME_ACTION_NOT_ACTIVE') return { kind: 'rejected', message: '경기에서 빠져 더 이상 행동할 수 없어요.' }
  if (code === 'GAME_ACTION_PENDING') return { kind: 'rejected', message: '앞선 요청을 처리하는 중이라 보내지 못했어요.' }
  return { kind: 'uncertain', message: '할리갈리 처리 결과를 확인해야 합니다. 자동으로 다시 보내지 않습니다.' }
}

export type SeatSlot = 'bottom' | 'left' | 'top' | 'right'
const SLOTS: Record<number, SeatSlot[]> = { 2: ['bottom', 'top'], 3: ['bottom', 'left', 'right'], 4: ['bottom', 'left', 'top', 'right'] }
/** Own seat at the bottom, the rest in server seat order. Spectators keep seat 0 at the bottom. */
export function seatSlots(h: HalliGalli, viewerId: string): SeatSlot[] {
  const n = h.players.length, anchor = Math.max(0, h.players.findIndex(p => p.userId === viewerId))
  return h.players.map((_, i) => SLOTS[n]![(i - anchor + n) % n]!)
}
