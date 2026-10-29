import { expect, it } from 'vitest'
import { visibleBoardNotes } from '../../src/world/art/notesBoardLayout'
import { createMemoPaperArt, notesBoardArt } from '../../src/world/art/notesBoardGeometry'
import { wrapMemoText } from '../../src/world/art/memoText'

it('has no example papers and selects only the six newest acknowledged rows without mutating them',()=>{
  expect(visibleBoardNotes([])).toEqual([])
  expect(notesBoardArt.near.paint).toBeUndefined()
  expect(notesBoardArt.far.paint).toBeUndefined()
  const rows=Array.from({length:9},(_,i)=>({id:String(i+1),text:'실제 사용자 메모 '+i,createdAt:i}))
  const before=JSON.stringify(rows)
  expect(visibleBoardNotes(rows).map(n=>n.id)).toEqual(['9','8','7','6','5','4'])
  expect(JSON.stringify(rows)).toBe(before)
  expect(visibleBoardNotes([{id:'9',text:'아홉',createdAt:1},{id:'10',text:'열',createdAt:1}]).map(n=>n.id)).toEqual(['10','9'])
})
it('builds zero sheets for an empty board and caps both paper LODs at six sheets',()=>{
  const empty=createMemoPaperArt(0),six=createMemoPaperArt(6),many=createMemoPaperArt(120)
  expect(Object.keys(empty.near)).toEqual([]);expect(Object.keys(empty.far)).toEqual([])
  for(const lod of ['near','far'] as const){
    expect(six[lod].paint!.getAttribute('position').count).toBe(many[lod].paint!.getAttribute('position').count)
    for(const model of [six[lod],many[lod]])for(const g of Object.values(model))g.dispose()
  }
})
it('wraps Hangul, explicit newlines and whole emoji without horizontal compression or broken graphemes',()=>{
  const measure=(s:string)=>[...new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(s)].length
  expect(wrapMemoText('가나다라마바사',measure,3)).toEqual(['가나다','라마바','사'])
  expect(wrapMemoText('첫줄\r\n둘째줄',measure,10)).toEqual(['첫줄','둘째줄'])
  const family='👨‍👩‍👧‍👦'
  expect(wrapMemoText('가'+family+'나다',measure,2)).toEqual(['가'+family,'나다'])
  const lines=wrapMemoText('가'.repeat(300),measure,4)
  expect(lines).toHaveLength(5);expect(lines[4]).toBe('가가가…');expect(lines.every(l=>measure(l)<=4)).toBe(true)
})
