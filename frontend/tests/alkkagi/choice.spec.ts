import { expect, test, type Page } from '@playwright/test'

async function reachChoice(page: Page) {
  const sockets: WebSocket[] = [], states: any[] = [], hands: any[] = []
  const wait = async (fn: () => boolean) => {
    const end = Date.now() + 15000
    while (!fn()) { if (Date.now() > end) throw new Error('card choice setup timeout'); await new Promise(r => setTimeout(r, 20)) }
  }
  try {
    for (const [actor, role] of ['red', 'green'].entries()) {
      const ws = new WebSocket(`ws://127.0.0.1:19183/dev/alkkagi-ws?role=${role}`); sockets.push(ws)
      ws.addEventListener('message', event => { const m = JSON.parse(String(event.data)); if (m.type === 'STATE') states[actor] = m.state; if (m.type === 'PRIVATE_STATE') hands[actor] = m.state })
      await wait(() => ws.readyState === WebSocket.OPEN && !!states[actor])
    }
    const old = states[0].gameId; sockets[0].send(JSON.stringify({ type: 'RESET' }))
    await wait(() => states[0].gameId !== old && states[0].stage === 'WAITING')
    await page.goto('/alkkagi-preview.html?role=red')
    await expect(page.getByText('연결됨', { exact: true })).toBeVisible()
    sockets[0].send(JSON.stringify({ type: 'START' })); await wait(() => states[0].stage === 'AIMING')
    for (let turn = 0; turn < 20 && states[0].stage !== 'CHOOSING'; turn++) {
      const s = states[0], actor = s.turn
      const p = s.pieces.filter((p: any) => p.alive && p.owner === actor).sort((a: any, b: any) =>
        Math.min(4.5 - Math.abs(a.x), 5 - Math.abs(a.y)) - Math.min(4.5 - Math.abs(b.x), 5 - Math.abs(b.y)))[0]
      const horizontal = 4.5 - Math.abs(p.x) < 5 - Math.abs(p.y)
      sockets[actor].send(JSON.stringify({ type: 'SHOT', gameId: s.gameId, actionId: `setup-${turn}`, expectedVersion: s.version,
        pieceId: p.id, dx: horizontal ? Math.sign(p.x) || 1 : 0, dy: horizontal ? 0 : Math.sign(p.y) || 1, power: 1 }))
      await wait(() => states[0].simulationId > s.simulationId)
      await wait(() => states[0].stage !== 'SIMULATING')
    }
    await wait(() => states[0].stage === 'CHOOSING' && !!hands[0]?.choice)
    return { sockets, states, hands, wait }
  } catch (e) { sockets.forEach(s => s.close()); throw e }
}

test('세 알 손실 뒤 후보3개를 선택하고 발사30초를 별도로 받는다', async ({ page }) => {
  test.setTimeout(60000)
  const room = await reachChoice(page)
  try {
    const modal = page.getByRole('dialog', { name: '카드 선택' })
    await expect(modal).toBeVisible(); await expect(modal.locator('button')).toHaveCount(3)
    const c = room.hands[0].choice, selected = c.options[1].type
    expect(room.states[0].pausedTurnMillis).toBe(30000)
    await modal.screenshot({ path: '.vite-cache/alkkagi-test-results/choice-three.png' })
    await modal.locator('button').nth(1).click()
    await expect(modal).toHaveCount(0)
    await room.wait(() => room.hands[0].cards.some((x: any) => x.type === selected))
    await room.wait(() => room.states[0].stage === 'AIMING')
    expect(room.states[0].turnDeadline - room.states[0].serverNow).toBeGreaterThan(28000)
    expect(room.hands[0].cards).toHaveLength(1)
  } finally { room.sockets.forEach(s => s.close()) }
})

test('재접속해도 같은 후보·기한이며 10초 만료시 서버가 한장만 랜덤 확정한다', async ({ page }) => {
  test.setTimeout(60000)
  const room = await reachChoice(page)
  try {
    const c = room.hands[0].choice, recovered: any[] = []
    page.on('websocket', ws => ws.on('framereceived', frame => {
      const m = JSON.parse(String(frame.payload)); if (m.type === 'PRIVATE_STATE') recovered.push(m.state)
    }))
    await page.reload()
    await expect(page.getByRole('dialog', { name: '카드 선택' })).toBeVisible()
    await expect.poll(() => recovered.find(h => h.choice?.id === c.id)?.choice.deadline).toBe(c.deadline)
    await room.wait(() => room.states[0].stage === 'AIMING' && room.hands[0].cards.length === 1)
    expect(c.options.some((o: any) => o.type === room.hands[0].cards[0].type)).toBe(true)
    expect(room.states[0].turnDeadline).toBe(c.deadline + 30000)
    await expect(page.getByRole('dialog', { name: '카드 선택' })).toHaveCount(0)
  } finally { room.sockets.forEach(s => s.close()) }
})
