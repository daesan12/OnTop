import { expect, test } from '@playwright/test'

test('실제 드래그 발사를 두 브라우저가 같은 서버 상태로 받고 새 관전자는 최신 판을 복구한다', async ({ page, context }) => {
  page.on('console', message => { if (message.type() === 'error') console.log(message.text()) })
  const red: any[] = [], green: any[] = []
  const packets: { at: number; bytes: number }[] = []
  page.on('websocket', ws => ws.on('framereceived', f => {
    const m = JSON.parse(String(f.payload)); if (m.type === 'STATE') {
      red.push(m); packets.push({ at: Date.now(), bytes: Buffer.byteLength(String(f.payload)) })
    }
  }))
  const other = await context.newPage()
  other.on('websocket', ws => ws.on('framereceived', f => {
    const m = JSON.parse(String(f.payload)); if (m.type === 'STATE') green.push(m)
  }))
  await page.goto('/alkkagi-preview.html?role=red')
  await other.goto('/alkkagi-preview.html?role=green')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await expect.poll(() => red.at(-1)?.state.stage).toBe('WAITING')
  await expect.poll(async () => (await page.locator('canvas').boundingBox())?.height ?? 0).toBeGreaterThan(400)
  const before = (await page.locator('canvas').boundingBox())!
  const startButton = (await page.getByRole('button', { name: '테스트 시작' }).boundingBox())!
  expect(startButton.y).toBeLessThan(before.y)
  await expect(async () => {
    await page.mouse.click(before.x + before.width / 2, before.y + before.height * .60)
    await expect(page.getByRole('status')).toContainText('먼저 테스트 시작')
  }).toPass({ timeout: 5000 })
  await page.getByRole('button', { name: '테스트 시작' }).click()
  await expect.poll(() => red.at(-1)?.state.stage).toBe('AIMING')
  expect(red.at(-1).state.modelId).toBe('separated-v1')
  expect(red.at(-1).state.pieces[8].launchSpeed).toBe(25)
  const rect = (await page.locator('canvas').boundingBox())!
  const aimVersion = red.at(-1).state.version
  // 첫 동작은 선택만 한다. 크게 끌어 놓아도 발사가 되어서는 안 된다.
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * .60)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * .78, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByRole('status')).toContainText('선택됨')
  // 선택된 알의 가장자리 클릭과 미세한 흔들림도 차례를 소비하지 않는다.
  await page.mouse.click(rect.x + rect.width / 2 + 5, rect.y + rect.height * .60)
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * .60)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2 + 3, rect.y + rect.height * .60 + 2)
  await page.mouse.up()
  await expect.poll(() => red.at(-1)?.state.version).toBe(aimVersion)
  expect(red.at(-1).state.simulationId).toBe(0)
  expect(red.at(-1).state.turn).toBe(0)
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height * .60)
  await page.screenshot({ path: '.vite-cache/alkkagi-test-results/selected-piece.png', fullPage: true })
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * .60)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * .78, { steps: 15 })
  await expect(page.getByRole('status')).toContainText('예상 출발 속도')
  await page.mouse.up()
  await expect(page.getByRole('status')).toContainText('발사 승인')
  await expect.poll(() => green.some(m => m.state.simulationId === 1 && m.state.stage === 'SIMULATING')).toBe(true)
  await expect.poll(() => red.at(-1)?.state.stage, { timeout: 12000 }).toBe('AIMING')
  expect(red.at(-1).state.turn).toBe(1)
  const same = green.find(m => m.seq === red.at(-1).seq) ?? green.find(m => red.some(r => r.seq === m.seq && m.state.simulationId === 1))
  expect(same).toBeTruthy()
  expect(same.state).toEqual(red.find(m => m.seq === same.seq).state)
  const gameId = red.at(-1).state.gameId
  await other.goto('/alkkagi-preview.html?role=viewer')
  await expect(other.getByText('관전자', { exact: true })).toBeVisible()
  await expect.poll(() => green.at(-1)?.state.gameId).toBe(gameId)
  expect(green.at(-1).state.simulationId).toBe(1)
  await page.screenshot({ path: '.vite-cache/alkkagi-test-results/after-shot.png', fullPage: true })
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await expect.poll(() => red.at(-1)?.state.stage).toBe('WAITING')
  await test.info().attach('local-socket-observations.json', { contentType: 'application/json',
    body: Buffer.from(JSON.stringify({ scope: 'actual local Chrome STATE receipts during test; not production load/RTT',
      packets: packets.length, payloadBytes: packets.reduce((s,p) => s+p.bytes,0),
      intervalsMs: packets.slice(1).map((p,i) => p.at-packets[i].at) })) })
})

