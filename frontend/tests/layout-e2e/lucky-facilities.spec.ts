import {test,expect} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

test('lucky mocks finish, close and fit mobile without calling a game or wallet API',async({page})=>{
  const errors:string[]=[],requests:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))requests.push(r.url())})
  await page.goto('/layout-preview.html')
  await expect(page.getByText('배치 준비 완료',{exact:true})).toBeVisible({timeout:90000})
  const out=process.env.QA_ARTIFACT_DIR??path.join(os.tmpdir(),'ontop-lucky-qa');await fs.mkdir(out,{recursive:true})
  for(const [no,name] of [['13','wheel-room'],['14','lottery-room'],['28','fish-shop']]){
    await page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:new RegExp('^'+no)}).click()
    await page.waitForTimeout(500);await page.screenshot({path:path.join(out,name+'.png')})
  }
  await page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:/^13/}).click()
  await page.getByRole('button',{name:'무료 목업 체험',exact:true}).click()
  const dialog=page.getByRole('dialog')
  await expect(dialog).toHaveAccessibleName('행운의 돌림판')
  await page.getByRole('button',{name:'무료로 돌려보기'}).click()
  await expect(page.getByRole('button',{name:'돌아가는 중…'})).toBeDisabled()
  await expect(page.getByRole('button',{name:'한 번 더 돌리기'})).toBeVisible({timeout:7000})
  const reported=Number(await dialog.locator('.lucky-result strong').innerText())
  const selected=await dialog.locator('.lucky-wheel').evaluate(el=>{
    const style=(el as HTMLElement).style.transform
    return Math.round(((360-Number(style.match(/rotate\((.+)deg\)/)![1])%360)%360)/18)%20
  })
  const values=[20,1,3,1,5,1,3,1,10,1,3,1,5,1,3,1,10,1,3,1]
  expect(reported).toBe(values[selected])
  await page.screenshot({path:path.join(out,'wheel-result.png')})
  await page.setViewportSize({width:390,height:844})
  const bounds=await dialog.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(844)
  await page.screenshot({path:path.join(out,'wheel-mobile.png')})
  await dialog.getByRole('button',{name:'시설 닫기'}).focus();await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button',{name:'한 번 더 돌리기'})).toBeFocused()
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible()
  await page.setViewportSize({width:1600,height:1000})
  await page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:/^14/}).click()
  await page.getByRole('button',{name:'무료 목업 체험',exact:true}).click()
  await page.getByRole('button',{name:'체험권 열어보기'}).click()
  await expect(dialog).toContainText('실제 당첨 아님')
  await page.screenshot({path:path.join(out,'lottery-result.png')})
  await page.getByRole('button',{name:'새 체험권 받기'}).click();await expect(dialog).toContainText('오늘의 행운을 열어보세요')
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible()
  await page.getByLabel('배치 시안 시설 목록').getByRole('button',{name:/^13/}).click()
  await page.getByRole('button',{name:'무료 목업 체험',exact:true}).click()
  await page.getByRole('button',{name:'무료로 돌려보기'}).click();await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(errors).toEqual([]);expect(requests).toEqual([])
})

test('the enlarged public fish shop clears the unchanged private cooking set',async({page})=>{
  await page.goto('/layout-preview.html');await expect(page.getByText('배치 준비 완료',{exact:true})).toBeVisible({timeout:90000})
  const visible=()=>page.evaluate(async()=>(await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).fishShopVisibility())
  expect(await visible()).toEqual({exterior:true,cart:false})
  await page.evaluate(async()=>{(await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).setFishCooking(true)})
  await expect.poll(visible).toEqual({exterior:false,cart:true})
  await page.evaluate(async()=>{(await import('/tests/layout-e2e/plazaStructureProbe.ts' as string)).setFishCooking(false)})
  await expect.poll(visible).toEqual({exterior:true,cart:false})
})
