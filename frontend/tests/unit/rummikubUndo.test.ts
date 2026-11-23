import { beforeEach, describe, expect, it } from 'vitest'
import { cancelRummikubDraft, changeRummikubDraft, recallRummikubTiles, syncRummikubDraft, undoRummikubDraft, useRummikubDraft } from '../../src/game/rummikub/draft'
import { editTiles } from '../../src/game/rummikub/edit'
import { physical, type Placed, type Rummikub } from '../../src/game/rummikub/protocol'

const tile=(id:string)=>physical(id)! as Placed
const board=()=>[[tile('BLUE-4-0'),tile('BLUE-5-0'),tile('BLUE-6-0')]]
const state=(melds=board())=>({melds,turnDeadline:'2099-01-01T00:00:00Z',players:[{userId:'101',registered:true}]} as Rummikub)
beforeEach(()=>useRummikubDraft.setState({source:null,draft:null,selected:[],history:[],sort:'color',jokerColor:'RED',jokerNumber:1,hint:''}))

describe('수패마루 단계별 되돌리기',()=>{
  it('여러 이동을 역순으로 복원하고 서버 판·손패·제한 시간은 바꾸지 않는다',()=>{
    const s=state(),hand=[tile('BLUE-3-0'),tile('BLUE-7-0')]
    syncRummikubDraft(s)
    for(const t of hand){const ui=useRummikubDraft.getState();const result=editTiles(s,ui.draft!,hand,'101',[t.id],{kind:'meld',index:0},{color:'RED',number:1});changeRummikubDraft(s,result.melds,'이동')}
    expect(useRummikubDraft.getState().draft![0]!.map(t=>t.number)).toEqual([3,4,5,6,7])
    expect(undoRummikubDraft(s)).toBe(true)
    expect(useRummikubDraft.getState().draft![0]!.map(t=>t.number)).toEqual([3,4,5,6])
    expect(undoRummikubDraft(s)).toBe(true)
    expect(useRummikubDraft.getState().draft).toEqual(s.melds)
    expect(undoRummikubDraft(s)).toBe(false)
    expect(s.melds).toEqual(board())
    expect(hand.map(t=>t.number)).toEqual([3,7])
    expect(s.turnDeadline).toBe('2099-01-01T00:00:00Z')
  })
  it('다중 선택 이동은 한 번에 되돌리고 색상 정렬과 선택은 별도 이동으로 기록하지 않는다',()=>{
    const s=state(),hand=['RED-7-0','BLUE-7-0','BLACK-7-0'].map(tile)
    syncRummikubDraft(s)
    useRummikubDraft.setState({selected:hand.map(t=>t.id),sort:'number'})
    const result=editTiles(s,s.melds,hand,'101',hand.map(t=>t.id),{kind:'new'},{color:'RED',number:1})
    changeRummikubDraft(s,result.melds,'함께 이동')
    expect(useRummikubDraft.getState().history).toHaveLength(1)
    useRummikubDraft.setState({selected:[],hint:'안내만 변경',sort:'color'})
    expect(undoRummikubDraft(s)).toBe(true)
    expect(useRummikubDraft.getState()).toMatchObject({draft:s.melds,selected:hand.map(t=>t.id),sort:'color',history:[]})
  })
  it('조커 교체를 되돌리면 원래 조합과 조커 역할을 타일 중복 없이 복원한다',()=>{
    const original=[[tile('RED-10-0'),tile('BLUE-10-0'),{id:'JOKER-0',color:'YELLOW' as const,number:10}]],s=state(original)
    const hand=[tile('YELLOW-10-0')]
    syncRummikubDraft(s)
    const result=editTiles(s,s.melds,hand,'101',['YELLOW-10-0'],{kind:'meld',index:0,replace:'JOKER-0'},{color:'RED',number:7})
    changeRummikubDraft(s,result.melds,'조커 교체')
    expect(useRummikubDraft.getState().draft).toHaveLength(2)
    expect(undoRummikubDraft(s)).toBe(true)
    expect(useRummikubDraft.getState().draft).toEqual(original)
    expect(useRummikubDraft.getState().draft!.flat().filter(t=>t.id==='JOKER-0')).toHaveLength(1)
  })
  it('B 회수와 R 전체 취소도 각각 한 단계로 복구할 수 있다',()=>{
    const s=state(),hand=[tile('BLUE-3-0')],placed=[[hand[0]!,...s.melds[0]!]]
    syncRummikubDraft(s);changeRummikubDraft(s,placed,'내기')
    useRummikubDraft.setState({selected:['BLUE-3-0']})
    expect(recallRummikubTiles(s,hand,'101')).toBe(true)
    expect(useRummikubDraft.getState().draft).toEqual(s.melds)
    expect(undoRummikubDraft(s)).toBe(true)
    expect(useRummikubDraft.getState()).toMatchObject({draft:placed,selected:['BLUE-3-0']})
    expect(cancelRummikubDraft(s)).toBe(true)
    expect(undoRummikubDraft(s)).toBe(true)
    expect(useRummikubDraft.getState().draft).toEqual(placed)
    expect(undoRummikubDraft(s)).toBe(true)
    expect(useRummikubDraft.getState().draft).toEqual(s.melds)
  })
  it('실패하거나 실제 배치가 변하지 않은 동작은 기록하지 않는다',()=>{
    const s=state();syncRummikubDraft(s)
    const rejected=editTiles(s,s.melds,[],'101',['BLUE-4-0'],{kind:'rack'},{color:'RED',number:1})
    expect(changeRummikubDraft(s,rejected.melds,rejected.message)).toBe(false)
    expect(changeRummikubDraft(s,s.melds.map(m=>[...m]),'같은 위치')).toBe(false)
    expect(useRummikubDraft.getState().history).toEqual([])
    expect(undoRummikubDraft(s)).toBe(false)
  })
  it('턴 확정·새 서버 상태에는 기록을 비우고 이전 상태로 접근해도 현재 판을 바꾸지 않는다',()=>{
    const s=state();syncRummikubDraft(s);changeRummikubDraft(s,[],'편집')
    syncRummikubDraft(s)
    expect(useRummikubDraft.getState().history).toHaveLength(1)
    const next=state();syncRummikubDraft(next)
    const before=useRummikubDraft.getState()
    expect(before.history).toEqual([])
    expect(undoRummikubDraft(s)).toBe(false)
    expect(changeRummikubDraft(s,[],'오래된 편집')).toBe(false)
    expect(useRummikubDraft.getState()).toBe(before)
    expect(undoRummikubDraft(next)).toBe(false)
  })
  it('후보 판의 외부 변경이 기록을 훼손하지 않고 최근 100단계만 보관한다',()=>{
    const s=state();syncRummikubDraft(s)
    const candidate=board();candidate[0]!.push(tile('BLUE-7-0'));changeRummikubDraft(s,candidate,'이동')
    candidate[0]![0]!.number=13
    expect(useRummikubDraft.getState().draft![0]![0]!.number).toBe(4)
    for(let i=0;i<105;i++)changeRummikubDraft(s,i%2 ? board() : [],'반복')
    expect(useRummikubDraft.getState().history).toHaveLength(100)
    for(let i=0;i<100;i++)expect(undoRummikubDraft(s)).toBe(true)
    expect(undoRummikubDraft(s)).toBe(false)
    expect(s.melds).toEqual(board())
  })
})
