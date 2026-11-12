import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/park/runtime/ParkRuntime',()=>({useParkRuntime:()=>({})}))
// SSR normally selects Zustand's initial snapshot; these tests deliberately render a received public game.
// Render the current presentation snapshot instead of Zustand's initial SSR snapshot.
vi.mock('../../src/game/displayGame',async original=>{
  const m=await original<typeof import('../../src/game/displayGame')>()
  return {...m,useDisplayGame:Object.assign(<T>(select:(s:ReturnType<typeof m.useDisplayGame.getState>)=>T=s=>s as T)=>select(m.useDisplayGame.getState()),m.useDisplayGame)}
})
vi.mock('../../src/game/store',async original=>{
  const m=await original<typeof import('../../src/game/store')>()
  return {...m,useGame:Object.assign(<T>(select:(s:ReturnType<typeof m.useGame.getState>)=>T=s=>s as T)=>select(m.useGame.getState()),m.useGame)}
})
vi.mock('../../src/network/worldClient',async original=>{
  const m=await original<typeof import('../../src/network/worldClient')>()
  return {...m,useSession:Object.assign(<T>(select:(s:ReturnType<typeof m.useSession.getState>)=>T=s=>s as T)=>select(m.useSession.getState()),m.useSession)}
})
import { GamePanel } from '../../src/game/GamePanel'
import { useGame, resetGame } from '../../src/game/store'
import { useSession } from '../../src/network/worldClient'
import { publicGame, type PublicGameKind } from '../fixtures/publicGame'
import { bridgeState } from '../fixtures/bridge'
import { ledgerState } from '../fixtures/ledger'
import { halliState } from '../fixtures/halligalli'
import alkkagiFlow from '../fixtures/alkkagi-forfeit.json'

const deadline=new Date(Date.now()+30000).toISOString()
const fixtures:Record<string,object>={
  omok:{gameCode:'OMOK',status:'PLAYING',boardSize:15,board:Array.from({length:15},()=>Array(15).fill(0)),blackUserId:'101',whiteUserId:'102',turnUserId:'101',turnDeadline:deadline,moveCount:0,lastMove:null},
  onecard:{gameCode:'ONE_CARD',status:'PLAYING',players:['101','102'].map(userId=>({userId,cardCount:7,active:true,oneCardUntil:null,oneCardStatus:'none'})),turnUserId:'101',turnDeadline:deadline,turnTimeLimitMs:30000,direction:1,stage:'PLAYING',topCard:{id:'clubs-K',suit:'clubs',rank:'K'},activeSuit:'clubs',drawCount:30,attackTotal:0,lastAttack:null,turnCount:8,winnerUserIds:[]},
  dice:{gameCode:'DICE',status:'PLAYING',players:['101','102'],scores:[100,200],targetScore:2000,turnUserId:'101',turnDeadline:deadline,turnTimeLimitMs:30000,turnScore:0,dice:[],stage:'AWAITING_ROLL',rollId:0,round:1,hotDice:false,lastEvent:'START'},
  bridge:bridgeState(2),ledger:ledgerState(2),halli:halliState(2),
  alkkagi:{...alkkagiFlow.initial.payload.publicState,gameId:'observer-test'},
}
beforeEach(()=>{
  resetGame()
  vi.stubGlobal('document',{hidden:false})
  vi.stubGlobal('innerWidth',1920);vi.stubGlobal('innerHeight',1080)
  useSession.setState({sessionId:'505',status:'connected',profiles:{'101':{userId:'101',nickname:'대산'} as never,'102':{userId:'102',nickname:'공원지기'} as never},tableId:'',watchedTableId:'table-1',roomId:'channel-1',bindings:[],pending:false,error:'',gameWatches:{},tables:[],tableStates:{}})
})
afterEach(()=>{resetGame();vi.unstubAllGlobals()})
for (const [field,state] of Object.entries(fixtures) as [PublicGameKind, object][]) {
  it(`${field} 관전자 HUD는 차례·관전 종료를 제공하고 참가자 전용 조작을 노출하지 않는다`,()=>{
    useGame.setState({game:{...publicGame(field,state,'SPECTATOR'),gameId:'observer-test'},watchedGameId:'observer-test',recovery:'RESTORED'})
    useSession.setState({tableStates:{'table-1':{gameId:'observer-test',betAmountPerPlayer:250} as never}})
    const html=renderToStaticMarkup(createElement(GamePanel))
    expect(html).toContain('게임 메뉴')
    expect(html).toContain('관전 종료')
    expect(html).toContain('aria-label="관전 경기 판돈"')
    expect(html).toContain('1인 250냥 × 2명')
    expect(html).toContain('차례')
    expect(html).not.toContain('>기권</button>')
    expect(html).not.toContain('>무르기</button>')
    expect(html).not.toContain('내 비책')
    expect(html).not.toContain('onecard-actions-panel')
    if(field==='onecard') expect(html).toContain('관전 중 · 공개 정보')
    if(field==='omok') expect(html).toContain('대산님 차례')
  })
}
