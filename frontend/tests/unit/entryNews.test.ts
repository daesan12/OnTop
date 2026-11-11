import {describe,it,expect} from 'vitest'
import {koreanDay,suppressedToday,entryNewsSuppressionKey,parseEntryNews} from '../../src/features/announcements/entryNewsApi'
describe('entry news daily privacy and response contract',()=>{
 it('expires suppression at Korean midnight, independently per member',()=>{
  const storage={getItem:(key:string)=>key===entryNewsSuppressionKey('101')?'2026-11-10':null}
  expect(koreanDay(Date.parse('2026-11-10T14:59:59Z'))).toBe('2026-11-10')
  expect(suppressedToday('101',Date.parse('2026-11-10T14:59:59Z'),storage)).toBe(true)
  expect(suppressedToday('101',Date.parse('2026-11-10T15:00:00Z'),storage)).toBe(false)
  expect(suppressedToday('102',Date.parse('2026-11-10T14:59:59Z'),storage)).toBe(false)
 })
 it('allows park entry when browser storage is unavailable',()=>{expect(suppressedToday('101',0,{getItem:()=>{throw new Error('blocked')}})).toBe(false)})
 it('rejects malformed image metadata without trusting an arbitrary remote URL',()=>{
  expect(parseEntryNews([])).toEqual([])
  expect(()=>parseEntryNews([{id:'bad',title:'wrong',imageHash:'https://external.invalid'}])).toThrow('응답')
 })
})
