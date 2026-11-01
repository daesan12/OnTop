import type { HalliGalli } from './protocol'

export type FlipTimerPhase = 'idle' | 'paused' | 'running' | 'waiting'
export interface FlipTimer { phase: FlipTimerPhase; fraction: number }
/**
 * Remaining share of the 5s flip limit from the server deadline. paused: result pause, the bar stays full.
 * waiting: the deadline passed and the server's auto flip has not arrived yet; the client never flips itself.
 */
export function flipTimer(h: HalliGalli, now: number): FlipTimer {
  if (h.status !== 'PLAYING' || !h.flipDeadline) return { phase: 'idle', fraction: 0 }
  if (h.resultUntil && now < Date.parse(h.resultUntil)) return { phase: 'paused', fraction: 1 }
  const left = Date.parse(h.flipDeadline) - now
  if (left <= 0) return { phase: 'waiting', fraction: 0 }
  return { phase: 'running', fraction: Math.min(1, left / h.flipTimeLimitMs) }
}
export const timerText = (t: FlipTimer) => t.phase === 'paused' ? '결과 확인 중' : t.phase === 'waiting' ? '서버 판정 대기'
  : t.fraction > .5 ? '여유 있음' : t.fraction > .2 ? '절반 이하' : '곧 마감'
