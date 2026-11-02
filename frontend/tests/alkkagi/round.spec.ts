import { expect, test } from '@playwright/test'

test('두 역할로 실제 한 판을 전멸까지 진행하고 카드 획득·결과·다음 판을 확인한다', async ({ page }) => {
  test.setTimeout(120000)
  const sockets: WebSocket[] = []
  const states: any[] = [], hands: any[] = []
  const wait = async (condition: () => boolean, timeout = 12000) => {
    const end = Date.now() + timeout
    while (!condition()) { if (Date.now() > end) throw new Error('actual local round timeout'); await new Promise(r => setTimeout(r, 20)) }
  }
  try {
    for (const [actor, role] of ['red', 'green'].entries()) {
      const socket = new WebSocket(`ws://127.0.0.1:19183/dev/alkkagi-ws?role=${role}`)
      sockets.push(socket)
      socket.addEventListener('message', e => {
        const m = JSON.parse(String(e.data))
        if (m.type === 'STATE') states[actor] = m.state
        if (m.type === 'PRIVATE_STATE') hands[actor] = m.state
      })
      await wait(() => socket.readyState === WebSocket.OPEN && !!states[actor])
    }
    sockets[0].send(JSON.stringify({ type: 'RESET' })); const old = states[0].gameId
    await wait(() => states[0].gameId !== old && states[0].stage === 'WAITING')
    await page.goto('/alkkagi-preview.html?role=red')
    await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
    sockets[0].send(JSON.stringify({ type: 'START' }))
    await wait(() => states[0].stage === 'AIMING')
    let observedReward = false, observedMany = false
    for (let turn = 0; turn < 80 && states[0].stage !== 'FINISHED'; turn++) {
      const s = states[0], actor = s.turn
      const piece = s.pieces.filter((p: any) => p.alive && p.owner === actor).sort((a: any, b: any) =>
        Math.min(4.5 - Math.abs(a.x), 5 - Math.abs(a.y)) - Math.min(4.5 - Math.abs(b.x), 5 - Math.abs(b.y)))[0]
      const horizontal = 4.5 - Math.abs(piece.x) < 5 - Math.abs(piece.y)
      sockets[actor].send(JSON.stringify({ type: 'SHOT', gameId: s.gameId, expectedVersion: s.version, actionId: `round-${turn}`,
        pieceId: piece.id, dx: horizontal ? Math.sign(piece.x) || 1 : 0, dy: horizontal ? 0 : Math.sign(piece.y) || 1, power: 1 }))
      await wait(() => states[0].simulationId > s.simulationId)
      await wait(() => states[0].stage !== 'SIMULATING')
      while (states[0].stage === 'CHOOSING') {
        await wait(() => states[0].stage !== 'CHOOSING' || hands.some((h, i) => h?.choice && states[0].cardChoices.some((c: any) => c.actor === i && c.deadline === h.choice.deadline)))
        if (states[0].stage !== 'CHOOSING') break
        const previous = states[0].version
        for (let owner = 0; owner < 2; owner++) {
          const choice = hands[owner]?.choice
          if (choice) sockets[owner].send(JSON.stringify({ type: 'CARD_CHOOSE', gameId: states[0].gameId,
            actionId: crypto.randomUUID(), expectedVersion: states[0].version, choiceId: choice.id, optionId: choice.options[0].id }))
        }
        await wait(() => states[0].version !== previous)
        await new Promise(r => setTimeout(r, 30))
      }
      if (!observedReward && hands.some(h => h?.awards?.some((a: any) => a.result === 'AWARDED'))) {
        observedReward = true
        await page.screenshot({ path: '.vite-cache/alkkagi-test-results/round-card-earned.png', fullPage: true })
      }
      expect(hands.every(h => h.cards.length === h.awards.filter((a: any) => a.result === 'AWARDED').length)).toBe(true)
      if (!observedMany && hands[0].cards.length >= 3) {
        observedMany = true
        await page.setViewportSize({ width: 390, height: 844 })
        const third = page.getByRole('region', { name: '비밀 카드' }).locator('.hand-cards button').nth(2)
        await expect(third).toBeVisible(); await third.scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.getByRole('region', { name: '비밀 카드' }).screenshot({ path: '.vite-cache/alkkagi-test-results/hand-many-mobile.png' })
        await page.setViewportSize({ width: 1280, height: 960 })
      }
    }
    expect(observedReward).toBe(true)
    expect(hands.some(h => h.cards.length >= 3)).toBe(true)
    expect(observedMany).toBe(true)
    expect(states[0].endReason).toBe('PIECES_OUT')
    await expect(page.getByRole('region', { name: '경기 결과' })).toBeVisible()
    await page.screenshot({ path: '.vite-cache/alkkagi-test-results/round-natural-finish.png', fullPage: true })
    await page.getByRole('button', { name: '다음 판 준비', exact: true }).click()
    await expect(page.getByRole('region', { name: '비밀 카드' })).toContainText('(0장)')
  } finally { sockets.forEach(s => s.close()) }
})

