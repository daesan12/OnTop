import { create } from 'zustand'
import { record, integer, type Envelope } from '../network/protocol'
import { forfeitBlocksInput } from './forfeit'
import {
  id,
  parseGame,
  parseOmok,
  parseFarkle,
  gameState,
  gamePlayers,
  parseStart,
  parseResult,
  recoveryStatuses,
  type Game,
  type Recovery,
  type StartState,
  type Result,
} from './protocol'

interface Session {
  start: StartState | null
  recovery: Recovery
  game: Game | null
  permittedGameId: string
  watchedGameId: string
  pending: boolean
  uncertain: boolean
  awaitingVersion: number
  error: string
  result: Result | null
  lastResult: Result | null
  completedGameId: string
  dismissedResult: { gameId: string; version: number } | null
}
const initial = (): Session => ({
  start: null,
  recovery: 'UNKNOWN',
  game: null,
  permittedGameId: '',
  watchedGameId: '',
  pending: false,
  uncertain: false,
  awaitingVersion: -1,
  error: '',
  result: null,
  lastResult: null,
  completedGameId: '',
  dismissedResult: null,
})
export const useGame = create<Session>(initial)
export const resetGame = () => useGame.setState(initial(), true)
export const recoveryBlocked = (s = useGame.getState()) =>
  ['PENDING', 'EXPIRED', 'UNAVAILABLE'].includes(s.recovery)
export const tableBusy = (s = useGame.getState()) =>
  recoveryBlocked(s) ||
  ['STARTING', 'CONFIRMED', 'PLAYING', 'SETTLING'].includes(
    s.start?.phase ?? '',
  ) ||
  (s.recovery === 'RESTORED' && !!s.permittedGameId)
