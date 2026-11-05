import { describe, expect, it } from 'vitest'
import { gameTurnCue, TurnNoticeMemory, sharedTurnNoticeMemory } from '../../src/game/turnNotice'
import { resetGame } from '../../src/game/store'
import { publicGame, type PublicGameKind } from '../fixtures/publicGame'
import { bridgeState } from '../fixtures/bridge'
import { ledgerState } from '../fixtures/ledger'
import { halliState } from '../fixtures/halligalli'

const now = Date.parse('2026-11-04T00:00:00Z'), deadline = new Date(now + 30000).toISOString()
const names = {'101':{nickname:'대산'},'102':{nickname:'공원지기'}}
const game = publicGame
const onePlayers = ['101','102'].map(userId => ({ userId, active: true, cardCount: 7, oneCardUntil: null, oneCardStatus: 'none' as const }))
const states = {
  omok:{status:'PLAYING',turnUserId:'101',turnDeadline:deadline,moveCount:2},
  onecard:{status:'PLAYING',turnUserId:'101',turnDeadline:deadline,turnCount:8,players:onePlayers},
  dice:{status:'PLAYING',turnUserId:'101',turnDeadline:deadline},
  bridge:bridgeState(2),ledger:ledgerState(2),
}

describe('서버 공개 차례의 참가자/관전자 안내',()=>{
  for (const [field,state] of Object.entries(states) as [PublicGameKind, object][]) {
    it(`${field}: 참가자만 내 차례, 상대/관전은 관점에 맞게 표시`,()=>{
      expect(gameTurnCue(game(field,state),'101',names,now)).toMatchObject({own:true,text:'내 차례!'})
      expect(gameTurnCue(game(field,state),'102',names,now)).toMatchObject({own:false,text:'상대 차례'})
      // A spectator role never receives a personal cue, even if the viewer ID equals the current actor.
      expect(gameTurnCue(game(field,state,'SPECTATOR'),'101',names,now)).toMatchObject({own:false,text:'대산님 차례'})
      expect(gameTurnCue(game(field,{...state,status:'FINISHED'}),'101',names,now)).toBeNull()
    })
  }
  it('다리 판단자는 선언자와 구분하며 비밀 눈을 참조하지 않는다',()=>{
    const g=game('bridge',{...states.bridge,stage:'RESPONDING',responderUserId:'102'})
    expect(gameTurnCue(g,'102',names,now)).toMatchObject({own:true,text:'내 판단 차례!'})
    expect(gameTurnCue({...g,role:'SPECTATOR'},'505',names,now)?.text).toBe('공원지기님 판단 차례')
    expect(gameTurnCue(game('bridge',{...states.bridge,stage:'RESOLVING'}),'101',names,now)).toBeNull()
  })
  it('동전·카드 배분 중에는 일반 차례를 재생하지 않는다',()=>{
    expect(gameTurnCue(game('omok',{...states.omok,turnDeadline:new Date(now-1).toISOString()}),'101',names,now)).toBeNull()
    expect(gameTurnCue(game('omok',{...states.omok,coinTossEndsAt:deadline}),'101',names,now)).toBeNull()
    expect(gameTurnCue(game('onecard',{...states.onecard,dealEndsAt:deadline,turnCount:1,players:onePlayers}),'101',names,now)).toBeNull()
    expect(gameTurnCue(null,'101',names,now)).toBeNull()
  })
  it('과일 땡은 빠른 연속 공개·종 결과·관전자 입장에도 중앙 차례 알림을 만들지 않는다',()=>{
    for(let flipSeq=0;flipSeq<100;flipSeq++) {
      const h=halliState(2,{flipSeq,turnUserId:flipSeq%2?'101':'102'})
      expect(gameTurnCue(game('halli',h),'101',names,now+flipSeq*100)).toBeNull()
      expect(gameTurnCue(game('halli',h,'SPECTATOR'),'505',names,now+flipSeq*100)).toBeNull()
    }
    expect(gameTurnCue(game('halli',halliState(2,{resultUntil:deadline})),'101',names,now)).toBeNull()
    expect(gameTurnCue(game('halli',halliState(2,{turnUserId:null})),'101',names,now)).toBeNull()
  })
  it('버전·굴림·공개 상태 재확인은 재생하지 않고 실제 다음 차례만 재생한다',()=>{
    const g=game('ledger',states.ledger),memory=new TurnNoticeMemory()
    const first=gameTurnCue(g,'101',names,now)!
    expect(memory.consume(first)).toBe(true)
    expect(memory.consume(gameTurnCue({...g,version:99},'101',names,now)!)).toBe(false)
    expect(memory.consume(first)).toBe(false) // reconnect to the same public turn
    const next=gameTurnCue(game('ledger',{...states.ledger,turnUserId:'102',turnId:2}),'101',names,now)!
    expect(memory.consume(next)).toBe(true)
    expect(memory.consume({...next,key:next.key.replace('turn-test','next-match')})).toBe(true)
  })
  it('다리 굴리기→선언, 원카드 무늬 선택은 같은 차례 알림을 중복 생성하지 않는다',()=>{
    const bridge=gameTurnCue(game('bridge',states.bridge),'101',names,now)!
    expect(gameTurnCue(game('bridge',{...states.bridge,stage:'DECLARING'}),'101',names,now)?.key).toBe(bridge.key)
    const one=gameTurnCue(game('onecard',states.onecard),'101',names,now)!
    expect(gameTurnCue(game('onecard',{...states.onecard,stage:'CHOOSE_SUIT'}),'101',names,now)?.key).toBe(one.key)
  })
  it('재접속 resetGame으로 HUD를 제거해도 동일 차례의 재생 기록을 보존한다',()=>{
    const cue=gameTurnCue({...game('ledger',states.ledger),gameId:'reconnect-lifecycle'},'101',names,now)!
    expect(sharedTurnNoticeMemory.consume(cue)).toBe(true)
    resetGame()
    expect(sharedTurnNoticeMemory.consume({...cue})).toBe(false)
  })
})
