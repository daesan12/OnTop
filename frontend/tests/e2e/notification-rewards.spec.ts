import { test, expect, type Page } from '@playwright/test'
import { writeFile, unlink } from 'node:fs/promises'
const html='reward-harness.local.html', script='src/reward-harness.local.tsx'

test.beforeAll(async()=>{
  await writeFile(html,'<!doctype html><html lang="ko"><meta charset="utf-8"><div id="root"></div><script type="module" src="/src/reward-harness.local.tsx"></script></html>',{flag:'wx'})
  await writeFile(script,`import React from 'react';import {createRoot} from 'react-dom/client';
import {restoreAuthSession} from './auth/authFlow';import {NotificationCenter} from './features/notifications/NotificationCenter';import {AdminRewardGrantForm} from './features/notifications/AdminRewardGrantForm';import './features/feedback/adminFeedback.css';
await restoreAuthSession(true);document.body.style.cssText='margin:0;background:linear-gradient(135deg,#273d31,#617654);min-height:100vh';
const admin=new URLSearchParams(location.search).has('admin');createRoot(document.getElementById('root')!).render(<main className={admin?'admin-feedback-page':'park-page'}><small>로컬 검수 · 실제 컴포넌트 / 인증·REST 대역</small>{admin?<AdminRewardGrantForm onAuthEnded={()=>{}}/>:<NotificationCenter/>}</main>);`,{flag:'wx'})
})
test.afterAll(async()=>{await unlink(html);await unlink(script)})

async function fixture(page:Page){
  const claimed=new Set<string>(),keys:string[]=[]
  let loseResponse=false, rejectAdmin=false
  const entries=()=>[{id:'14',kind:'COIN',amount:1000},{id:'13',kind:'GACHA_TICKET',amount:3}].map(v=>({
    id:v.id,type:'REWARD',title:'소중한 의견 감사합니다',createdAt:'2026-11-07T09:00:00Z',readAt:claimed.has(v.id)?'2026-11-07T09:01:00Z':null,
    reward:{kind:v.kind,amount:v.amount,expiresAt:'2030-01-01T00:00:00Z',claimedAt:claimed.has(v.id)?'2026-11-07T09:01:00Z':null},
  }))
  await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname
    if(path==='/api/v1/auth/refresh')return route.fulfill({json:{accessToken:'reward-fixture'}})
    if(path==='/api/v1/notifications')return route.fulfill({json:{items:entries(),unreadCount:2-claimed.size,nextCursor:null}})
    if(path.endsWith('/claim')){
      expect(route.request().postData()).toBeNull()
      const id=path.split('/').at(-2)!,coin=id==='14';claimed.add(id)
      if(loseResponse){loseResponse=false;return route.abort('failed')}
      return route.fulfill({json:{notificationId:id,kind:coin?'COIN':'GACHA_TICKET',amount:coin?1000:3,
        claimedAt:'2026-11-07T09:01:00Z',balanceAfter:coin?1100:null,ticketsAfter:coin?null:3}})
    }
    if(path==='/api/v1/admin/wallet-grants/rewards'){
      const body=route.request().postDataJSON();keys.push(body.operationId)
      if(rejectAdmin)return route.fulfill({status:409,json:{code:'REWARD_RECIPIENT_UNAVAILABLE'}})
      if(loseResponse){loseResponse=false;return route.abort('failed')}
      return route.fulfill({json:{operationId:body.operationId,notificationId:'14',createdAt:'2026-11-07T09:00:00Z'}})
    }
    return route.fulfill({status:404,json:{code:'NOT_FOUND'}})
  })
  return {claimed,keys,lose:()=>{loseResponse=true},reject:()=>{rejectAdmin=true}}
}