test('벽 고스트는 커서를 따라 유효성을 안내하고 Q/E·휠·취소가 실제 카드를 쓰지 않는다', async ({ page }) => {
  const packets: any[] = []
  page.on('websocket', ws => ws.on('framereceived', f => packets.push(JSON.parse(String(f.payload)))))
  const state = () => packets.filter(m => m.type === 'STATE').at(-1)?.state
  const hand = () => packets.filter(m => m.type === 'PRIVATE_STATE').at(-1)?.state
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await page.getByLabel('연습 카드 1', { exact: true }).selectOption('WALL')
  await page.getByRole('button', { name: '연습 카드 받기 (로컬)' }).click()
  await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
  await page.getByRole('button', { name: '벽 설치', exact: true }).click()
  await page.locator('canvas').scrollIntoViewIfNeeded()
  const r = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height * .60)
  await expect(page.getByText('알과 겹칩니다.', { exact: false })).toBeVisible()
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await expect(page.getByText('확정할 수 있습니다.', { exact: false })).toBeVisible()
  await page.keyboard.press('q')
  await expect.poll(async () => Number(await page.getByLabel('벽 각도', { exact: true }).inputValue())).toBeCloseTo(-15)
  await page.mouse.wheel(0, 50)
  await expect.poll(async () => Number(await page.getByLabel('벽 각도', { exact: true }).inputValue())).toBeCloseTo(0)
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2)
  await expect(page.getByRole('button', { name: '벽 위치 다시 고르기' })).toBeVisible()
  expect(state().wall).toBeNull()
  await page.screenshot({ path: '.vite-cache/alkkagi-test-results/wall-ghost.png', fullPage: true })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '아이템 확정' })).toHaveCount(0)
  expect(hand().cards).toHaveLength(2); expect(state().itemUsedThisTurn).toBe(false)
})

test('관전자 훈수·커서·채팅은 전달되지만 발사와 비밀 손패에는 접근하지 않는다', async ({ page, context }) => {
  const packets: any[] = [], watch: any[] = []
  page.on('websocket', ws => ws.on('framereceived', f => packets.push(JSON.parse(String(f.payload)))))
  const viewer = await context.newPage()
  viewer.on('websocket', ws => ws.on('framereceived', f => watch.push(JSON.parse(String(f.payload)))))
  const state = () => packets.filter(m => m.type === 'STATE').at(-1)?.state
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await page.getByRole('button', { name: '연습 카드 받기 (로컬)' }).click()
  await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
  await viewer.goto('/alkkagi-preview.html?role=viewer')
  await expect(viewer.getByText('연결됨', { exact: true })).toBeVisible()
  const before = state()
  await viewer.locator('canvas').scrollIntoViewIfNeeded()
  const r = (await viewer.locator('canvas').boundingBox())!
  const x = r.x + r.width / 2, y = r.y + r.height * .60
  await viewer.mouse.move(x, y); await viewer.mouse.down()
  await viewer.mouse.move(x, y + r.height * .1, { steps: 8 }); await viewer.mouse.up()
  await expect(viewer.getByRole('status')).toContainText('훈수 전송 완료')
  await expect(page.getByRole('list', { name: '최근 훈수' })).toContainText('p13')
  expect(state().simulationId).toBe(before.simulationId)
  expect(state().pieces).toEqual(before.pieces)
  expect(watch.some(m => m.type === 'PRIVATE_STATE')).toBe(false)
  await expect.poll(() => state()?.social.cursors.length).toBeGreaterThan(0)
  await viewer.getByLabel('채팅 내용', { exact: true }).fill('<b>한 수 추천!</b>')
  await viewer.getByRole('button', { name: '보내기', exact: true }).click()
  await expect(page.getByRole('log', { name: '경기 채팅' })).toContainText('<b>한 수 추천!</b>')
  expect(await page.getByRole('log').locator('b').count()).toBe(0)
  await page.screenshot({ path: '.vite-cache/alkkagi-test-results/spectator-advice-chat.png', fullPage: true })
})

test('기권 확인·종료 복구·다음 판은 결과를 중복 재생하거나 손패를 이월하지 않는다', async ({ page, context }) => {
  const states: any[] = []
  await page.addInitScript(() => {
    (window as any).__feedback = []
    window.addEventListener('alkkagi:feedback', (e: Event) => (window as any).__feedback.push((e as CustomEvent).detail))
  })
  page.on('websocket', ws => ws.on('framereceived', f => { const m = JSON.parse(String(f.payload)); if (m.type === 'STATE') states.push(m.state) }))
  const green = await context.newPage()
  await page.goto('/alkkagi-preview.html?role=red'); await green.goto('/alkkagi-preview.html?role=green')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
  const gameId = states.at(-1).gameId
  await page.getByRole('button', { name: '기권하기', exact: true }).click()
  await page.getByRole('button', { name: '계속 플레이', exact: true }).click()
  expect(states.at(-1).stage).toBe('AIMING')
  await page.getByRole('button', { name: '기권하기', exact: true }).click()
  await page.getByRole('button', { name: '기권 확정', exact: true }).click()
  await expect(page.getByRole('region', { name: '경기 결과' })).toContainText('청팀 승리')
  await expect(green.getByRole('region', { name: '경기 결과' })).toContainText('청팀 승리')
  await expect.poll(() => page.evaluate(() => (window as any).__feedback.filter((e: any) => e.type === 'GAME_FINISHED').length)).toBe(1)
  await page.screenshot({ path: '.vite-cache/alkkagi-test-results/round-finished.png', fullPage: true })
  await page.reload()
  await expect(page.getByRole('region', { name: '경기 결과' })).toBeVisible()
  expect(await page.evaluate(() => (window as any).__feedback.filter((e: any) => e.type === 'GAME_FINISHED').length)).toBe(0)
  await page.getByRole('button', { name: '다음 판 준비', exact: true }).click()
  await expect.poll(() => states.at(-1)?.gameId).not.toBe(gameId)
  await expect(page.getByRole('region', { name: '비밀 카드' })).toContainText('(0장)')
  expect(states.at(-1).stage).toBe('WAITING')
  expect(states.at(-1).social.chat).toHaveLength(0)
})
