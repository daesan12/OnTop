import {test,expect} from '@playwright/test'
import {parkFixture} from './fixture'
import {screenshot} from '../e2e/contractFixture'
import bindings from '../../public/park-bindings.generated.frontend-test.json' with {type:'json'}
import developmentBindings from '../../public/park-bindings.generated.dev.json' with {type:'json'}

test('emote notices and rejected requests disappear within three seconds without another action',async({page})=>{
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 const server=await parkFixture(page)
 await page.route('**/park-bindings.generated.frontend-test.json',route=>route.fulfill({
  json:{...bindings,emotes:developmentBindings.emotes},
 }))
 await page.goto('/park');await expect(page).toHaveTitle('OnTop')
 await expect.poll(()=>page.evaluate(async()=>(await import('/tests/park-integration/probe.ts' as string)).sceneReady()),{timeout:90000}).toBe(true)
 await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
 const feedback=page.locator('.emotes .emote-feedback')
 const notice='감정표현이 취소되었습니다. 멈춘 뒤 다른 감정표현을 사용할 수 있어요.'
 // Reproduce the reported retained presentation; current cancellation already clears its state.
 await page.evaluate(async(notice)=>(await import('/src/features/emotes/state.ts' as string)).useEmoteState.setState({notice}),notice)
 await expect(feedback).toHaveText(notice)
 await screenshot(page,'emote-notice-visible')
 await expect(feedback).toBeHidden({timeout:2700})
 await screenshot(page,'emote-notice-expired')

 // The actual UI and WS rejection must use the same expiry, without a mock playback fallback.
 await page.getByRole('button',{name:'감정표현 열기',exact:true}).click()
 const wave=page.getByRole('dialog',{name:'감정표현 선택',exact:true}).getByRole('button',{name:'손 인사',exact:true})
 await expect(wave).toBeEnabled();await wave.click()
 await expect.poll(()=>server.requests.filter(request=>request.type==='WORLD_EMOTE_SEND').length).toBe(1)
 await expect(feedback).toContainText('감정표현 응답을 기다리고 있어요')
 const request=server.requests.find(request=>request.type==='WORLD_EMOTE_SEND')!
 server.emit('ERROR',{code:'EMOTE_NOT_SUPPORTED',message:'등록되지 않은 감정표현입니다.'},request.requestId)
 await expect(feedback).toHaveText('등록되지 않은 감정표현입니다.')
 await expect(feedback).toBeHidden({timeout:2700})
 expect(await page.evaluate(async()=>{
  const state=(await import('/src/features/emotes/state.ts' as string)).useEmoteState.getState()
  return {pending:state.pending,readyAt:state.readyAt,error:state.error,notice:state.notice}
 })).toEqual({pending:false,readyAt:0,error:'',notice:''})
 expect(server.requests.filter(request=>request.type==='WORLD_EMOTE_SEND')).toHaveLength(1)
 await expect(page.locator('vite-error-overlay')).toHaveCount(0)
 expect(errors).toEqual([])
})
