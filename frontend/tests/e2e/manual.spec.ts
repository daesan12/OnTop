import { test, expect, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { MAILBOX, NOTES_BOX } from '../../src/config'

const manual=(page:Page)=>page.getByRole('dialog',{name:'게임 설명서',exact:true})

for (const kind of ['feedback', 'notes'] as const) test('M15 F1 owns Tab/Escape above the '+kind+' draft and restores that dialog', async ({page}) => {
  const position = kind === 'feedback'
    ? {x:MAILBOX.x,y:.8,z:MAILBOX.z+1,yaw:Math.PI}
    : {x:NOTES_BOX.x,y:NOTES_BOX.y+.8,z:NOTES_BOX.z+1,yaw:Math.PI}
  const server=await fixture(page,{manualMovement:true,position}); await loaded(page)
  expect(await page.evaluate(async kind=>{
    const controller=await import('/src/features/'+kind+'/controller.ts')
    return controller[kind==='feedback'?'openFeedback':'openNotes']()
  },kind)).toBe(true)
  const panel=page.getByRole('dialog',{name:kind==='feedback'?'온탑 소리함':'전망대 익명 메모',exact:true})
  if (kind === 'notes') await panel.getByRole('button',{name:/메모 작성하기/}).click()
  const draft=panel.getByRole('textbox'); await draft.fill('F1 아래에서 보존할 작성 내용')
  await page.keyboard.press('F1'); await opened(page)
  await page.keyboard.press('Tab'); await expect(manual(page).locator(':focus')).toHaveCount(1)
  const sent=server.sent.length
  await manual(page).focus()
  for(const key of ['KeyW','KeyE','Space','KeyG','KeyM'])await page.keyboard.press(key)
  await close(page)
  await expect(panel).toBeVisible(); await expect(draft).toHaveValue('F1 아래에서 보존할 작성 내용'); await expect(draft).toBeFocused()
  await screenshot(page,'m15-'+kind+'-draft-restored')
  expect(await page.evaluate(async()=>({...((await import('/src/world/inputOwnership.ts' as string)).inputState)}))).toMatchObject({manualOpen:false,[kind==='feedback'?'feedbackOpen':'notesOpen']:true})
  expect(server.sent.slice(sent).some(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz||m.payload.jump)||/GAME_ACTION|TABLE_JOIN|WORLD_EMOTE_SEND|WORLD_CHAT_SEND/.test(m.type))).toBe(false)
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0)
  await page.locator('canvas').focus(); await page.keyboard.down('KeyW')
  await expect.poll(()=>server.sent.slice(sent).some(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz))).toBe(true)
  await page.keyboard.up('KeyW')
})
async function loaded(page:Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({timeout:90000})
  await expect.poll(()=>page.evaluate(async()=>{
    const {roamingInput}=await import('/src/world/inputOwnership.ts' as string)
    const {useSession}=await import('/src/network/worldClient.ts' as string)
    return roamingInput.ready && useSession.getState().status==='connected'
  })).toBe(true)
  await page.locator('canvas').focus()
}
async function opened(page:Page) {
  await expect(manual(page)).toBeVisible()
  await expect(manual(page)).toHaveAttribute('data-phase','open')
}
async function close(page:Page) {
  await page.keyboard.press('Escape')
  await expect(manual(page)).toHaveCount(0)
}
test('M15 original scroll, search, categories, rulebook images/zoom/downloads and keyboard focus',async({page})=>{
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message))
  const images:string[]=[]; page.on('request',r=>{if(r.url().includes('/art/rulebooks/')) images.push(r.url())})
  await fixture(page,{omok:true,players:8}); await loaded(page)
  expect(images).toEqual([])
  await page.getByRole('button',{name:'게임 설명서 F1',exact:true}).click(); await opened(page)
  await expect(manual(page).getByRole('button',{name:/설명 읽기$/})).toHaveCount(5)
  // Two columns for every game, the odd last card (붕어빵) included.
  const widths=await manual(page).locator('.manual-card').evaluateAll(cards=>cards.map(card=>Math.round(card.getBoundingClientRect().width)))
  expect(new Set(widths).size).toBe(1)
  await screenshot(page,'m15-catalog')
  await manual(page).getByRole('button',{name:'미니게임',exact:true}).click()
  await expect(manual(page).getByRole('button',{name:/설명 읽기$/})).toHaveCount(1)
  await manual(page).getByRole('button',{name:'전체',exact:true}).click()
  await manual(page).getByRole('searchbox',{name:'게임 설명 검색'}).fill('금수 렌주')
  await expect(manual(page).getByRole('button',{name:/설명 읽기$/})).toHaveCount(1)
  await manual(page).getByRole('button',{name:'오목 설명 읽기',exact:true}).click()
  const guide=manual(page).locator('.game-guide')
  const back=guide.getByRole('button',{name:'← 게임 목록',exact:true})
  // The way back sits at the top left of the game page.
  expect((await back.boundingBox())!.x-(await guide.boundingBox())!.x).toBeLessThan(20)
  await expect(guide).toContainText('흑 정확히 5목')
  for (const heading of ['한 판의 흐름','조작','꼭 기억해요','자세한 규칙']) await expect(guide.getByRole('heading',{name:heading,exact:true,level:4})).toBeVisible()
  await screenshot(page,'m15-renju')
  await expect(guide.getByRole('link',{name:'규칙 파일 내려받기'})).toHaveAttribute('href','/rulebooks/gomoku/v1.md')
  const download=await page.request.get('/rulebooks/gomoku/v1.md')
  expect(download.ok()).toBe(true); expect(await download.text()).toContain('삼삼·사사·장목')
  await manual(page).getByRole('navigation',{name:'설명 목차'}).getByRole('button',{name:/흑돌의 금수/}).click()
  await expect(manual(page).locator('#manual-rule-3')).toBeFocused()
  await expect(manual(page).locator('#manual-rule-3')).toBeInViewport()
  await manual(page).getByRole('searchbox',{name:'게임 설명 검색'}).fill('원카드')
  await manual(page).getByRole('button',{name:'원카드 설명 읽기',exact:true}).click()
  await expect(guide.getByRole('heading',{name:/특수 카드 알아보기/})).toBeVisible()
  await expect(guide.locator('.game-guide-flow li')).toHaveCount(4)
  await screenshot(page,'m15-onecard-guide')
  // The designed page replaces the old picture pages; no rulebook art is fetched.
  expect(images).toEqual([])
  await back.click()
  await expect(manual(page).getByRole('button',{name:'원카드 설명 읽기',exact:true})).toBeVisible()
  await manual(page).getByRole('button',{name:'설명서 닫기',exact:true}).focus()
  await page.keyboard.press('Shift+Tab')
  expect(await page.evaluate(()=>document.activeElement?.closest('.game-manual')!==null)).toBe(true)
  await close(page)
  await expect(page.getByRole('button',{name:'게임 설명서 F1',exact:true})).toBeFocused()
  expect(errors).toEqual([]); await expect(page.locator('vite-error-overlay')).toHaveCount(0)
})

