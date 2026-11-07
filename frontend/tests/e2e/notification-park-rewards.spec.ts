import { test, expect } from '@playwright/test'
import { writeFile, unlink } from 'node:fs/promises'
import { parkFixture } from '../park-integration/fixture'
const html='reward-park.local.html',script='src/reward-park.local.tsx'

test.beforeAll(async()=>{
  await writeFile(html,'<!doctype html><html lang="ko"><meta charset="utf-8"><div id="root"></div><script type="module" src="/src/reward-park.local.tsx"></script></html>',{flag:'wx'})
  await writeFile(script,`import React from 'react';import {createRoot} from 'react-dom/client';import {restoreAuthSession} from './auth/authFlow';import {ParkPage} from './park/ParkPage';
await restoreAuthSession(true);createRoot(document.getElementById('root')!).render(<ParkPage onExit={()=>{}} exitError="" onAuthEnded={()=>{}} onOperationBlocked={()=>{}}/>);`,{flag:'wx'})
})
test.afterAll(async()=>{await unlink(html);await unlink(script)})

/** 생성 공원의 실제 제품 화면. 인증/HTTP/WS만 대역이며 DB 검증과는 분리한다. */
test('공원 HUD에서 보상 알림을 열고 수령 후 권위 잔액을 다시 표시한다',async({page},info)=>{
  await parkFixture(page)
  let claimed=false,walletReads=0,extra=false
  await page.route(/\/api\/v1\/(notifications(?:\/.*)?|wallets\/me)(?:\?|$)/,async route=>{
    const path=new URL(route.request().url()).pathname
    if(path==='/api/v1/wallets/me'){walletReads++;return route.fulfill({json:{balance:claimed?1100:100,reservedBalance:0,availableBalance:claimed?1100:100}})}
    if(path.endsWith('/claim')){claimed=true;return route.fulfill({json:{notificationId:'14',kind:'COIN',amount:1000,claimedAt:'2026-11-07T09:01:00Z',balanceAfter:1100,ticketsAfter:null}})}
    return route.fulfill({json:{items:[{id:'14',type:'REWARD',title:'소중한 의견 감사합니다',createdAt:'2026-11-07T09:00:00Z',readAt:claimed?'2026-11-07T09:01:00Z':null,
      reward:{kind:'COIN',amount:1000,expiresAt:'2030-01-01T00:00:00Z',claimedAt:claimed?'2026-11-07T09:01:00Z':null}}],unreadCount:claimed?0:extra?2:1,nextCursor:null}})
  })
  await page.goto('/reward-park.local.html')
  await expect(page.getByLabel('공원 기본 화면',{exact:true})).toBeVisible({timeout:90000})
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
  await expect.poll(()=>page.evaluate(async()=>(await import('/src/network/worldClient.ts' as string)).useSession.getState().status)).toBe('connected')
  const launcher=page.locator('.inbox-launcher'),account=page.locator('.park-account__summary')
  for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:768,height:900},{width:623,height:377}]){
    await page.setViewportSize(viewport)
    await expect(launcher).toBeVisible()
    await launcher.click();await expect(page.getByRole('dialog',{name:'알림함',exact:true})).toBeVisible()
    await page.getByRole('button',{name:'알림함 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
    const a=await account.boundingBox(),b=await launcher.boundingBox()
    expect(b!.y).toBeGreaterThan(a!.y+a!.height)
    expect(Math.abs(b!.x+b!.width-a!.x-a!.width)).toBeLessThan(2)
    expect(await launcher.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(await account.evaluate(el=>getComputedStyle(el).backgroundColor))
  }
  await page.setViewportSize({width:1920,height:1080})
  extra=true;await page.evaluate(()=>window.dispatchEvent(new Event('ontop:notifications-changed')))
  await expect(page.getByText('새 알림',{exact:true})).toBeVisible()
  await page.screenshot({path:info.outputPath('reward-park-hud.png')})
  await page.getByRole('button',{name:/알림함/}).click()
  await expect(page.locator('.inbox-toast')).toHaveCount(0)
  const close=page.getByRole('button',{name:'알림함 닫기'})
  expect(await close.evaluate(el=>getComputedStyle(el).borderRadius)).toBe('50%')
  expect(await close.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(73, 54, 42)')
  const closeBox=await close.boundingBox(),frameBox=await page.getByRole('dialog',{name:'알림함',exact:true}).boundingBox()
  expect(closeBox!.y-frameBox!.y).toBeLessThan(20)
  await page.getByRole('dialog',{name:'알림함'}).evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished)))
  await page.screenshot({path:info.outputPath('reward-park-inbox.png')})
  const before=walletReads
  await page.getByRole('button',{name:'엽전 1,000냥 받기',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'보상 수령 완료'})).toBeVisible()
  await page.locator('.inbox-reward-popup').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)))
  const popup=await page.locator('.inbox-reward-popup').boundingBox(),title=await page.getByRole('heading',{name:'보상을 받았어요!'}).boundingBox()
  expect(title!.y).toBeGreaterThan(popup!.y+12)
  expect(await page.locator('.inbox-reward-popup').evaluate(el=>el.scrollTop)).toBe(0)
  await expect.poll(()=>walletReads).toBeGreaterThan(before)
  await page.screenshot({path:info.outputPath('reward-park-coin.png')})
})
