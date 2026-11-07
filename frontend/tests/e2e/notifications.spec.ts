import { test, expect, type Page } from '@playwright/test'
import { writeFile, unlink } from 'node:fs/promises'
const html = 'notification-harness.local.html', script = 'src/notification-harness.local.tsx'
test.beforeAll(async () => {
  await writeFile(html, '<!doctype html><html lang="ko"><meta charset="utf-8"><div id="root"></div><script type="module" src="/src/notification-harness.local.tsx"></script></html>', {flag:'wx'})
  await writeFile(script, `import React from 'react';import {createRoot} from 'react-dom/client';
import {restoreAuthSession} from './auth/authFlow';import {NotificationCenter} from './features/notifications/NotificationCenter';import {AdminFeedbackPage} from './features/feedback/AdminFeedbackPage';
await restoreAuthSession(true);document.body.style.cssText='margin:0;background:linear-gradient(135deg,#273d31,#617654);font-family:serif;min-height:100vh';
const admin=new URLSearchParams(location.search).has('admin');
createRoot(document.getElementById('root')!).render(<main className={admin?'admin-feedback-page':'park-page'}><small>로컬 검수 · 실제 컴포넌트 / 인증·REST 대역</small>{admin?<AdminFeedbackPage onAuthEnded={()=>{}}/>:<NotificationCenter/>}</main>);`, {flag:'wx'})
})
test.afterAll(async () => { await unlink(html);await unlink(script) })

/** 실제 제품 컴포넌트 + 인증/REST 대역. DB 저장 검증은 NotificationMySqlTests에서 별도로 수행한다. */
async function fixture(page: Page) {
  let read = false, failure = false, sent = false
  const replyKeys: string[] = []
  const row = () => ({id:'12',type:'FEEDBACK_REPLY',title:'운영진에게 메시지가 도착했어요',createdAt:'2026-11-07T09:00:00Z',readAt:read?'2026-11-07T09:01:00Z':null})
  await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname
    if(path==='/api/v1/auth/refresh')return route.fulfill({json:{accessToken:'test-inbox'}})
    if(path==='/api/v1/admin/me')return route.fulfill({json:{canRead:true,canOperate:true,canGrant:false}})
    if(path==='/api/v1/admin/feedback')return route.fulfill({json:{items:[{receiptId:'7',authorUserId:202,authorNickname:'산책자',channelId:'channel-1',text:'알까기에서 기권하면 공원으로 돌아오지 않아요.',acceptedAt:'2026-11-07T08:00:00Z',status:sent?'RESOLVED':'RECEIVED',version:sent?1:0,latestReply:sent?{id:'5467d58d-3f10-4df1-adb5-8d47bde7c227',text:'알려주신 문제를 수정했습니다. 감사합니다!',createdAt:'2026-11-07T09:00:00Z'}:null}],nextCursor:null}})
    if(path.endsWith('/replies')){
      const body=route.request().postDataJSON();replyKeys.push(body.operationId)
      if(failure){failure=false;return route.abort('failed')}
      sent=true;return route.fulfill({json:{replyId:body.operationId,receiptId:'7',notificationId:'12',status:'RESOLVED',version:1,createdAt:'2026-11-07T09:00:00Z'}})
    }
    if(path==='/api/v1/notifications')return route.fulfill({json:{items:[row()],nextCursor:null,unreadCount:read?0:1}})
    if(path==='/api/v1/notifications/12/read'){
      read=true;return route.fulfill({json:{...row(),body:'안녕하세요, 산책자님!\n\n알려주신 알까기 기권 후 화면 문제를 수정했습니다.\n덕분에 온탑이 더 좋아졌어요. 소중한 의견 감사합니다!',feedbackId:'7',feedbackText:'알까기에서 기권하면 공원으로 돌아오지 않아요.',feedbackStatus:'RESOLVED'}})
    }
    return route.fulfill({status:404,json:{code:'NOT_FOUND'}})
  })
  return {replyKeys,failOnce:()=>{failure=true},get read(){return read}}
}
test('알림 목록에서 상세 읽음과 다시 보기 및 닫기를 확인한다',async({page},testInfo)=>{
  const state=await fixture(page);await page.goto('/notification-harness.local.html')
  await page.getByRole('button',{name:/알림함/}).click()
  await expect(page.getByRole('dialog',{name:'알림함'})).toBeVisible()
  const box=await page.getByRole('dialog',{name:'알림함'}).boundingBox();expect(box!.x).toBeGreaterThan(400)
  await expect(page.getByText('안 읽은 소식 1개')).toBeVisible()
  await page.screenshot({path:testInfo.outputPath('inbox-list.png')})
  await page.getByRole('button',{name:/운영진에게 메시지가/}).click()
  await expect(page.getByRole('dialog',{name:'운영진 메시지'})).toBeVisible()
  await expect(page.getByText('덕분에 온탑이 더 좋아졌어요.',{exact:false})).toBeVisible()
  expect(state.read).toBe(true)
  await page.screenshot({path:testInfo.outputPath('inbox-message.png')})
  await page.getByRole('button',{name:'목록으로'}).click()
  await expect(page.getByText('안 읽은 소식 0개')).toBeVisible()
  await page.getByRole('button',{name:'보상',exact:true}).click()
  await expect(page.getByText('아직 도착한 보상이 없어요.')).toBeVisible()
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('관리자 답변 실패 후 입력과 요청 키를 보존하고 성공 시 새 답변을 표시한다',async({page},testInfo)=>{
  const state=await fixture(page);await page.goto('/notification-harness.local.html?admin')
  await expect(page.getByText('산책자 · 채널 channel-1', {exact:false})).toBeVisible()
  await page.getByRole('button',{name:'답변 작성'}).click()
  const text='알려주신 문제를 수정했습니다. 감사합니다!'
  await page.getByLabel('작성자에게 보낼 답변').fill(text)
  await page.getByLabel('처리 상태').selectOption('RESOLVED')
  state.failOnce();await page.getByRole('button',{name:'답변 보내기'}).click()
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel('작성자에게 보낼 답변')).toHaveValue(text)
  await page.getByRole('button',{name:'답변 보내기'}).click()
  await expect(page.getByText('답변을 보냈어요.',{exact:false})).toBeVisible()
  await expect(page.getByText('최근 운영진 답변')).toBeVisible();expect(state.replyKeys[0]).toBe(state.replyKeys[1])
  await page.screenshot({path:testInfo.outputPath('admin-reply-saved.png')})
})
