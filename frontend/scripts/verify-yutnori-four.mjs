import { chromium, expect as baseExpect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve('docs/yutnori/qa-four-teams')
const expect = baseExpect.configure({ timeout: 20000 })
await mkdir(output, { recursive: true })
let healthy = false
for (let attempt = 0; attempt < 240 && !healthy; attempt++) {
  try { healthy = (await fetch('http://127.0.0.1:19185/actuator/health', { signal: AbortSignal.timeout(3000) })).ok } catch { /* 준비 중인 검수 앱을 기다린다. */ }
  if (!healthy) await new Promise(resolve => setTimeout(resolve, 1000))
}
if (!healthy) throw new Error('기존 loopback 검수 BE가 준비되지 않았습니다.')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const contexts = []
const errors = []
async function account(role, host) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  contexts.push(context)
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', error => errors.push(`${role}: ${error.message}`))
  await page.goto(`http://${host}:5244/yut-park.html?role=${role}`, { waitUntil: 'commit', timeout: 90000 })
  await expect(page.getByRole('status').filter({ hasText: '전통놀이존 입구' })).toBeVisible({ timeout: 180000 })
  await expect.poll(() => page.evaluate(async () => {
    const world = await import('/src/network/worldClient.ts')
    const state = world.useSession.getState()
    const avatar = world.avatars.get(state.sessionId)
    return !!avatar && state.mapCompatible && state.roomId === 'channel-1'
  }), { timeout: 30000 }).toBe(true)
  await page.screenshot({ path: path.join(output, `${role}-park.png`) })
  // 동일한 실제 E 상호작용 경로를 사용한다. 위치는 기존 loopback fixture가 서버에서 배치한다.
  await expect.poll(async () => {
    await page.keyboard.press('e')
    return page.locator('.yut-shell').isVisible()
  }, { timeout: 20000, intervals: [1000] }).toBe(true)
  await page.waitForTimeout(1200)
  if (!await page.getByRole('heading', { name: '전통놀이 고르기', exact: true }).isVisible()) {
    if (await page.getByRole('button', { name: '기권·나가기', exact: true }).isVisible()) {
      await page.getByRole('button', { name: '기권·나가기', exact: true }).click()
      await page.getByRole('button', { name: '기권하고 공원으로', exact: true }).click()
    } else await page.getByRole('button', { name: '공원으로', exact: true }).click()
    await expect(page.locator('.yut-shell')).not.toBeVisible()
    await page.keyboard.press('e')
  }
  await expect(page.getByRole('heading', { name: '전통놀이 고르기', exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(output, `${role}-catalog.png`) })
  await page.locator('.yut-augment-card').click()
  return page
}
async function state(page) {
  return page.evaluate(async () => {
    const { getAuthSession } = await import('/src/auth/authFlow.ts')
    const auth = getAuthSession()
    if (auth?.status !== 'AUTHENTICATED') throw new Error('검수 계정의 로그인이 필요합니다.')
    const response = await fetch('/api/v1/minigames/yutnori/rooms?channelId=channel-1', { headers: { Authorization: 'Bearer ' + auth.accessToken } })
    if (!response.ok) throw new Error('경기 상태 조회 실패: ' + response.status)
    return response.json()
  })
}

const pages = []
try {
  const host = await account('red', '127.0.0.1'); pages.push(host)
  await host.getByRole('button', { name: '새 방 만들기', exact: true }).click()
  await host.getByLabel('방 이름', { exact: true }).fill('네 팀이 함께하는 윷판')
  await host.getByLabel('팀 수', { exact: true }).selectOption('4')
  await host.getByLabel('팀별 말 수', { exact: true }).selectOption('1')
  await host.screenshot({path:path.join(output,'settings-one-piece.png')})
  await host.getByLabel('팀별 말 수', { exact: true }).selectOption('4')
  await host.screenshot({path:path.join(output,'settings-four.png')})
  await host.getByRole('button', { name: '방 만들기', exact: true }).click()
  for (const [role, domain] of [['green','localhost'], ['viewer','127.0.0.1'], ['yellow','localhost']]) {
    const page = await account(role,domain); pages.push(page)
    await page.getByRole('button', { name: '참가하기', exact: true }).click()
    await expect(page.locator('.yut-team-box')).toHaveCount(4)
  }
  const before = (await state(host)).mine
  expect(before.publicState.teamCount).toBe(4); expect(before.publicState.pieceCount).toBe(4)
  expect(new Set(before.publicState.players.map(p=>p.team)).size).toBe(4)
  for (const page of pages) await page.getByRole('button', { name:'준비 완료',exact:true }).click()
  await host.screenshot({path:path.join(output,'lobby-four.png')})
  await host.getByRole('button',{name:'윷놀이 시작',exact:true}).click()
  await expect(host.locator('.yut-board')).toBeVisible()
  await expect(host.locator('.yut-board circle')).toHaveCount(29)
  await expect(host.locator('circle[r="18"]')).toHaveCount(5)
  await expect(host.locator('circle[data-node="25"]')).toHaveAttribute('r','13')
  await expect(host.locator('.yut-play-panel .yut-piece-rack button')).toHaveCount(16)
  await expect(host.locator('.yut-backdo-key')).toContainText('빽도 · 뒤로 1칸')
  await host.screenshot({path:path.join(output,'game-four.png')})
  const users=['101','202','505','606'], labels=['청팀','홍팀','녹팀','황팀']; let moved=0
  for (let attempt=0;attempt<16 && moved<4;attempt++) {
    let snap=(await state(host)).mine; if(snap.publicState.phase!=='PLAYING')throw Error('경기 조기 종료')
    const page=pages[users.indexOf(snap.publicState.turnUser)]
    await page.bringToFront()
    if(snap.publicState.credits>0 && !snap.publicState.rolls.length){
      await page.getByRole('button',{name:/^윷 던지기/}).click()
      await expect.poll(async()=>(await state(host)).mine.version).toBeGreaterThan(snap.version)
    }
    snap=(await state(host)).mine
    if(snap.publicState.turnUser!==users[pages.indexOf(page)] || !snap.publicState.moves.length)continue
    const move=snap.publicState.moves[0]
    await page.locator('.yut-rolls > button').nth(snap.publicState.rolls.findIndex(r=>r.id===move.rollId)).click()
    await page.getByRole('button',{name:labels[snap.publicState.team]+' '+(move.piece+1)+'번 말 선택',exact:true}).click()
    await page.getByRole('button',{name:/^(기본 길 ·|지름길 ·|완주하기)/}).first().click()
    await expect.poll(async()=>(await state(host)).mine.version).toBeGreaterThan(snap.version);moved++
  }
  expect(moved).toBe(4)
  for(const [width,height]of [[390,844],[1024,500]]){
    await host.setViewportSize({width,height})
    expect(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await host.getByLabel('같은 경기 채팅',{exact:true}).scrollIntoViewIfNeeded()
    await expect(host.getByLabel('같은 경기 채팅',{exact:true})).toBeInViewport()
    await host.screenshot({path:path.join(output,'four-'+width+'x'+height+'.png')})
  }
  await host.setViewportSize({width:1440,height:960})
  await host.getByRole('button',{name:'기권·나가기',exact:true}).click()
  await host.getByRole('button',{name:'기권하고 공원으로',exact:true}).click()
  await expect(host.locator('.yut-shell')).not.toBeVisible()
  await expect.poll(async()=>(await state(pages[1])).mine.publicState.eliminatedTeams).toEqual([0])
  expect((await state(pages[1])).mine.publicState.phase).toBe('PLAYING')
  for(const page of pages.slice(1,3)){
    await page.getByRole('button',{name:'기권·나가기',exact:true}).click()
    await page.getByRole('button',{name:'기권하고 공원으로',exact:true}).click()
  }
  await expect(pages[3].getByRole('heading',{name:'황팀 승리!',exact:true})).toBeVisible()
  await pages[3].screenshot({path:path.join(output,'yellow-wins.png')})
  await pages[3].getByRole('button',{name:'공원으로 돌아가기',exact:true}).click()
  // 별도 DOM에 실제 결과 컴포넌트만 마운트하여 빽도 표식을 시각 검수한다. 서버 결과를 조작하지 않는다.
  await host.evaluate(async()=>{ const fixture=await import('/tests/fixtures/yutBackdo.tsx'); fixture.mountBackdoFixture() })
  await expect(host.locator('#backdo-visual-fixture i[data-marked="true"]')).toHaveText('빽')
  await host.locator('#backdo-visual-fixture').screenshot({path:path.join(output,'backdo-component-fixture.png')})
  await host.evaluate(async()=>{ const fixture=await import('/tests/fixtures/yutBackdo.tsx'); fixture.removeBackdoFixture() })
  for(const page of pages.slice(0,2)){
    await page.bringToFront()
    await expect.poll(()=>page.evaluate(async()=>{const input=await import('/src/world/inputOwnership.ts');return document.visibilityState==='visible'&&input.roamingInput.ready&&!input.panelOwnsKeys()})).toBe(true)
    const before=await page.evaluate(async()=>{const w=await import('/src/network/worldClient.ts');return {...w.avatars.get(w.useSession.getState().sessionId).current}})
    await page.locator('canvas').first().click({position:{x:200,y:200}})
    let distance=0
    for(const key of ['w','d','s','a']){
      await page.keyboard.down(key);await page.waitForTimeout(700);await page.keyboard.up(key)
      distance=await page.evaluate(async before=>{const w=await import('/src/network/worldClient.ts');const now=w.avatars.get(w.useSession.getState().sessionId).current;return Math.hypot(now.x-before.x,now.z-before.z)},before)
      if(distance>.05)break
    }
    expect(distance).toBeGreaterThan(.05)
    await page.screenshot({path:path.join(output,'movement-'+users[pages.indexOf(page)]+'.png')})
  }
  expect(errors).toEqual([])
  console.info(JSON.stringify({success:true,coverage:['four-team-settings','four-players','throw-move','29-nodes','backdo-component-fixture','elimination','yellow-victory','responsive','two-account-park-movement'],evidence:output}))
}catch(error){
  for(const [i,page]of pages.entries()) { await page.screenshot({path:path.join(output,'failure-'+i+'.png')}).catch(()=>{});console.info('UI',i,(await page.locator('body').innerText()).slice(0,2200)) }
  console.info('Page errors',errors);throw error
}finally{await browser.close()}
