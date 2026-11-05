import type { TableState } from '../network/protocol'
import { gamePlayers, gameState, type Game } from './protocol'

type StakeTable = Pick<TableState, 'gameId' | 'betAmountPerPlayer'>

/**
 * Total stake of the running match, the same value as the server's GameSession.totalPot:
 * the confirmed per-player bet times every original participant (forfeited or eliminated players keep their stake in the pot).
 * The bet comes from TABLE_STATE / TABLE_WATCH_STATE, and only from the table whose public gameId is this match,
 * so a later configuration or another table's bet is never shown.
 */
export function matchStake(game: Game | null | undefined, tables: Readonly<Record<string, StakeTable>>): number | null {
  if (!game?.gameId || gameState(game)?.status !== 'PLAYING') return null
  const bet = Object.values(tables).find(table => table.gameId === game.gameId)?.betAmountPerPlayer
  if (typeof bet !== 'number' || !Number.isSafeInteger(bet) || bet <= 0) return null
  const total = bet * gamePlayers(game).length
  return Number.isSafeInteger(total) && total > 0 ? total : null
}

export const stakeLabel = (total: number) => `${total.toLocaleString('ko-KR')}냥`