export function canPlace(
  ownId: string,
  x: number,
  y: number,
  now = Date.now(),
) {
  const s = useGame.getState(),
    g = s.game
  return (
    !!g?.omok &&
    g.role === 'PLAYER' &&
    g.gameId === s.permittedGameId &&
    s.recovery === 'RESTORED' &&
    !['STARTING', 'CONFIRMED', 'SETTLING'].includes(s.start?.phase ?? '') &&
    !s.pending &&
    !s.uncertain &&
    !forfeitBlocksInput(g.gameId) &&
    g.version >= s.awaitingVersion &&
    g.omok.status === 'PLAYING' &&
    g.omok.turnUserId === ownId &&
    Date.parse(g.omok.turnDeadline!) > now &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < 15 &&
    y >= 0 &&
    y < 15 &&
    g.omok.board[y]![x] === 0
  )
}
function applyGame(next: Game) {
  const s = useGame.getState()
  if (s.game?.gameId === next.gameId && next.version < s.game.version) return
  if (s.game?.gameId === next.gameId && gameState(s.game).gameCode !== gameState(next).gameCode) {
    useGame.setState({ uncertain: true, error: '경기 종류를 다시 확인해주세요.' })
    return
  }
  useGame.setState({
    game: next,
    ...(next.version >= s.awaitingVersion ? { uncertain: false } : {}),
    error: '',
  })
}
/** No socket, renderer, win detection or currency calculation in the display store. */
export function receiveGame(m: Envelope, ownId: string, tableId: string) {
  const p = m.payload,
    s = useGame.getState()
  if (m.type === 'TABLE_LEFT') {
    resetGame()
  } else if (m.type === 'GAME_START_STATE') {
    const next = parseStart(p)
    if (next.tableId !== null && next.tableId !== tableId) return
    if (s.start?.tableId === next.tableId && next.revision < s.start.revision)
      return
    const newGame =
      next.gameSessionId && next.gameSessionId !== s.permittedGameId
    useGame.setState({
      start: next,
      ...(!next.simulation && ['PLAYING', 'SETTLING'].includes(next.phase)
        ? {
            permittedGameId: next.gameSessionId!,
            ...(newGame
              ? {
                  game: null,
                  result: null,
                  lastResult: null,
                  completedGameId: '',
                  dismissedResult: null,
                  uncertain: false,
                  awaitingVersion: -1,
                }
              : {}),
          }
        : {}),
      ...(next.phase === 'WAITING' && s.start?.phase !== 'WAITING'
        ? {
            game: null,
            permittedGameId: '',
            result: null,
            completedGameId: s.permittedGameId || s.completedGameId,
            awaitingVersion: -1,
            uncertain: false,
          }
        : {}),
    })
  } else if (m.type === 'GAME_CONNECTION_STATE') {
    if (!recoveryStatuses.includes(p.status as Recovery))
      throw new Error('경기 복구 상태를 확인해주세요.')
    const status = p.status as Recovery
    if (['RESTORED', 'FINISHED', 'ELIMINATED'].includes(status)) {
      if (!id(p.gameId) || !integer(p.version) || !record(p.state))
        throw new Error('경기 복구 응답을 확인해주세요.')
      const wrappedGame = record(p.state.publicState) && ['ONE_CARD', 'LIAR_BRIDGE'].includes(String(p.state.publicState.gameCode))
      if (!wrappedGame && !['OMOK', 'DICE'].includes(String(p.state.gameCode))) {
        useGame.setState({
          recovery: status,
          permittedGameId: p.gameId,
          game: null,
          error: '이 경기의 게임 화면은 아직 이관되지 않았습니다.',
        })
        return
      }
      const next: Game = wrappedGame ? parseGame({ gameId: p.gameId, version: p.version, role: 'PLAYER',
        publicState: p.state.publicState, privateState: p.state.privateState }, ownId) : p.state.gameCode === 'DICE'
        ? { gameId: p.gameId, version: p.version, role: 'PLAYER', dice: parseFarkle(p.state) }
        : { gameId: p.gameId, version: p.version, role: 'PLAYER', omok: parseOmok(p.state) }
      if (!gamePlayers(next).includes(ownId))
        throw new Error('본인 경기 복구가 아닙니다.')
      if (s.permittedGameId && s.permittedGameId !== p.gameId) return
      if (s.game?.gameId === p.gameId && p.version < s.game.version) return
      useGame.setState({
        recovery: status,
        permittedGameId: p.gameId,
        uncertain: false,
        ...(p.gameId !== s.permittedGameId && p.gameId !== s.completedGameId
          ? { lastResult: null, completedGameId: '', dismissedResult: null } : {}),
      })
      applyGame(next)
    } else {
      useGame.setState({
        recovery: status,
        ...(status === 'LOBBY'
          ? {
              permittedGameId: '',
              game: null,
              result: null,
              awaitingVersion: -1,
              uncertain: false,
            }
          : {}),
      })
    }
  } else if (m.type === 'GAME_STATE') {
    if (p.gameId !== s.permittedGameId && p.gameId !== s.watchedGameId) return
    if (!record(p.publicState) || !['OMOK', 'DICE', 'ONE_CARD', 'LIAR_BRIDGE'].includes(String(p.publicState.gameCode))) {
      useGame.setState({
        game: null,
        uncertain: true,
        error: '이 경기의 게임 화면은 아직 이관되지 않았습니다.',
      })
      return
    }
    const next = parseGame(p, ownId)
    if (
      next.role === 'PLAYER' &&
      (p.gameId !== s.permittedGameId ||
        !gamePlayers(next).includes(ownId))
    )
      return
    if (next.role === 'SPECTATOR' && p.gameId !== s.watchedGameId) return
    applyGame(next)
  } else if (m.type === 'GAME_ACTION_RESULT') {
    if (p.gameId === s.permittedGameId && integer(p.version))
      useGame.setState({
        awaitingVersion: Math.max(s.awaitingVersion, p.version),
      })
  } else if (m.type === 'GAME_RESULT') {
    if ((p.gameSessionId !== s.permittedGameId && p.gameSessionId !== s.completedGameId) || s.game?.role === 'SPECTATOR')
      return
    const next = parseResult(p, ownId)
    if (
      s.lastResult?.gameSessionId === next.gameSessionId &&
      next.version < s.lastResult.version
    )
      return
    const dismissed = s.dismissedResult?.gameId === next.gameSessionId && s.dismissedResult.version >= next.version
    useGame.setState({ lastResult: dismissed ? null : next, ...(p.gameSessionId === s.permittedGameId ? { result: next } : {}) })
  } else if (m.type === 'GAME_WATCH_LEFT') {
    if (p.gameId !== s.watchedGameId) return
    useGame.setState({
      watchedGameId: '',
      game: s.game?.role === 'SPECTATOR' ? null : s.game,
    })
  } else if (m.type === 'ERROR') {
    if (p.code === 'GAME_RECOVERY_REQUIRED')
      useGame.setState({ recovery: 'PENDING', uncertain: true })
    if (
      s.watchedGameId &&
      [
        'GAME_STATE_ACCESS_DENIED',
        'GAME_STATE_UNAVAILABLE',
        'GAME_STATE_INVALID',
        'GAME_STATE_STALE',
      ].includes(String(p.code))
    )
      useGame.setState({
        watchedGameId: '',
        game: s.game?.role === 'SPECTATOR' ? null : s.game,
        error: '경기 관전 권한을 다시 확인해주세요.',
      })
  }
}

export function canPlayDice(ownId: string, now = Date.now()) {
  const s = useGame.getState(), g = s.game
  return !!g?.dice && g.role === 'PLAYER' && g.gameId === s.permittedGameId && s.recovery === 'RESTORED'
    && !['STARTING', 'CONFIRMED', 'SETTLING'].includes(s.start?.phase ?? '') && !s.pending && !s.uncertain && !forfeitBlocksInput(g.gameId)
    && g.version >= s.awaitingVersion && g.dice.status === 'PLAYING' && g.dice.turnUserId === ownId
    && Date.parse(g.dice.turnDeadline!) > now
}
