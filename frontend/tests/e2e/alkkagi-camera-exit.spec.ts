import { expect, test } from '@playwright/test'
import { fixture } from './contractFixture'
import wire from '../fixtures/alkkagi-forfeit.json' with {type:'json'}
import {writeFile} from 'node:fs/promises'

// Server state is a fixture; camera, Three renderer and debris meshes are the actual park implementation.
test('알까기 기권 잔해의 빈 말 버퍼가 렌더링을 멈추지 않고 연출 후 시점이 복귀한다',async({page},info)=>{
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  await fixture(page,{omok:true,manualMovement:true})
  await page.goto('/park')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
  await expect.poll(()=>page.evaluate(async()=> (await import('/src/network/worldClient.ts' as string)).useSession.getState().status)).toBe('connected')
  const join=await page.evaluate(async()=>{
    const {parkRuntime}=await import('/src/park/runtime/runtime.ts' as string)
    const {useSession}=await import('/src/network/worldClient.ts' as string)
    const s=useSession.getState(),anchor=s.bindings.find((b:{channelId:string;anchorId:string})=>b.channelId===s.roomId)?.anchorId
    const ok=await parkRuntime.joinTable(anchor)
    return {ok,error:useSession.getState().error,anchor}
  })
  expect(join.ok,JSON.stringify(join)).toBe(true)
  await page.evaluate(async payload=>{
    const {useGame}=await import('/src/game/store.ts' as string)
    const {parseGame}=await import('/src/game/protocol.ts' as string)
    const {useSession}=await import('/src/network/worldClient.ts' as string)
    const g=parseGame(payload,'101'),s=useSession.getState(),t=s.tableStates[s.tableId]
    useSession.setState({tableStates:{...s.tableStates,[s.tableId]:{...t,gameCode:'ALKKAGI'}}})
    useGame.setState({game:g,permittedGameId:g.gameId,recovery:'RESTORED',lastResult:null,start:null,pending:false,uncertain:false})
  },wire.initial.payload)
  // sceneProbe imports the same R3F root used by the actual park.
  const sample=()=>page.evaluate(async()=> (await import('/tests/e2e/sceneProbe.ts' as string)).adCameraProbe())
  await expect(async()=>{expect((await sample()).direction[1]).toBeLessThan(-.99)}).toPass({timeout:30000})
  await page.screenshot({path:info.outputPath('before.png')})
  await page.evaluate(async()=>{
    const {useGame}=await import('/src/game/store.ts' as string),s=useGame.getState(),g=s.game!
    useGame.setState({game:{...g,alkkagi:{...g.alkkagi,status:'FINISHED',stage:'FINISHED'}}})
    const {useParkDebris}=await import('/src/features/parkDebris/state.ts' as string)
    const {useSession}=await import('/src/network/worldClient.ts' as string),w=useSession.getState()
    useParkDebris.setState({channelId:w.roomId,version:1,items:[{id:'trace-defeat',gameId:g.gameId,
      tableId:w.tableId,anchorId:w.bindings.find((b:{tableId:string;anchorId:string})=>b.tableId===w.tableId)!.anchorId,gameCode:'ALKKAGI',
      userId:'101',occurredAt:new Date().toISOString(),throwYaw:0,seed:1,parts:['board','coin-0']}]})
  })
  const trace=await page.evaluate(async()=>{
    const {adCameraProbe}=await import('/tests/e2e/sceneProbe.ts' as string)
    const start=performance.now(),frames:{ms:number;camera:number[];direction:number[]}[]=[]
    return await new Promise<typeof frames>(resolve=>{
      const frame=()=>{
        frames.push({ms:performance.now()-start,...adCameraProbe()})
        if(performance.now()-start>=4000)resolve(frames)
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
  })
  await info.attach('camera-trace',{body:JSON.stringify(trace,null,2),contentType:'application/json'})
  await writeFile(info.outputPath('camera-trace.json'),JSON.stringify(trace,null,2))
  await page.screenshot({path:info.outputPath('after.png')})
  expect(trace.at(-1)!.direction[1]).toBeGreaterThan(-.9)
  const tail=trace.filter(x=>x.ms>2500)
  expect(tail.length).toBeGreaterThan(5)
  const maxAngularSpeed=Math.max(...tail.slice(1).map((x,i)=>{
    const angle=Math.acos(Math.max(-1,Math.min(1,x.direction.reduce((sum,n,j)=>sum+n*tail[i]!.direction[j]!,0))))
    return angle/((x.ms-tail[i]!.ms)/1000)
  }))
  // Normal exp(-7t) return remains continuous; an instantaneous lookAt produces a one-frame spike.
  expect(maxAngularSpeed).toBeLessThan(20)
  expect(errors).toEqual([])
})
