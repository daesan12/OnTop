import type { TableState } from '../network/protocol'
import { gamePlayers, gameState, type Game } from './protocol'

type StakeTable = Pick<TableState, 'gameId' | 'betAmountPerPlayer'>

/** Watchers may receive the public table summary before its detailed watch state. */
export function matchStakeDetails(game: Game | null | undefined, tables: Readonly<Record<string, StakeTable>>,
  publicTables: readonly StakeTable[] = []): { perPlayer: number; participants: number; total: number } | null {
  if (!game?.gameId || gameState(game)?.status !== 'PLAYING') return null
  const table = Object.values(tables).find(table => table.gameId === game.gameId)
    ?? publicTables.find(table => table.gameId === game.gameId)
  const perPlayer = table?.betAmountPerPlayer, participants = gamePlayers(game).length
  if (typeof perPlayer !== 'number' || !Number.isSafeInteger(perPlayer) || perPlayer < 0 || participants < 1) return null
  const total = perPlayer * participants
  return Number.isSafeInteger(total) ? { perPlayer, participants, total } : null
}

/**
 * Total stake of the running match, the same value as the server's GameSession.totalPot:
 * the confirmed per-player bet times every original participant (forfeited or eliminated players keep their stake in the pot).
 * The bet comes from TABLE_STATE / TABLE_WATCH_STATE, and only from the table whose public gameId is this match,
 * so a later configuration or another table's bet is never shown.
 */
export function matchStake(game: Game | null | undefined, tables: Readonly<Record<string, StakeTable>>): number | null {
  const stake = matchStakeDetails(game, tables)
  return stake && stake.total > 0 ? stake.total : null
}

export const stakeLabel = (total: number) => `${total.toLocaleString('ko-KR')}냥`
