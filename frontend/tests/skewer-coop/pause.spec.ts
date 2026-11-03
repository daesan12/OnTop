import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

// 실제 React/3D 화면을 사용하고 통신만 대체한다. 공동 시계 동결은 엔진 테스트에서 별도로 검증한다.
async function mount(page: Page, role = 'server') {
  await page.goto('/skewer-service-hall.html')
  await page.evaluate(async role => {
    const load = (url: string) => import(/* @vite-ignore */ url)
    const source = await (await fetch('/src/features/skewer/coop/CoopHost.tsx')).text()
    const React = (await load(source.match(/from\s*["']([^"']*\/react\.js[^"']*)["']/)![1])).default
    const main = await (await fetch('/src/skewer-service-hall-main.tsx')).text()
    const dom = await load(main.match(/from\s*["']([^"']*react-dom_client[^"']*)["']/)![1])
    const { default: Host } = await load('/src/features/skewer/coop/CoopHost.tsx')
    const { HallPreview } = await load('/src/features/skewer/serviceHall/previewModel.ts')
    const { ChefPreview } = await load('/src/features/skewer/chef/model.ts')
    const hall = new HallPreview(); hall.held = [4, 6]; hall.carry = hall.pass.slice(0, 2); hall.sake = 2
    const snapshot = { gameId: 'skewer-coop-00000000-0000-4000-8000-000000000001', registered: true, version: 1,
      publicState: { gameCode: 'SKEWER_COOP', phase: 'PLAYING', channelId: 'park', remaining: 181, elapsed: 59, countdown: 0, score: 420, served: 3,
        paused: false, pausedBy: [] as string[], pauseReason: '', actionVersion: 0, rankingEligible: false, chefVR: false, entryFee: 0, rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: null,
        players: [{ userId: 'me', role, ready: true, connected: true }, { userId: 'friend', role: role === 'server' ? 'chef' : 'server', ready: true, connected: true }],
        greeting: { active: false, index: 0, remaining: 5, answered: false, responded: 0, speech: false } },
      privateState: role === 'server' ? { role, hall: hall.view() } : { role, chef: new ChefPreview().view() } }
    let listener: (value: any) => void = () => {}; let fail = false
    const sent: any[] = [], pub = snapshot.publicState
    const push = () => { pub.paused = pub.pausedBy.length > 0; pub.pauseReason = pub.paused ? 'EXIT_CONFIRM' : ''; snapshot.version++; listener({ type: 'GAME_STATE', payload: structuredClone(snapshot) }) }
    const transport = { scope: () => ({ userId: 'me', channelId: 'park', connected: true }), subscribe: (fn: any) => { listener = fn; return () => {} },
      request: async (type: string, payload: any) => {
        sent.push({ type, input: payload.input })
        if (type === 'GAME_ACTION_SEND') {
          if (fail) throw Error('fixture request failure')
          if (payload.input.type === 'PAUSE') {
            pub.pausedBy = pub.pausedBy.filter(id => id !== 'me')
            if (payload.input.paused) pub.pausedBy.push('me')
          }
          pub.actionVersion++; push()
        }
        return { type: type === 'GAME_STATE_CHECK' ? 'GAME_STATE' : 'GAME_ACTION_RESULT', payload: structuredClone(snapshot) }
      },
      requestJSON: async (url: string) => url.includes('/result') ? { gameId: snapshot.gameId, status: 'UNAVAILABLE' } : { mine: structuredClone(snapshot), rooms: [] } }
    const root = (dom.createRoot ?? dom.default.createRoot)(document.body.appendChild(document.createElement('div')))
    root.render(React.createElement(Host, { transport, onClose: () => { (window as any).pauseFixture.closed = true; root.unmount() } }))
    ;(window as any).pauseFixture = { sent, snapshot, closed: false,
      fail(value: boolean) { fail = value },
      friend(value: boolean) { pub.pausedBy = pub.pausedBy.filter(id => id !== 'friend'); if (value) pub.pausedBy.push('friend'); push() } }
  }, role)
  await expect(page.locator('.skewer-coop')).toHaveAttribute('data-phase', 'PLAYING')
  await expect(page.locator(role === 'server' ? '.skewer-coop .service-stage canvas' : '.skewer-coop .chef-stage canvas')).toBeVisible()
}

test('서빙 Esc 확인창·키보드 포커스·동시 일시정지·재개·기권', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await mount(page)
  await expect(page.locator('.skewer-coop .coop-exit')).toHaveCount(0)
  await page.keyboard.down('w'); await page.keyboard.press('Escape'); await page.keyboard.up('w')
  const dialog = page.getByRole('dialog', { name: '공원으로 나갈까요?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('잠시 쉬어가는 중')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '계속하기' })).toBeFocused()
  await page.keyboard.press('e'); await page.keyboard.press('g'); await page.keyboard.press('1')
  expect(await page.evaluate(() => (window as any).pauseFixture.sent.filter((a: any) => ['INTERACT', 'GREET', 'THREAD'].includes(a.input?.type)))).toHaveLength(0)
  if (process.env.SKEWER_COOP_EVIDENCE) {
    await mkdir(process.env.SKEWER_COOP_EVIDENCE, { recursive: true })
    await page.screenshot({ path: path.join(process.env.SKEWER_COOP_EVIDENCE, '02-escape-confirm.png') })
  }
  await page.evaluate(() => (window as any).pauseFixture.friend(true))
  await dialog.getByRole('button', { name: '계속하기' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('친구가 잠시 쉬고 있어요')).toBeVisible()
  await page.evaluate(() => (window as any).pauseFixture.friend(false))
  await expect(page.locator('.coop-pause')).toHaveCount(0)
  if (process.env.SKEWER_COOP_EVIDENCE) await page.screenshot({ path: path.join(process.env.SKEWER_COOP_EVIDENCE, '01-serving-game.png') })
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '계속하기' })).toBeEnabled()
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible()
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '나가기', exact: true }).click()
  expect(await page.evaluate(() => (window as any).pauseFixture.sent.some((a: any) => a.type === 'GAME_FORFEIT'))).toBe(true)
  await expect(page.locator('.skewer-coop')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('요리사도 Esc로 멈추며 재개 실패시 확인창을 유지하고 재시도한다', async ({ page }) => {
  await mount(page, 'chef')
  await page.keyboard.press('Escape')
  const dialog = page.getByRole('dialog', { name: '공원으로 나갈까요?' })
  await expect(dialog.getByText('잠시 쉬어가는 중')).toBeVisible()
  await page.evaluate(() => (window as any).pauseFixture.fail(true))
  await dialog.getByRole('button', { name: '계속하기' }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await page.evaluate(() => (window as any).pauseFixture.fail(false))
  await dialog.getByRole('button', { name: '계속하기' }).click()
  await expect(dialog).not.toBeVisible()
})

test('로컬 연습도 Esc로 시간과 입력을 멈추고 계속하기로 재개한다', async ({ page }) => {
  await page.goto('/skewer-service-hall.html')
  await expect(page.locator('.service-stage canvas')).toBeVisible()
  await page.keyboard.press('Escape')
  const dialog = page.getByRole('dialog', { name: '공원으로 나갈까요?' })
  await expect(dialog).toBeVisible()
  const clock = page.getByTestId('remaining-time')
  const before = await clock.textContent()
  await page.waitForTimeout(1500)
  expect(await clock.textContent()).toBe(before)
  await dialog.getByRole('button', { name: '계속하기' }).click()
  await expect(clock).not.toHaveText(before!)
})