test('엽전과 뽑기권을 받고 정렬된 팝업과 수령완료를 확인한다',async({page},info)=>{
  await fixture(page);await page.goto('/reward-harness.local.html')
  await page.getByRole('button',{name:/알림함/}).click()
  await page.getByRole('button',{name:'보상',exact:true}).click()
  await page.getByRole('button',{name:'엽전 1,000냥 받기',exact:true}).click()
  const popup=page.locator('.inbox-reward-popup'),dialog=page.getByRole('dialog',{name:'보상 수령 완료'})
  await expect(popup.getByRole('heading',{name:'보상을 받았어요!'})).toBeVisible()
  await expect(popup.getByText('엽전 1,000냥',{exact:true})).toBeVisible()
  await expect(popup.getByRole('button',{name:'확인',exact:true})).toBeFocused()
  await page.keyboard.press('Tab');await expect(popup.getByRole('button',{name:'확인',exact:true})).toBeFocused()
  await popup.evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)))
  expect(await popup.evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
  const outer=await dialog.boundingBox(),inner=await popup.boundingBox()
  expect(inner!.y).toBeGreaterThanOrEqual(outer!.y)
  expect(inner!.y+inner!.height).toBeLessThanOrEqual(outer!.y+outer!.height)
  expect(Math.abs(inner!.x+inner!.width/2-outer!.x-outer!.width/2)).toBeLessThan(2)
  await page.screenshot({path:info.outputPath('coin-received.png')})
  await popup.getByRole('button',{name:'확인',exact:true}).click()
  await expect(page.getByRole('button',{name:'엽전 1,000냥 수령 완료',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'뽑기권 3장 받기',exact:true}).click()
  await expect(popup.getByText('뽑기권 3장',{exact:true})).toBeVisible()
  await popup.evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)))
  await page.screenshot({path:info.outputPath('ticket-received.png')})
  await page.keyboard.press('Escape');await expect(popup).toHaveCount(0)
  await expect(page.getByRole('dialog',{name:'알림함'})).toBeVisible()
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('수령 응답 유실 후 같은 보상을 다시 확인하고 중복 클릭을 막는다',async({page})=>{
  const state=await fixture(page);state.lose();await page.goto('/reward-harness.local.html')
  await page.getByRole('button',{name:/알림함/}).click()
  const receive=page.getByRole('button',{name:'뽑기권 3장 받기',exact:true})
  await receive.click();await expect(page.getByRole('alert')).toBeVisible()
  // 서버 커밋 뒤 응답만 유실된 조건: 같은 id로 재확인한다.
  await receive.click();await expect(page.locator('.inbox-reward-popup')).toBeVisible()
  expect([...state.claimed]).toEqual(['13'])
  await page.getByRole('button',{name:'확인',exact:true}).click()
  await page.getByRole('button',{name:'뽑기권 3장 수령 내역',exact:true}).click()
  await expect(page.locator('.inbox-reward-popup')).toBeVisible()
})

async function fill(page:Page){
  await page.getByLabel('받는 회원 ID').fill('8202');await page.getByLabel('수량',{exact:true}).fill('3')
  await page.getByLabel('알림 제목').fill('소중한 의견 감사합니다');await page.getByLabel('함께 보낼 메시지').fill('온탑에서 보내는 작은 선물입니다.')
  await page.getByLabel('수령 기한').fill('2030-01-01T09:00');await page.getByRole('button',{name:'보낼 내용 확인'}).click()
}

test('관리자 발송 응답유실은 키를 유지하고 확정거절은 입력을 고칠 수 있다',async({page},info)=>{
  const state=await fixture(page);await page.goto('/reward-harness.local.html?admin');await fill(page)
  state.lose();await page.getByRole('button',{name:'이 내용으로 보상 보내기'}).click()
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'입력 수정'})).toHaveCount(0)
  await page.getByRole('button',{name:'같은 요청으로 다시 확인'}).click()
  await expect(page.getByRole('status')).toContainText('뽑기권 3장')
  expect(state.keys[0]).toBe(state.keys[1]);await page.screenshot({path:info.outputPath('admin-reward-sent.png')})
  await page.getByLabel('알림 제목').fill('다른 선물');await page.getByLabel('함께 보낼 메시지').fill('감사합니다')
  await page.getByRole('button',{name:'보낼 내용 확인'}).click();state.reject()
  await page.getByRole('button',{name:'이 내용으로 보상 보내기'}).click();await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button',{name:'입력 수정'}).click();await expect(page.getByLabel('받는 회원 ID')).toBeEnabled()
})
