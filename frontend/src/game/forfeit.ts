import { create } from 'zustand'
import { gamePlayers, gameState, type Game, type Recovery } from './protocol'
import { integer, record } from '../network/protocol'

export interface ForfeitAttempt {
  userId: string; gameId: string; actionId: string
  status: 'pending' | 'uncertain' | 'approved' | 'rejected'
  error: string
}
export const useForfeit = create(() => ({ attempt: null as ForfeitAttempt | null }))
export const resetForfeit = () => useForfeit.setState({ attempt: null })
export function interruptForfeit() {
  const a = useForfeit.getState().attempt
  if (a?.status === 'pending') useForfeit.setState({ attempt: { ...a, status: 'uncertain', error: '기권 응답을 확인하지 못했어요. 경기 복구 후 같은 요청으로 확인해주세요.' } })
}
// Kept only in memory across a socket reconnect, cleared on park exit/account change.
export const forfeitBlocksInput = (gameId: string) => {
  const a = useForfeit.getState().attempt
  return a?.gameId === gameId && a.status !== 'rejected'
}
export interface ForfeitGameState {
  game: Game | null; permittedGameId: string; watchedGameId: string; recovery: Recovery
  pending: boolean; uncertain: boolean; awaitingVersion: number
  start?: { phase: string } | null
}
export function canStartForfeit(userId: string, s: ForfeitGameState) {
  const g = s.game
  if (!g || g.role !== 'PLAYER' || !userId || s.watchedGameId || g.gameId !== s.permittedGameId
    || s.recovery !== 'RESTORED' || s.pending || s.uncertain || g.version < s.awaitingVersion
    || ['STARTING', 'CONFIRMED', 'SETTLING'].includes(s.start?.phase ?? '')
    || gameState(g).status !== 'PLAYING' || !gamePlayers(g).includes(userId) || forfeitBlocksInput(g.gameId)) return false
  if (g.onecard && !g.onecard.players.some(p => p.userId === userId && p.active)) return false
  if (g.bridge && !g.bridge.players.some(p => p.userId === userId && !p.forfeited && !p.pendingForfeit)) return false
  if (g.ledger && !g.ledger.players.some(p => p.userId === userId && !p.forfeited)) return false
  if (g.halli && !g.halli.players.some(p => p.userId === userId && p.active)) return false
  return true // It need not be this participant's turn; no local deadline or rule decision.
}
export function canRetryForfeit(userId: string, s: ForfeitGameState) {
  const a = useForfeit.getState().attempt
  return !!a && a.status === 'uncertain' && a.userId === userId && a.gameId === s.permittedGameId
    && !s.pending && !s.watchedGameId && ['RESTORED', 'FINISHED', 'ELIMINATED'].includes(s.recovery)
    && s.game?.gameId === a.gameId && s.game.role === 'PLAYER'
}
export function parseForfeitResult(value: unknown, a: Pick<ForfeitAttempt, 'gameId' | 'actionId'>) {
  if (!record(value) || value.gameId !== a.gameId || value.actionId !== a.actionId
    || !integer(value.version) || typeof value.duplicate !== 'boolean') throw new Error('기권 승인 응답을 확인하지 못했어요.')
  return { version: value.version as number, duplicate: value.duplicate }
}
export const definiteForfeitRejection = (code: string) => [
  'INVALID_PAYLOAD', 'GAME_FORFEIT_AUTH_REQUIRED', 'GAME_FORFEIT_NOT_CONFIGURED',
  'GAME_FORFEIT_ACCESS_DENIED', 'GAME_FORFEIT_GAME_FINISHED', 'GAME_FORFEIT_NOT_ACTIVE',
  'GAME_FORFEIT_INVALID_ACTION', 'GAME_ACTION_PENDING',
].includes(code)
export const forfeitError = (code: string) => ({
  GAME_FORFEIT_NOT_CONFIGURED: '기권 서버 연결이 아직 준비되지 않았어요.',
  GAME_FORFEIT_AUTH_REQUIRED: '로그인과 경기 연결을 다시 확인해주세요.',
  GAME_FORFEIT_ACCESS_DENIED: '본인이 참가한 경기만 기권할 수 있어요.',
  GAME_FORFEIT_GAME_FINISHED: '이미 종료된 경기입니다. 최신 경기와 정산 상태를 확인해주세요.',
  GAME_FORFEIT_NOT_ACTIVE: '이미 참가 자격이 종료됐어요. 최신 경기 상태를 확인해주세요.',
  GAME_FORFEIT_INVALID_ACTION: '현재 경기에서 기권을 처리할 수 없어요.',
  GAME_ACTION_PENDING: '진행 중인 요청을 확인한 뒤 다시 시도해주세요.',
  GAME_RECOVERY_REQUIRED: '경기 복구 후 같은 기권 요청으로 확인해주세요.',
} as Record<string, string>)[code] ?? '기권 반영 여부를 확인하지 못했어요. 경기 상태 확인 후 같은 요청으로 확인해주세요.'
