import { expect,it,vi,afterEach } from 'vitest'
import { createRoutePlanner } from '../../src/features/navigation/routePlanner'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
const port=()=>({onmessage:null as Worker['onmessage'],onerror:null as Worker['onerror'],postMessage:vi.fn(),terminate:vi.fn()})
it('keeps search off-thread, snapshots renderer points and ignores unknown request IDs',async()=>{
  const worker=port(), planner=createRoutePlanner(()=>worker),start={x:0,z:34}
  const result=planner.plan(start,{x:10,z:20});start.x=100
  expect(worker.postMessage.mock.calls[0]![0]).toMatchObject({id:1,start:{x:0,z:34},mapVersion:EXPECTED_MAP_VERSION})
  worker.onmessage?.call(worker as unknown as Worker,{data:{id:900,path:null,mapVersion:EXPECTED_MAP_VERSION}} as MessageEvent)
  worker.onmessage?.call(worker as unknown as Worker,{data:{id:1,path:[{x:0,z:34},{x:10,z:20}],durationMs:200,mapVersion:EXPECTED_MAP_VERSION}} as MessageEvent)
  await expect(result).resolves.toMatchObject({durationMs:200,path:[{x:0,z:34},{x:10,z:20}]})
  planner.dispose();expect(worker.terminate).toHaveBeenCalledOnce()
})
it('cancelled account/destination work rejects and a late reply cannot restore it',async()=>{
  const worker=port(),planner=createRoutePlanner(()=>worker),pending=planner.plan({x:0,z:34},{x:10,z:20})
  const rejected=expect(pending).rejects.toThrow('취소')
  const oldHandler=worker.onmessage;planner.dispose()
  oldHandler?.call(worker as unknown as Worker,{data:{id:1,path:[{x:10,z:20}],mapVersion:EXPECTED_MAP_VERSION}} as MessageEvent)
  await rejected;await expect(planner.plan({x:0,z:0},{x:1,z:1})).rejects.toThrow('종료')
})
it('bounds loading/search time and never substitutes a fabricated route',async()=>{
  vi.useFakeTimers()
  const worker=port(),planner=createRoutePlanner(()=>worker),pending=planner.plan({x:0,z:34},{x:10,z:20})
  const rejected=expect(pending).rejects.toThrow('초과')
  await vi.advanceTimersByTimeAsync(5000);await rejected;expect(worker.terminate).toHaveBeenCalledOnce()
})
it('rejects mismatched versions and reports worker startup failure',async()=>{
  const worker=port(),planner=createRoutePlanner(()=>worker),pending=planner.plan({x:0,z:34},{x:10,z:20})
  worker.onmessage?.call(worker as unknown as Worker,{data:{id:1,path:[{x:10,z:20}],mapVersion:'other-map'}} as MessageEvent)
  await expect(pending).rejects.toThrow('준비');planner.dispose()
  await expect(createRoutePlanner(()=>{throw Error('chunk unavailable')}).plan({x:0,z:0},{x:1,z:1})).rejects.toThrow('준비')
})
afterEach(()=>vi.useRealTimers())