test('M15 F1 works offline, reduced motion, aborts opening, and never leaks held movement/chat/map/emote keys',async({page,context})=>{
  const server=await fixture(page,{manualMovement:true,omok:true}); await loaded(page)
  await page.keyboard.down('KeyW'); await expect.poll(()=>server.sent.filter(m=>m.type==='WORLD_MOVE'&&m.payload.dz).length).toBeGreaterThan(0)
  await page.keyboard.press('F1'); await expect(manual(page)).toHaveAttribute('data-phase','opening')
  await page.keyboard.press('Escape'); await expect(manual(page)).toHaveCount(0)
  const count=server.sent.filter(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz)).length
  await page.waitForTimeout(300); expect(server.sent.filter(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz))).toHaveLength(count)
  await page.keyboard.up('KeyW')
  await page.emulateMedia({reducedMotion:'reduce'}); await context.setOffline(true)
  await page.keyboard.press('F1'); await opened(page)
  await expect(manual(page).getByRole('button',{name:'오목 설명 읽기',exact:true})).toBeVisible()
  await manual(page).focus()
  await page.keyboard.press('KeyE'); await page.keyboard.press('KeyG'); await page.keyboard.press('KeyM'); await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox',{name:'주변 채팅 메시지'})).toHaveCount(0)
  await expect(page.getByRole('dialog',{name:'감정표현 선택'})).toHaveCount(0)
  await close(page); await context.setOffline(false)
  await page.keyboard.down('KeyW'); await expect.poll(()=>server.sent.filter(m=>m.type==='WORLD_MOVE'&&(m.payload.dx||m.payload.dz)).length).toBeGreaterThan(count); await page.keyboard.up('KeyW')
})

