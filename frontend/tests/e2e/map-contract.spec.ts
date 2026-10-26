import {expect,test} from '@playwright/test'
import {fixture,screenshot} from './contractFixture'
import {LIVE_MAP_IDENTITY} from '../../src/network/mapContract'

test('a different CONNECTED map blocks entry and offers refresh and deliberate reconnect',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  const server=await fixture(page,{connectedMap:{...LIVE_MAP_IDENTITY,schemaVersion:2,mapVersion:'a'.repeat(64)}})
  await page.goto('/park');await expect(page).toHaveTitle('OnTop')
  const notice=page.locator('.park-runtime-status')
  await expect(notice).toContainText('새로고침',{timeout:90000})
  await expect(notice.getByRole('button',{name:'페이지 새로고침',exact:true})).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
  expect(server.sent.filter(r=>['CHANNEL_JOIN','WORLD_MOVE','GAME_RECONNECT_CHECK'].includes(r.type))).toHaveLength(0)
  await screenshot(page,'map-contract-mismatch')
  await notice.getByRole('button',{name:'다시 연결',exact:true}).click()
  await expect.poll(()=>server.connections).toBe(2)
  await expect(notice).toContainText('새로고침')
  expect(server.sent.filter(r=>r.type==='CHANNEL_JOIN')).toHaveLength(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('an entry accepted under a matching map sends identity and stops after server rejection',async({page})=>{
  const server=await fixture(page,{connectedMap:{...LIVE_MAP_IDENTITY}})
  await page.goto('/park')
  await expect.poll(()=>server.sent.find(r=>r.type==='CHANNEL_JOIN')?.payload.map,{timeout:90000}).toEqual(LIVE_MAP_IDENTITY)
  server.mapMismatch({...LIVE_MAP_IDENTITY,mapVersion:'b'.repeat(64)})
  await expect(page.locator('.park-runtime-status')).toContainText('새로고침')
  const before=server.sent.filter(r=>r.type==='WORLD_MOVE').length
  await page.keyboard.press('KeyW')
  await expect.poll(()=>page.evaluate(async()=>{
    const {useSession}=await import('/src/network/worldClient.ts' as string)
    return useSession.getState().mapCompatible
  })).toBe(false)
  expect(server.sent.filter(r=>r.type==='WORLD_MOVE')).toHaveLength(before)
})