test('로컬 조절 패널이 서버와 다른 화면에 적용되고 기본값으로 복원된다', async ({ page, context }) => {
  const states: any[] = []
  page.on('websocket', ws => ws.on('framereceived', f => {
    const message = JSON.parse(String(f.payload)); if (message.type === 'STATE') states.push(message.state)
  }))
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.locator('.tuning-panel summary').click()
  await page.getByRole('spinbutton', { name: '발사 힘 값', exact: true }).fill('15')
  await page.getByRole('spinbutton', { name: '감속 값', exact: true }).fill('7')
  await page.getByRole('spinbutton', { name: '반발 값', exact: true }).fill('0.75')
  await page.getByRole('button', { name: '적용하고 새 판', exact: true }).click()
  await expect.poll(() => states.at(-1)?.settings.maximumImpulse).toBe(15)
  expect(states.at(-1).settings.deceleration).toBe(7)
  expect(states.at(-1).settings.restitution).toBe(.75)
  expect(states.at(-1).stage).toBe('WAITING')
  const green = await context.newPage()
  await green.goto('/alkkagi-preview.html?role=green')
  await expect(green.locator('.tuning-panel summary')).toContainText('현재 힘 15 / 감속 7 / 반발 0.75')
  await green.locator('.tuning-panel summary').click()
  await expect(green.getByRole('spinbutton', { name: '발사 힘 값', exact: true })).toBeDisabled()
  await page.getByRole('spinbutton', { name: '감속 값', exact: true }).fill('0')
  await expect(page.getByRole('button', { name: '적용하고 새 판', exact: true })).toBeDisabled()
  await page.getByRole('spinbutton', { name: '감속 값', exact: true }).fill('7')
  await page.screenshot({ path: '.vite-cache/alkkagi-test-results/tuning-panel.png', fullPage: true })
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: '발사 힘 값', exact: true })).toHaveValue('15')
  await page.getByRole('button', { name: '기본값으로 새 판', exact: true }).click()
  await expect.poll(() => states.at(-1)?.settings.maximumImpulse).toBe(30)
  await expect(page.getByRole('spinbutton', { name: '발사 힘 값', exact: true })).toHaveValue('30')
  await expect(page.getByRole('spinbutton', { name: '감속 값', exact: true })).toHaveValue('60')
  await expect(page.getByRole('spinbutton', { name: '반발 값', exact: true })).toHaveValue('1')
})

test('판 밖 탈락은 양쪽에 반영되고 새 관전자는 탈락한 알을 최신 상태로 받는다', async ({page,context}) => {
  const states: any[] = []
  page.on('websocket',ws=>ws.on('framereceived',f=>{const m=JSON.parse(String(f.payload));if(m.type==='STATE')states.push(m.state)}))
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'새 판',exact:true}).click()
  await expect.poll(()=>states.at(-1)?.stage).toBe('WAITING')
  await expect.poll(async()=>(await page.locator('canvas').boundingBox())?.height??0).toBeGreaterThan(400)
  await page.getByRole('button',{name:'테스트 시작',exact:true}).click()
  await expect.poll(()=>states.at(-1)?.stage).toBe('AIMING')
  const rect=(await page.locator('canvas').boundingBox())!
  const x=rect.x+rect.width*.30,y=rect.y+rect.height*.86
  await page.mouse.click(x,y)
  await expect(page.getByRole('status')).toContainText('선택됨')
  await page.mouse.move(x,y);await page.mouse.down()
  await page.mouse.move(x,rect.y+rect.height*.65,{steps:15});await page.mouse.up()
  await expect.poll(()=>states.at(-1)?.pieces[0].alive).toBe(false)
  await expect.poll(()=>states.at(-1)?.turn).toBe(1)
  const game=states.at(-1).gameId,recovered:any[]=[]
  const viewer=await context.newPage()
  viewer.on('websocket',ws=>ws.on('framereceived',f=>{const m=JSON.parse(String(f.payload));if(m.type==='STATE')recovered.push(m.state)}))
  await viewer.goto('/alkkagi-preview.html?role=viewer')
  await expect.poll(()=>recovered.at(-1)?.gameId).toBe(game)
  expect(recovered.at(-1).pieces[0].alive).toBe(false)
  expect(recovered.at(-1).simulationId).toBe(1)
  await viewer.screenshot({path:'.vite-cache/alkkagi-test-results/eliminated-recovery.png',fullPage:true})
  await page.getByRole('button',{name:'새 판',exact:true}).click()
})