for(const [code,title,options] of [
  ['OMOK','오목',{omok:true}],['DICE','주사위 한 판',{dice:true}],['ONE_CARD','원카드',{onecard:2 as const}],['LIAR_BRIDGE','거짓말 다리 건너기',{bridge:2 as const}],
] as const) test('M15 contextual F1 preserves participant state and BE command flow: '+code,async({page})=>{
  const server=await fixture(page,{...options,omok:true,m09:true}); await loaded(page)
  await page.keyboard.press('KeyE'); await page.getByRole('button',{name:'앉기',exact:true}).click()
  await page.getByLabel('1인 참가비').fill('1'); await page.getByRole('button',{name:title+' 선택',exact:true}).click()
  await page.keyboard.press('F1'); await opened(page)
  await expect(manual(page).getByRole('heading',{name:title,exact:true,level:3})).toBeVisible()
  await close(page)
  await page.getByRole('button',{name:'준비',exact:true}).click(); server.confirmStart()
  await expect(page.getByRole('region',{name:code==='OMOK'?'오목 경기':code==='DICE'?'주사위 경기':code==='ONE_CARD'?'원카드 경기':'다리 경기',exact:true})).toBeVisible()
  const before=await page.evaluate(async()=>({game:(await import('/src/game/store.ts' as string)).useGame.getState().game,session:(await import('/src/network/worldClient.ts' as string)).useSession.getState().tableId}))
  const commands=server.sent.filter(m=>/GAME_ACTION|TABLE_LEAVE|READY_SET/.test(m.type)).length
  await page.keyboard.press('F1'); await opened(page)
  await expect(manual(page).getByRole('heading',{name:title,exact:true,level:3})).toBeVisible()
  await manual(page).focus()
  for(const key of ['KeyW','Space','KeyE','KeyR','KeyQ','KeyT','Digit1']) await page.keyboard.press(key)
  expect(server.sent.filter(m=>/GAME_ACTION|TABLE_LEAVE|READY_SET/.test(m.type))).toHaveLength(commands)
  await close(page)
  const after=await page.evaluate(async()=>({game:(await import('/src/game/store.ts' as string)).useGame.getState().game,session:(await import('/src/network/worldClient.ts' as string)).useSession.getState().tableId}))
  expect(after).toEqual(before)
})

test('M15 game guide needs no rulebook pictures and F1 reopens on the same game',async({page})=>{
  await page.route('**/art/rulebooks/**',route=>route.abort())
  await fixture(page); await loaded(page); await page.keyboard.press('F1'); await opened(page)
  await manual(page).getByRole('button',{name:'원카드 설명 읽기',exact:true}).click()
  await expect(manual(page).getByRole('heading',{name:'꼭 기억해요',exact:true,level:4})).toBeVisible()
  await expect(manual(page).getByRole('heading',{name:/특수 카드 알아보기/})).toBeVisible()
  await page.keyboard.press('F1'); await expect(page.locator('dialog[open]')).toHaveCount(0)
  await page.keyboard.press('F1'); await opened(page)
  await expect(manual(page).getByRole('heading',{name:'원카드',exact:true,level:3})).toBeVisible()
})

test('M15 F1 leaves the existing dice score sheet owned and Esc closes only the front modal',async({page})=>{
  const server=await fixture(page,{omok:true,dice:true,m09:true}); await loaded(page)
  await page.keyboard.press('KeyE'); await page.getByRole('button',{name:'앉기',exact:true}).click()
  await page.getByLabel('1인 참가비').fill('1'); await page.getByRole('button',{name:'주사위 한 판 선택',exact:true}).click()
  await page.getByRole('button',{name:'준비',exact:true}).click(); server.confirmStart()
  await expect(page.getByRole('region',{name:'주사위 경기',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'T 점수표',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'주사위 점수표',exact:true})).toBeVisible()
  await page.keyboard.press('F1'); await opened(page)
  await page.keyboard.press('KeyT'); await close(page)
  await expect(page.getByRole('dialog',{name:'주사위 점수표',exact:true})).toBeVisible()
  expect(await page.evaluate(async()=>({...((await import('/src/world/inputOwnership.ts' as string)).inputState)}))).toMatchObject({manualOpen:false,minigameOpen:true})
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog',{name:'주사위 점수표',exact:true})).toHaveCount(0)
})

test('M15 F1 preserves the chat draft/focus and ignores IME, repeat and modified shortcuts',async({page})=>{
  await fixture(page); await loaded(page)
  await page.getByRole('button',{name:'채팅 입력창 열기',exact:true}).click()
  const chat=page.getByRole('textbox',{name:'주변 채팅 메시지'})
  await chat.fill('작성 중인 메시지')
  await page.evaluate(()=>{for(const flags of [{isComposing:true},{repeat:true},{ctrlKey:true},{altKey:true},{metaKey:true}])window.dispatchEvent(new KeyboardEvent('keydown',{code:'F1',bubbles:true,...flags}))})
  await expect(manual(page)).toHaveCount(0)
  await page.keyboard.press('F1'); await opened(page); await close(page)
  await expect(chat).toBeFocused(); await expect(chat).toHaveValue('작성 중인 메시지')
})
