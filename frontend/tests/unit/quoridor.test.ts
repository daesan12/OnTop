import { expect, it } from 'vitest'
import { parseGame, gamePlayers, gameState, type QuoridorGame } from '../../src/game/protocol'
import { parseQuoridor, type Quoridor } from '../../src/game/quoridor/protocol'
import { canStartForfeit } from '../../src/game/forfeit'
import { gatheringModel } from '../../src/features/tableLobby/gatheringModel'
import { gameSelection } from '../../src/features/tableLobby/model'
import { parseGameReaction } from '../../src/game/presentation/defeat'
import { debrisPieces, parseParkDebris } from '../../src/features/parkDebris/state'
import { parseHistory } from '../../src/features/gameHistory/service'

const initial = (count = 2): Quoridor => ({
  gameCode: 'QUORIDOR', boardSize: 9, version: 1, status: 'PLAYING', turnUserId: '101', turnDeadline: null,
  winnerUserIds: [], endReason: null, endedAt: null, walls: [], legalMoves: [{ x: 4, y: 1 }], legalWalls: [],
  players: (count === 2 ? [[4, 0, 'SOUTH'], [4, 8, 'NORTH']] : [[4, 0, 'SOUTH'], [8, 4, 'WEST'], [4, 8, 'NORTH'], [0, 4, 'EAST']])
    .map(([x, y, goal], index) => ({ userId: String(101 + index), x: Number(x), y: Number(y), goal: goal as Quoridor['players'][number]['goal'], wallsRemaining: count === 2 ? 10 : 5, active: true })),
})
const payload = (board: Quoridor, role = 'PLAYER') => ({ gameId: 'q', version: board.version, role, publicState: board, privateState: {} })

it.each([2, 4])('%i인 상태를 공통 경기·참가자 계약으로 읽는다', count => {
  const board = initial(count), game = parseGame(payload(board), '101')
  expect(gameState(game)).toEqual(board)
  expect(gamePlayers(game)).toHaveLength(count)
  expect(gameSelection('QUORIDOR', 10)).toEqual({ gameCode: 'QUORIDOR', betAmountPerPlayer: 10 })
})

it('3인·중복 말·보드 밖 장벽·재고 불일치를 거절한다', () => {
  const board = initial(4)
  expect(() => parseQuoridor({ ...board, players: board.players.slice(0, 3) })).toThrow()
  expect(() => parseQuoridor({ ...board, players: board.players.map(p => ({ ...p, x: 4, y: 0 })) })).toThrow()
  expect(() => parseQuoridor({ ...board, walls: [{ x: 8, y: 0, orientation: 'HORIZONTAL' }] })).toThrow()
  expect(() => parseQuoridor({ ...board, players: board.players.map(p => ({ ...p, wallsRemaining: 6 })) })).toThrow()
})

it('봉투와 판 버전 불일치 및 관전자 개인 상태를 거절한다', () => {
  expect(() => parseGame({ ...payload(initial()), version: 2 }, '101')).toThrow()
  expect(() => parseGame({ ...payload(initial(), 'SPECTATOR'), privateState: { secret: 1 } }, '999')).toThrow()
})

it('낡은 상태·기권한 참가자·관전자에게 기권 요청을 열지 않는다', () => {
  const game: QuoridorGame = { gameId: 'q', version: 1, role: 'PLAYER', quoridor: initial() }
  const state = { game, permittedGameId: 'q', watchedGameId: '', recovery: 'RESTORED' as const, pending: false, uncertain: false, awaitingVersion: 1 }
  expect(canStartForfeit('101', state)).toBe(true)
  expect(canStartForfeit('101', { ...state, awaitingVersion: 2 })).toBe(false)
  expect(canStartForfeit('101', { ...state, game: { ...game, role: 'SPECTATOR' } })).toBe(false)
  game.quoridor.players[0].active = false
  expect(canStartForfeit('101', state)).toBe(false)
})

it('도착 승리 결과를 공통 테이블 결과에 표시한다', () => {
  const board = initial()
  board.status = 'FINISHED'; board.turnUserId = null; board.winnerUserIds = ['101']; board.endReason = 'GOAL_REACHED'; board.endedAt = '2026-11-21T00:00:00Z'
  const game = parseGame(payload(board), '101')
  const model = gatheringModel({ table: { tableId: 't', seats: [], gameCode: 'QUORIDOR' } as never,
    ownId: '101', game, result: null, start: null, nickname: id => id === '101' ? '하나' : '둘' })
  expect(model.headline).toBe('하나 승리')
  expect(model.reason).toBe('맞은편 끝줄에 도착했습니다.')
})

it('승인된 공통 기권 연출과 탁자·엽전 잔해를 읽는다', () => {
  const time = '2026-11-21T00:00:00Z'
  const event = { eventId:'q:reaction:101',gameId:'q',tableId:'t',channelId:'c',gameCode:'QUORIDOR',version:2,
    userId:'101',kind:'FORFEIT',remainingBefore:2,motion:'table-flip',durationMs:2800,occurredAt:time,participantCount:2 }
  expect(parseGameReaction(event).motion).toBe('table-flip')
  expect(debrisPieces('QUORIDOR')).toEqual([])
  const state = parseParkDebris({channelId:'c',mapVersion:'map',version:1,items:[{id:'q:debris',gameId:'q',tableId:'t',anchorId:'table-1',
    gameCode:'QUORIDOR',userId:'101',occurredAt:time,throwYaw:0,seed:1,parts:['board','coin-0']}]})
  expect(state.items[0].gameCode).toBe('QUORIDOR')
})

it('쿼리도 전적 때문에 전체 전적 응답을 거절하지 않는다', () => {
  const page = parseHistory({items:[{gameSessionId:'7',gameCode:'QUORIDOR',status:'FINISHED',myResult:'WIN',
    settlementStatus:'SETTLED',endedAt:'2026-11-21T00:00:00Z'}],nextCursor:null,hasNext:false},'QUORIDOR')
  expect(page.items[0].gameCode).toBe('QUORIDOR')
})
