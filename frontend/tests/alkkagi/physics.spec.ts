import { expect, test } from '@playwright/test'

test('실제 드래그 발사를 두 브라우저가 같은 서버 상태로 받고 새 관전자는 최신 판을 복구한다', async ({ page, context }) => {
  page.on('console', message => { if (message.type() === 'error') console.log(message.text()) })
  const red: any[] = [], green: any[] = []
  page.on('websocket', ws => ws.on('framereceived', f => {
    const m = JSON.parse(String(f.payload)); if (m.type === 'STATE') red.push(m)
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
  await page.getByRole('button', { name: '테스트 시작' }).click()
  await expect.poll(() => red.at(-1)?.state.stage).toBe('AIMING')
  const rect = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * .60)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * .78, { steps: 15 })
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
})
