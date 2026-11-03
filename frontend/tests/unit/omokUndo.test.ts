import { beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../../src/park/runtime/ParkRuntime', () => ({useParkRuntime: () => ({})}))
import { OmokUndoCard } from '../../src/game/omok/OmokUndoControls'
import { parseOmok, type OmokGame } from '../../src/game/protocol'
import { canPlace, receiveGame, resetGame, useGame } from '../../src/game/store'
import { resetForfeit } from '../../src/game/forfeit'
import { canUndoAction } from '../../src/game/omok/undo'

const now = Date.parse('2026-11-03T00:00:00Z')
function sample() {
  const board = Array.from({ length:15 }, () => Array<number>(15).fill(0))
  board[0]![0] = 1; board[2]![0] = 2
  return { gameCode:'OMOK',status:'PLAYING',boardSize:15,board,blackUserId:'101',whiteUserId:'202',
    turnUserId:'101',turnDeadline:new Date(now+30000).toISOString(),moveCount:2,
    lastMove:{x:0,y:2,stone:'WHITE'},winnerUserId:null,endReason:null,endedAt:null,undo:null,undoDecision:null }
}
function pending() { return {requestId:'undo-1',requesterUserId:'101',deadline:new Date(now+10000).toISOString()} }
function set(value = sample(), version = 2) {
  const game:OmokGame = {gameId:'g',version,role:'PLAYER',omok:parseOmok(value)}
  useGame.setState({game,permittedGameId:'g',recovery:'RESTORED'})
  return game
}
beforeEach(() => { resetGame(); resetForfeit() })
it('requests only on own turn with a previous pair and explicit server capability', () => {
  set(); expect(canUndoAction('101',{kind:'undoRequest'},now)).toBe(true)
  expect(canUndoAction('202',{kind:'undoRequest'},now)).toBe(false)
  expect(canUndoAction('505',{kind:'undoRequest'},now)).toBe(false)
  const old = sample() as Record<string,unknown>; delete old.undo
  set(old as ReturnType<typeof sample>); expect(canUndoAction('101',{kind:'undoRequest'},now)).toBe(false)
})
it('pending approval blocks placement and only the opponent may answer that request before deadline', () => {
  const o = sample(); set({...o,undo:pending()} as unknown as ReturnType<typeof sample>)
  expect(canPlace('101',1,1,now)).toBe(false)
  expect(canUndoAction('101',{kind:'undoRequest'},now)).toBe(false)
  expect(canUndoAction('101',{kind:'undoRespond',requestId:'undo-1',accept:true},now)).toBe(false)
  expect(canUndoAction('202',{kind:'undoRespond',requestId:'undo-1',accept:true},now)).toBe(true)
  expect(canUndoAction('202',{kind:'undoRespond',requestId:'old',accept:true},now)).toBe(false)
  expect(canUndoAction('202',{kind:'undoRespond',requestId:'undo-1',accept:false},now+10000)).toBe(false)
})
it.each(['pending','uncertain','awaitingVersion','recovery','role'] as const)('blocks unsafe or spectator state: %s', field => {
  const g=set()
  if(field==='role') useGame.setState({game:{...g,role:'SPECTATOR'}})
  else if(field==='recovery') useGame.setState({recovery:'PENDING'})
  else if(field==='awaitingVersion') useGame.setState({awaitingVersion:3})
  else useGame.setState({[field]:true})
  expect(canUndoAction('101',{kind:'undoRequest'},now)).toBe(false)
})
it('allows later repeated requests and accepts a newer version with a lower move count', () => {
  const g=set()
  const o=sample(); o.board[0]![0]=0; o.board[2]![0]=0
  const empty={...o,moveCount:0,lastMove:null,undoDecision:{requestId:'undo-1',status:'ACCEPTED'}}
  receiveGame({type:'GAME_STATE',requestId:null,payload:{gameId:'g',version:4,role:'PLAYER',publicState:empty,privateState:{}}},'101','t')
  expect(useGame.getState().game?.omok?.moveCount).toBe(0)
  receiveGame({type:'GAME_STATE',requestId:null,payload:{gameId:'g',version:2,role:'PLAYER',publicState:g.omok,privateState:{}}},'101','t')
  expect(useGame.getState().game?.version).toBe(4)
  set(sample(),6); expect(canUndoAction('101',{kind:'undoRequest'},now)).toBe(true)
})
it.each([
  {...pending(),requesterUserId:'202'},
  {...pending(),deadline:'not-a-time'}, {...pending(),requestId:''},
])('rejects invalid pending public data', undo => {
  expect(() => parseOmok({...sample(),undo})).toThrow('무르기')
})
it('does not retain hidden fields from the undo payload', () => {
  const o=parseOmok({...sample(),undo:{...pending(),secret:'private'}})
  expect(o.undo).toEqual(pending())
})
it('renders a small non-modal request with declining time and progress; requester has no approval button', () => {
  const omok=parseOmok({...sample(),undo:pending()})
  const view=(own:string,at:number)=>renderToStaticMarkup(createElement(OmokUndoCard,{omok,own,now:at,
    send:async()=>true,requestDisabled:true,responseDisabled:false}))
  const start=view('202',now), later=view('202',now+4000)
  expect(start).toContain('role="group"'); expect(start).not.toContain('role="dialog"')
  expect(start).toContain('value="10000"'); expect(later).toContain('value="6000"')
  expect(later).toContain('6초'); expect(later).toContain('>무르기</button>'); expect(later).toContain('>거절</button>')
  expect(view('101',now)).not.toContain('>무르기</button>')
  expect(later).toContain('요청자의 착수 제한시간은 계속 흘러요.')
})
