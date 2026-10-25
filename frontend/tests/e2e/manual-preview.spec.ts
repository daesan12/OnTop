import { test,expect } from '@playwright/test'
import { fixture,tableId,screenshot } from './contractFixture'
test('M15 spectator F1 preserves public role, camera and private-state boundaries',async({page})=>{
  const server=await fixture(page,{omok:true,m09:true})
  await page.goto('/park');await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
  await page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).inspectTable())
  await expect(page.getByRole('dialog',{name:'테이블 정보',exact:true})).toBeVisible()
  await page.evaluate(async id=>(await import('/tests/e2e/sceneProbe.ts' as string)).previewPublicMatch({channelId:'fixture-channel',tableId:id,gameId:'fixture-confirmed-omok'}),tableId)
  await page.getByRole('button',{name:'미리보기 경기 참조 확인',exact:true}).click()
  await page.getByRole('button',{name:'경기 관전',exact:true}).click()
  const panel=page.getByRole('region',{name:'오목 경기',exact:true})
  await expect(panel).toContainText('오목 관전')
  await expect.poll(()=>page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).tablePresentationProbe().omokCamera.ready)).toBe(true)
  const before=await page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).tablePresentationProbe())
  await page.keyboard.press('F1');await expect(page.locator('.game-manual')).toHaveAttribute('data-phase','open')
  await expect(page.getByRole('dialog',{name:'게임 설명서',exact:true}).getByRole('heading',{name:'오목',exact:true,level:3})).toBeVisible()
  await page.keyboard.press('KeyE');await page.keyboard.press('Space');await page.keyboard.press('KeyW')
  await page.keyboard.press('Escape');await expect(page.locator('.game-manual[open]')).toHaveCount(0)
  const after=await page.evaluate(async()=>(await import('/tests/e2e/sceneProbe.ts' as string)).tablePresentationProbe())
  const {camera:beforeCamera,...beforeState}=before
  const {camera:afterCamera,...afterState}=after
  expect(afterState).toEqual(beforeState)
  afterCamera.forEach((value:number,index:number)=>expect(value).toBeCloseTo(beforeCamera[index]!,3))
  await expect(panel.getByRole('button',{name:'8행 8열 빈칸',exact:true})).toBeDisabled()
  expect(server.sent.some(m=>m.type==='GAME_ACTION_SEND')).toBe(false)
  await screenshot(page,'m15-spectator-restored')
  await panel.getByRole('button',{name:'관전 종료',exact:true}).click();await expect(panel).toHaveCount(0)
})
