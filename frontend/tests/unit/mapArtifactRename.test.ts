import {afterEach,describe,expect,it,vi} from 'vitest'
import {renameArtifact} from '../../scripts/map/write-artifacts'

afterEach(()=>vi.useRealTimers())
describe('map artifact replacement under Windows file sharing',()=>{
 it('recovers a temporary file lock while retaining the same source and destination',async()=>{
  vi.useFakeTimers()
  const lock=Object.assign(new Error('sharing lock'),{code:'EPERM'})
  const replace=vi.fn().mockRejectedValueOnce(lock).mockRejectedValueOnce(lock).mockResolvedValue(undefined)
  const pending=renameArtifact('new.tmp','last-good.json',replace)
  await vi.runAllTimersAsync();await pending
  expect(replace.mock.calls).toEqual(Array.from({length:3},()=>['new.tmp','last-good.json']))
 })
 it('limits persistent permission failures and preserves their original cause',async()=>{
  vi.useFakeTimers()
  const lock=Object.assign(new Error('permanent lock'),{code:'EACCES'}),replace=vi.fn().mockRejectedValue(lock)
  const rejected=expect(renameArtifact('new.tmp','last-good.json',replace)).rejects.toBe(lock)
  await vi.runAllTimersAsync();await rejected
  expect(replace).toHaveBeenCalledTimes(5)
 })
 it('does not retry unrelated filesystem errors',async()=>{
  const failure=Object.assign(new Error('source missing'),{code:'ENOENT'}),replace=vi.fn().mockRejectedValue(failure)
  await expect(renameArtifact('new.tmp','last-good.json',replace)).rejects.toBe(failure)
  expect(replace).toHaveBeenCalledOnce()
 })
})
