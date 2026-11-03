import {beforeEach,expect,it,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
vi.mock('../../src/park/runtime/ParkRuntime',()=>({useParkRuntime:()=>({})}))
import {OmokDrawCard} from '../../src/game/omok/OmokDrawControls'
import {parseOmok,type OmokGame} from '../../src/game/protocol'
import {canPlace,receiveGame,resetGame,useGame} from '../../src/game/store'
import {resetForfeit} from '../../src/game/forfeit'
import {canDrawAction} from '../../src/game/omok/draw'
import {canUndoAction} from '../../src/game/omok/undo'
import {omokEndReason,omokOutcome} from '../../src/game/omokPresentation'

const now=Date.parse('2026-11-03T00:00:00Z')
function sample(){return {gameCode:'OMOK',status:'PLAYING',boardSize:15,
  board:Array.from({length:15},()=>Array<number>(15).fill(0)),blackUserId:'101',whiteUserId:'202',
  turnUserId:'101',turnDeadline:new Date(now+30000).toISOString(),moveCount:0,lastMove:null,
  winnerUserId:null,endReason:null,endedAt:null,undo:null,undoDecision:null,draw:null,drawDecision:null,drawRequestsUsed:[]}}
const pending=()=>({requestId:'draw-1',requesterUserId:'101',deadline:new Date(now+10000).toISOString()})
function set(value:unknown=sample(),version=0){
  const game:OmokGame={gameId:'g',version,role:'PLAYER',omok:parseOmok(value)}
  useGame.setState({game,permittedGameId:'g',recovery:'RESTORED'});return game
}
beforeEach(()=>{resetGame();resetForfeit()})
it('allows one request on own turn even on an empty board and keeps the opponent budget separate',()=>{
  set();expect(canDrawAction('101',{kind:'drawRequest'},now)).toBe(true)
  expect(canDrawAction('202',{kind:'drawRequest'},now)).toBe(false)
  expect(canDrawAction('505',{kind:'drawRequest'},now)).toBe(false)
  set({...sample(),drawRequestsUsed:['101']});expect(canDrawAction('101',{kind:'drawRequest'},now)).toBe(false)
  set({...sample(),turnUserId:'202',drawRequestsUsed:['101']});expect(canDrawAction('202',{kind:'drawRequest'},now)).toBe(true)
})
it('pending draw blocks placements and undo; only the opponent can answer a matching request before deadline',()=>{
  set({...sample(),draw:pending(),drawRequestsUsed:['101']})
  expect(canPlace('101',0,0,now)).toBe(false)
  expect(canUndoAction('101',{kind:'undoRequest'},now)).toBe(false)
  expect(canDrawAction('101',{kind:'drawRespond',requestId:'draw-1',accept:true},now)).toBe(false)
  expect(canDrawAction('202',{kind:'drawRespond',requestId:'draw-1',accept:true},now)).toBe(true)
  expect(canDrawAction('202',{kind:'drawRespond',requestId:'old',accept:true},now)).toBe(false)
  expect(canDrawAction('202',{kind:'drawRespond',requestId:'draw-1',accept:true},now+10000)).toBe(false)
})
it.each(['pending','uncertain','awaitingVersion','recovery','role'] as const)('blocks unsafe state: %s',field=>{
  const game=set()
  if(field==='role')useGame.setState({game:{...game,role:'SPECTATOR'}})
  else if(field==='recovery')useGame.setState({recovery:'PENDING'})
  else if(field==='awaitingVersion')useGame.setState({awaitingVersion:1})
  else useGame.setState({[field]:true})
  expect(canDrawAction('101',{kind:'drawRequest'},now)).toBe(false)
})
it('hides capability on old server state and blocks requests during coin toss',()=>{
  const old=sample() as Record<string,unknown>;delete old.draw;set(old)
  expect(canDrawAction('101',{kind:'drawRequest'},now)).toBe(false)
  set({...sample(),coinTossEndsAt:new Date(now+2500).toISOString()})
  expect(canDrawAction('101',{kind:'drawRequest'},now)).toBe(false)
})
it.each([
  {drawRequestsUsed:['101','101']},{drawRequestsUsed:['505']},
  {draw:pending(),drawRequestsUsed:[]},
  {draw:{...pending(),requesterUserId:'202'},drawRequestsUsed:['202']},
  {draw:{...pending(),deadline:'bad'},drawRequestsUsed:['101']},
  {drawDecision:{requestId:'draw-1',status:'UNKNOWN'}},
])('rejects malformed draw state: %j',fields=>expect(()=>parseOmok({...sample(),...fields})).toThrow('무승부'))
it('keeps the newer used budget when an old snapshot arrives',()=>{
  set({...sample(),drawRequestsUsed:['101'],drawDecision:{requestId:'draw-1',status:'REJECTED'}},2)
  receiveGame({type:'GAME_STATE',requestId:null,payload:{gameId:'g',version:0,role:'PLAYER',publicState:sample(),privateState:{}}},'101','t')
  expect(canDrawAction('101',{kind:'drawRequest'},now)).toBe(false);expect(useGame.getState().game?.version).toBe(2)
})
it('renders a side request with shrinking progress; requester cannot approve',()=>{
  const omok=parseOmok({...sample(),draw:pending(),drawRequestsUsed:['101']})
  const view=(own:string,at:number)=>renderToStaticMarkup(createElement(OmokDrawCard,{omok,own,now:at,send:async()=>true,requestDisabled:true,responseDisabled:false}))
  expect(view('202',now)).toContain('value="10000"')
  const later=view('202',now+4000);expect(later).toContain('value="6000"');expect(later).toContain('6초')
  expect(later).toContain('>무승부</button>');expect(later).toContain('>거절</button>');expect(later).not.toContain('role="dialog"')
  expect(view('101',now)).not.toContain('>무승부</button>')
})
it('shows the used request and readable agreed-draw result',()=>{
  const omok=parseOmok({...sample(),drawRequestsUsed:['101'],drawDecision:{requestId:'draw-1',status:'REJECTED'}})
  const html=renderToStaticMarkup(createElement(OmokDrawCard,{omok,own:'101',now,send:async()=>true,requestDisabled:true,responseDisabled:true}))
  expect(html).toContain('이번 경기의 무승부 요청을 사용했어요.');expect(html).toContain('disabled')
  expect(omokEndReason('AGREED_DRAW')).toBe('합의 무승부')
  expect(omokOutcome({...omok,status:'FINISHED',winnerUserId:null},'101',false)).toContain('무승부')
})
it('copies known fields without retaining private extras',()=>{
  const o=parseOmok({...sample(),draw:{...pending(),secret:'private'},drawRequestsUsed:['101']})
  expect(o.draw).toEqual(pending());expect(o.drawRequestsUsed).toEqual(['101'])
})
