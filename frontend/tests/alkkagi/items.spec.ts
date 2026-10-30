import { expect, test } from '@playwright/test'

test('비밀 카드의 취소·교환·추가 발사를 실제 화면에서 확인한다', async ({ page }) => {
  const packets: any[] = []
  page.on('websocket', ws => ws.on('framereceived', f => packets.push(JSON.parse(String(f.payload)))))
  const current = () => packets.filter(m => m.type === 'STATE').at(-1)?.state
  const privateState = () => packets.filter(m => m.type === 'PRIVATE_STATE').at(-1)?.state
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await expect.poll(() => current()?.stage).toBe('WAITING')
  await page.getByRole('button', { name: '연습 카드 받기 (로컬)' }).click()
  await expect.poll(() => privateState()?.cards.length).toBe(2)
  await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
  await page.getByRole('button', { name: '내 알 위치 교환', exact: true }).click()
  await page.getByRole('button', { name: '아이템 취소', exact: true }).click()
  expect(privateState().cards.length).toBe(2)
  expect(current().itemUsedThisTurn).toBe(false)
  await page.getByRole('button', { name: '내 알 위치 교환', exact: true }).click()
  await page.locator('canvas').scrollIntoViewIfNeeded()
  let rect = (await page.locator('canvas').boundingBox())!
  await page.mouse.click(rect.x + rect.width * .30, rect.y + rect.height * .60)
  await page.mouse.click(rect.x + rect.width * .40, rect.y + rect.height * .60)
  await expect(page.getByText(/선택:.*\(2\/2\)/)).toBeVisible()
  await page.screenshot({ path: '.vite-cache/alkkagi-test-results/item-swap-preview.png', fullPage: true })
  const before = current()
  await page.getByRole('button', { name: '아이템 확정', exact: true }).click()
  await expect.poll(() => current()?.lastItemEffect?.type).toBe('SWAP')
  await expect.poll(() => privateState()?.cards.length).toBe(1)
  const effect = current().lastItemEffect
  expect(current().pieces.find((p: any) => p.id === effect.targets[0]).x)
    .toBe(before.pieces.find((p: any) => p.id === effect.targets[1]).x)
  await expect(page.getByRole('button', { name: '한 번 더 튕기기', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await expect.poll(() => current()?.stage).toBe('WAITING')
  await page.getByRole('button', { name: '연습 카드 받기 (로컬)' }).click()
  await expect.poll(() => privateState()?.cards.length).toBe(2)
  await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
  await page.getByRole('button', { name: '한 번 더 튕기기', exact: true }).click()
  const deadline = current().turnDeadline
  await page.getByRole('button', { name: '아이템 확정', exact: true }).click()
  await expect.poll(() => current()?.extraShotsRemaining).toBe(1)
  await page.locator('canvas').scrollIntoViewIfNeeded()
  rect = (await page.locator('canvas').boundingBox())!
  const x = rect.x + rect.width / 2, y = rect.y + rect.height * .60
  await page.mouse.click(x, y)
  await page.mouse.move(x, y); await page.mouse.down()
  await page.mouse.move(x, y + rect.height * .04, { steps: 8 }); await page.mouse.up()
  await expect.poll(() => current()?.simulationId).toBe(1)
  await expect.poll(() => current()?.stage).toBe('AIMING')
  expect(current().turn).toBe(0)
  expect(current().turnDeadline).toBe(deadline)
  await page.screenshot({ path: '.vite-cache/alkkagi-test-results/item-extra-shot.png', fullPage: true })
})


for (const [type, label] of [
  ['WALL', '벽 설치'], ['RELOCATE', '알 재배치'], ['POWER_UP', '힘 강화'],
  ['GROW', '크기 확대'], ['SHRINK', '크기 축소'], ['DEFEND', '방어 자세'],
]) test(`로컬 아이템 ${type}의 선택·미리보기·서버 확정`, async ({ page }) => {
  const messages: any[] = []
  page.on('websocket', ws => ws.on('framereceived', f => messages.push(JSON.parse(String(f.payload)))))
  const current = () => messages.filter(m => m.type === 'STATE').at(-1)?.state
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await expect.poll(() => current()?.stage).toBe('WAITING')
  await page.getByLabel('연습 카드 1', { exact: true }).selectOption(type)
  await page.getByRole('button', { name: '연습 카드 받기 (로컬)' }).click()
  await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.locator('canvas').scrollIntoViewIfNeeded()
  let rect = (await page.locator('canvas').boundingBox())!
  if (type === 'WALL') {
    await page.mouse.click(rect.x + rect.width * .5, rect.y + rect.height * .5)
    await page.getByLabel('벽 각도', { exact: true }).fill('45')
  } else {
    await page.mouse.click(rect.x + rect.width * .5, rect.y + rect.height * .60)
    if (type === 'RELOCATE') await page.mouse.click(rect.x + rect.width * .55, rect.y + rect.height * .53)
  }
  await page.getByRole('button', { name: '아이템 확정', exact: true }).click()
  await expect.poll(() => current()?.lastItemEffect?.type).toBe(type)
  const state = current()
  expect(state.itemUsedThisTurn).toBe(true)
  if (type === 'WALL') { expect(state.wall.angle).toBeCloseTo(Math.PI / 4); expect(state.wallsUsed[0]).toBe(1) }
  else if (type === 'POWER_UP') expect(state.boostedPieceId).toBe('p13')
  else if (type === 'RELOCATE') expect(state.pieces[13].y).toBeLessThan(.7)
  else expect(state.pieces[13].modifier).toBe(type)
  await page.screenshot({ path: `.vite-cache/alkkagi-test-results/item-${type}.png`, fullPage: true })
})

test('사전 선택 없이 첫 누름-드래그로 발사하고 클릭과 취소는 발사하지 않는다', async ({ page }) => {
  const states: any[] = []
  page.on('websocket', ws => ws.on('framereceived', f => { const m = JSON.parse(String(f.payload)); if (m.type === 'STATE') states.push(m.state) }))
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '새 판', exact: true }).click()
  await expect.poll(() => states.at(-1)?.stage).toBe('WAITING')
  await page.getByRole('button', { name: '테스트 시작', exact: true }).click()
  await page.locator('canvas').scrollIntoViewIfNeeded()
  const r = (await page.locator('canvas').boundingBox())!
  await page.mouse.click(r.x + r.width * .50, r.y + r.height * .60)
  expect(states.at(-1).simulationId).toBe(0)
  const x = r.x + r.width * .40, y = r.y + r.height * .60
  await page.mouse.move(x, y); await page.mouse.down()
  await page.mouse.move(x, y + r.height * .1, { steps: 6 }); await page.keyboard.press('Escape'); await page.mouse.up()
  expect(states.at(-1).simulationId).toBe(0)
  await page.mouse.move(x, y); await page.mouse.down()
  await page.mouse.move(x, y + r.height * .1, { steps: 6 }); await page.mouse.up()
  await expect.poll(() => states.at(-1)?.simulationId).toBe(1)
})

test('아이템 설정은 새 판에만 적용하고 잘못된 값은 현재 판을 보존한다', async ({ page }) => {
  const states: any[] = []
  page.on('websocket', ws => ws.on('framereceived', f => { const m = JSON.parse(String(f.payload)); if (m.type === 'STATE') states.push(m.state) }))
  await page.goto('/alkkagi-preview.html?role=red')
  await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
  const initial = states.at(-1).gameId
  await page.getByText('아이템 수치 조절 · 로컬 임시값', { exact: true }).click()
  await page.getByLabel('힘 강화 배율', { exact: true }).fill('1.8')
  await page.getByRole('button', { name: '아이템 설정 적용하고 새 판', exact: true }).click()
  await expect.poll(() => states.at(-1)?.gameId).not.toBe(initial)
  expect(states.at(-1).itemRules.powerMultiplier).toBe(1.8)
  expect(states.at(-1).settings.maximumImpulse).toBe(30)
  const gameId = states.at(-1).gameId
  await page.getByLabel('벽 길이', { exact: true }).fill('99')
  await page.getByRole('button', { name: '아이템 설정 적용하고 새 판', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('아이템 조절 범위')
  expect(states.at(-1).gameId).toBe(gameId)
  await page.getByLabel('벽 길이', { exact: true }).fill('1.6')
  await page.getByLabel('힘 강화 배율', { exact: true }).fill('1.5')
  await page.getByRole('button', { name: '아이템 설정 적용하고 새 판', exact: true }).click()
  await expect.poll(() => states.at(-1)?.itemRules.powerMultiplier).toBe(1.5)
})
