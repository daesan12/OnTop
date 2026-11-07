import { beforeEach, expect, it } from 'vitest'
import { parseGame, parseOmok, type OmokGame } from '../../src/game/protocol'
import { canPlace, receiveGame, resetGame, useGame } from '../../src/game/store'
import { resetForfeit } from '../../src/game/forfeit'

const now = Date.parse('2026-11-04T00:00:00Z')
function sample() {
  const board = Array.from({ length: 15 }, () => Array<number>(15).fill(0))
  return { gameCode:'OMOK', status:'PLAYING', boardSize:15, board, moveCount:0,
    blackUserId:'101', whiteUserId:'202', turnUserId:'101', turnDeadline:new Date(now + 30000).toISOString(),
    lastMove:null, winnerUserId:null, endReason:null, endedAt:null, forbiddenMoves:[{x:7,y:7}] }
}
beforeEach(() => { resetGame(); resetForfeit() })
it('rejects marked black moves locally but leaves white unrestricted', () => {
  const game:OmokGame = {gameId:'g',version:0,role:'PLAYER',omok:parseOmok(sample(), '101')}
  useGame.setState({game,permittedGameId:'g',recovery:'RESTORED'})
  expect(canPlace('101',7,7,now)).toBe(false)
  expect(canPlace('101',6,7,now)).toBe(true)
  useGame.setState({game:{...game,omok:{...game.omok,turnUserId:'202'}}})
  expect(canPlace('202',7,7,now)).toBe(true)
})
it.each([[{x:-1,y:0}], [{x:15,y:0}], [{x:0,y:NaN}], [{x:7,y:7},{x:7,y:7}]].map(forbiddenMoves => ({forbiddenMoves})))('rejects malformed forbidden coordinates $forbiddenMoves', ({forbiddenMoves}) => {
  expect(() => parseOmok({...sample(),forbiddenMoves}, '101')).toThrow()
})
it('copies public markers, rejects occupied cells and accepts an older server without previews', () => {
  const value = sample(), parsed = parseOmok(value, '101')
  value.forbiddenMoves[0]!.x = 9
  expect(parsed.forbiddenMoves).toEqual([{x:7,y:7}])
  const old = sample() as Record<string,unknown>; delete old.forbiddenMoves
  expect(parseOmok(old, '101').forbiddenMoves).toBeUndefined()
  const occupied = sample(); occupied.board[7]![7] = 1
  expect(() => parseOmok(occupied, '101')).toThrow()
})

it('keeps classified 33/44/6 markers and rejects unknown or numeric classifications',()=>{
 for(const kind of ['33','44','6']) expect(parseOmok({...sample(),forbiddenMoves:[{x:7,y:7,kind}]}, '101').forbiddenMoves).toEqual([{x:7,y:7,kind}])
 for(const kind of ['55',33,null]) expect(()=>parseOmok({...sample(),forbiddenMoves:[{x:7,y:7,kind}]}, '101')).toThrow()
})

it('reads private previews only for the black player and strips legacy public previews from white and spectators', () => {
  const publicState = sample(), points = publicState.forbiddenMoves
  const packet = { gameId: 'g', version: 0, role: 'PLAYER', publicState,
    privateState: { userId: '101', forbiddenMoves: points } }
  expect(parseGame(packet, '101').omok?.forbiddenMoves).toEqual(points)
  expect(parseGame({ ...packet, privateState: {} }, '202').omok?.forbiddenMoves).toBeUndefined()
  expect(parseGame({ ...packet, role: 'SPECTATOR', privateState: {} }, '101').omok?.forbiddenMoves).toBeUndefined()
  expect(parseOmok(publicState).forbiddenMoves).toBeUndefined()
  expect(() => parseGame(packet, '202')).toThrow('수신자')
  expect(() => parseGame({ ...packet, role: 'SPECTATOR' }, '101')).toThrow()
  const modern = { ...publicState } as Record<string, unknown>; delete modern.forbiddenMoves
  expect(parseGame({ ...packet, publicState: modern }, '101').omok?.forbiddenMoves).toEqual(points)
  expect(() => parseGame({ ...packet, privateState: { userId: '202', forbiddenMoves: points } }, '101')).toThrow('수신자')
})

it.each(['101', '202'])('recovery retains only %s own black preview and leaves white moves unrestricted', own => {
  const state = { ...sample(), turnUserId: own,
    privateState: own === '101' ? { userId: own, forbiddenMoves: sample().forbiddenMoves } : {} }
  receiveGame({ type: 'GAME_CONNECTION_STATE', requestId: null, payload: {
    status: 'RESTORED', gameId: 'g', version: 0, state,
  } }, own, 't')
  expect(useGame.getState().game?.omok?.forbiddenMoves).toEqual(own === '101' ? sample().forbiddenMoves : undefined)
  expect(canPlace(own, 7, 7, now)).toBe(own === '202')
})

it('uses the assigned stone color after a coin toss instead of a fixed user or seat', () => {
  const publicState = { ...sample(), blackUserId: '202', whiteUserId: '101', turnUserId: '202' }
  const packet = { gameId: 'g', version: 0, role: 'PLAYER', publicState,
    privateState: { userId: '202', forbiddenMoves: publicState.forbiddenMoves } }
  expect(parseGame(packet, '202').omok?.forbiddenMoves).toEqual(publicState.forbiddenMoves)
  expect(parseGame({ ...packet, privateState: {} }, '101').omok?.forbiddenMoves).toBeUndefined()
})
