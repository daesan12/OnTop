import { beforeEach, expect, it } from 'vitest'
import { parseOmok, type OmokGame } from '../../src/game/protocol'
import { canPlace, resetGame, useGame } from '../../src/game/store'
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
  const game:OmokGame = {gameId:'g',version:0,role:'PLAYER',omok:parseOmok(sample())}
  useGame.setState({game,permittedGameId:'g',recovery:'RESTORED'})
  expect(canPlace('101',7,7,now)).toBe(false)
  expect(canPlace('101',6,7,now)).toBe(true)
  useGame.setState({game:{...game,omok:{...game.omok,turnUserId:'202'}}})
  expect(canPlace('202',7,7,now)).toBe(true)
})
it.each([[{x:-1,y:0}], [{x:15,y:0}], [{x:0,y:NaN}], [{x:7,y:7},{x:7,y:7}]].map(forbiddenMoves => ({forbiddenMoves})))('rejects malformed forbidden coordinates $forbiddenMoves', ({forbiddenMoves}) => {
  expect(() => parseOmok({...sample(),forbiddenMoves})).toThrow()
})
it('copies public markers, rejects occupied cells and accepts an older server without previews', () => {
  const value = sample(), parsed = parseOmok(value)
  value.forbiddenMoves[0]!.x = 9
  expect(parsed.forbiddenMoves).toEqual([{x:7,y:7}])
  const old = sample() as Record<string,unknown>; delete old.forbiddenMoves
  expect(parseOmok(old).forbiddenMoves).toBeUndefined()
  const occupied = sample(); occupied.board[7]![7] = 1
  expect(() => parseOmok(occupied)).toThrow()
})
