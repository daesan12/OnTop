import { describe, expect, it } from 'vitest'
import { editTiles } from '../../src/game/rummikub/edit'
import { layoutMelds, tileDropTarget } from '../../src/game/rummikub/layout'
import { physical, validMeld, type Placed, type Rummikub } from '../../src/game/rummikub/protocol'

const tile = (color: Placed['color'],number: number): Placed => ({id:`${color}-${number}-0`,color,number})
const state = (melds: Placed[][],registered = true) => ({melds,players:[{userId:'101',registered}]} as Rummikub)
const joker = {color:'RED' as const,number:1}
describe('수패마루 드래그 초안',()=>{
  it('새 조합과 기존 런의 양쪽 붙이기는 타일을 중복하지 않고 오름차순으로 보존한다',()=>{
    const hand=[tile('BLUE',3),tile('BLUE',4),tile('BLUE',5),tile('BLUE',6)]
    const s=state([],false)
    const first=editTiles(s,[],hand,'101',hand.slice(1).map(t=>t.id),{kind:'new'},joker).melds
    const next=editTiles(s,first,hand,'101',[hand[0]!.id],{kind:'meld',index:0},joker).melds
    expect(next[0]!.map(t=>t.number)).toEqual([3,4,5,6])
    expect(validMeld(next[0]!)).toBe(true)
    expect(hand).toHaveLength(4)
  })
  it('등록 이후 기존 타일을 쪼개 새 런과 그룹으로 재조합한다',()=>{
    const original=[[tile('RED',8),tile('BLACK',8),tile('BLUE',8)]]
    const hand=[tile('RED',7),tile('RED',9),tile('YELLOW',8)]
    const s=state(original)
    const split=editTiles(s,original,hand,'101',['RED-8-0','RED-7-0','RED-9-0'],{kind:'new'},joker).melds
    expect(split.map(m=>m.length)).toEqual([2,3])
    const next=editTiles(s,split,hand,'101',['YELLOW-8-0'],{kind:'meld',index:0},joker).melds
    expect(next.every(validMeld)).toBe(true)
    expect(new Set(next.flat().map(t=>t.id)).size).toBe(6)
  })
  it('최초 등록 턴에는 공개 타일을 옮기거나 기존 조합에 붙일 수 없다',()=>{
    const original=[[tile('RED',10),tile('BLACK',10),tile('BLUE',10)]], s=state(original,false)
    const hand=[tile('YELLOW',10)]
    expect(editTiles(s,original,hand,'101',['RED-10-0'],{kind:'new'},joker).melds).toBe(original)
    expect(editTiles(s,original,hand,'101',['YELLOW-10-0'],{kind:'meld',index:0},joker).melds).toBe(original)
  })
  it('받침대에는 이번 턴에 낸 자기 타일만 돌려놓고 공개 조커는 남긴다',()=>{
    const original=[[tile('RED',10),tile('BLACK',10),{id:'JOKER-0',color:'BLUE' as const,number:10}]], s=state(original)
    const hand=[tile('YELLOW',10)], draft=[[...original[0]!,...hand]]
    expect(editTiles(s,draft,hand,'101',['JOKER-0'],{kind:'rack'},joker).melds).toBe(draft)
    expect(editTiles(s,draft,hand,'101',['YELLOW-10-0'],{kind:'rack'},joker).melds).toEqual(original)
    expect(editTiles(s,draft,hand,'101',['RED-1-0'],{kind:'new'},joker).melds).toBe(draft)
  })
  it('조커를 그룹에 내려놓으면 유효한 역할을 찾고 정확한 숫자패로 교체해도 조커를 테이블에 유지한다',()=>{
    const hand=[tile('RED',10),tile('BLUE',10),physical('JOKER-0')!,tile('BLACK',10)]
    const draft=[[tile('RED',10),tile('BLUE',10)]], s=state([],false)
    const initial=editTiles(s,draft,hand,'101',['JOKER-0'],{kind:'meld',index:0},joker,true).melds
    expect(initial[0]!.find(t=>t.id==='JOKER-0')).toMatchObject({color:'BLACK',number:10})
    const registered=state(initial)
    const swapped=editTiles(registered,initial,[tile('BLACK',10)],'101',['BLACK-10-0'],{kind:'meld',index:0,replace:'JOKER-0'},joker,true).melds
    expect(swapped[0]!.some(t=>t.id==='JOKER-0')).toBe(false)
    expect(swapped[1]).toEqual([{id:'JOKER-0',color:'BLACK',number:10}])
    expect(swapped.every(validMeld)).toBe(false)
    const reused=editTiles(state(initial),[...swapped,[tile('YELLOW',4),tile('YELLOW',6)]],[], '101',['JOKER-0'],{kind:'meld',index:2},joker,true).melds
    expect(reused.every(validMeld)).toBe(true)
    expect(reused[1]!.map(t=>t.number)).toEqual([4,5,6])
  })
  it('보이는 조합과 받침대에만 스냅하고 테이블 밖에는 놓지 않는다',()=>{
    const melds=[[tile('RED',4),tile('RED',5),tile('RED',6)]]
    const layout=layoutMelds([3]),center=layout.positions[0]!
    expect(tileDropTarget(melds,14,center.x*layout.scale,layout.originZ)?.destination).toMatchObject({kind:'meld',index:0,replace:'RED-5-0'})
    expect(tileDropTarget(melds,14,0,.6)?.destination.kind).toBe('rack')
    expect(tileDropTarget(melds,14,.8,-.15)?.destination.kind).toBe('new')
    expect(tileDropTarget(melds,14,2,-.3)).toBeNull()
    expect(tileDropTarget(melds,14,0,-2)).toBeNull()
  })
})
