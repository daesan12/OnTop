import {expect,it} from 'vitest'
import {placeFloatingChats,type ChatRect} from '../../src/game/omok/chatPlacement'

const blocked:ChatRect[]=[
  {left:387,top:37,right:1043,bottom:694}, // rendered board
  {left:20,top:16,right:250,bottom:326},
  {left:20,top:437,right:250,bottom:711},
  {left:1180,top:496,right:1420,bottom:715},
]
const boxes=[{key:'a',slot:0,width:240,height:42},{key:'b',slot:1,width:240,height:125},{key:'c',slot:2,width:240,height:42}]
const overlap=(a:ChatRect,b:ChatRect)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top
it('scatters to both sides without clipping, covering the board/HUD or overlapping another message',()=>{
  const positions=[...placeFloatingChats(1440,731,boxes,blocked).values()]
  expect(positions).toHaveLength(3)
  expect(positions.some(r=>r.right<387)).toBe(true)
  expect(positions.some(r=>r.left>1043)).toBe(true)
  for(const r of positions){
    expect(r.left).toBeGreaterThanOrEqual(12);expect(r.top).toBeGreaterThanOrEqual(12)
    expect(r.right).toBeLessThanOrEqual(1428);expect(r.bottom).toBeLessThanOrEqual(719)
    expect(blocked.some(b=>overlap(r,b))).toBe(false)
  }
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)expect(overlap(positions[i]!,positions[j]!)).toBe(false)
})
it('varies by event but preserves visible positions when another chat expires',()=>{
  const first=placeFloatingChats(1440,731,boxes,blocked)
  const next=placeFloatingChats(1440,731,boxes.slice(1),blocked,first)
  expect(next.get('b')).toEqual(first.get('b'));expect(next.get('c')).toEqual(first.get('c'))
  expect(placeFloatingChats(1440,731,[{...boxes[0]!,key:'different-event'}],blocked).values().next().value).not.toEqual(first.get('a'))
})
it('relocates when a request card grows; crowded screens keep the transcript instead of drawing over controls',()=>{
  const first=placeFloatingChats(1440,731,boxes,blocked)
  const next=placeFloatingChats(1440,731,boxes,[...blocked,{left:0,top:326,right:387,bottom:437}],first)
  for(const r of next.values())expect(r.left).toBeGreaterThan(1043)
  expect(placeFloatingChats(390,844,boxes,[{left:0,top:0,right:390,bottom:844}]).size).toBe(0)
})
