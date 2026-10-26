import { test, expect } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
])
  test(
    'shared socket OMOK: select, ready, confirmed start, reject, ack, state, recovery, settlement ' +
      viewport.width,
    async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      await page.setViewportSize(viewport)
      const server = await fixture(page, { omok: true })
      await page.goto('/park')
      await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
      await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({
        timeout: 90_000,
      })
      await expect(page).toHaveTitle(/온탑|OnTop/i)
      await expect(page.locator('vite-error-overlay')).toHaveCount(0)
      await page.locator('canvas').click({ position: { x: 80, y: 300 } })
      await page.keyboard.press('KeyE')
      await page.getByRole('button', { name: '앉기', exact: true }).click()
      await page.getByLabel('1인 참가비').fill('1'); await page.getByRole('button', { name: '오목 선택', exact: true }).click()
      expect(
        server.sent.find((m) => m.type === 'GAME_SELECT')?.payload,
      ).toEqual({
        gameCode: 'OMOK',
        betAmountPerPlayer: 1,
      })
      await page.getByRole('button', { name: '준비', exact: true }).click()
      await expect(
        page.getByText('서버가 참가·시작을 확인하고 있습니다.'),
      ).toBeVisible()
      const ready = server.sent.find((m) => m.type === 'READY_SET')?.payload
      expect(ready).toEqual({ ready: true, betAmountPerPlayer: 1, expectedVersion: expect.any(Number) })
      expect(Number.isSafeInteger(ready?.expectedVersion)).toBe(true)
      await expect(
        page.getByRole('group', { name: '오목판', exact: true }),
      ).toHaveCount(0)
      server.confirmStart()
      const panel = page.locator('[aria-label="오목 경기"], .gathering-hud[data-phase="finished"]')
      await panel.getByText('키보드로 오목판 조작', { exact: true }).click()
      const cell = panel.getByRole('button', {
        name: '8행 8열 빈칸',
        exact: true,
      })
      await expect(cell).toBeEnabled()
    await expect(panel.getByRole('group',{name:'오목판',exact:true})).toBeInViewport({ratio:1})
    await expect(panel.getByRole('button',{name:'최신 판 확인'})).toBeInViewport()
      server.forbidNext()
      await cell.click()
      await expect(panel.getByRole('alert')).toContainText('금수')
      await expect(cell).toBeEnabled()
      server.holdState(true)
      await cell.click()
      await expect(
        panel.getByText('착수 확인 수신 · 최신 판을 기다리고 있습니다.'),
      ).toBeVisible()
      await expect(cell).toBeDisabled()
      expect(
        server.sent.filter((m) => m.type === 'GAME_ACTION_SEND'),
      ).toHaveLength(2)
      const move = server.sent
        .filter((m) => m.type === 'GAME_ACTION_SEND')
        .at(-1)!
      expect(move.payload).toMatchObject({
        gameId: 'fixture-confirmed-omok',
        expectedVersion: 0,
        input: { x: 7, y: 7 },
      })
      expect(Object.keys(move.payload).sort()).toEqual([
        'actionId',
        'expectedVersion',
        'gameId',
        'input',
      ])
      server.flushGame()
      await expect(
        panel.getByRole('button', { name: '8행 8열 흑돌', exact: true }),
      ).toBeVisible()
      await expect(panel).toContainText('상대 차례')
      server.opponentMove()
      await expect(panel).toContainText('내 차례')
      server.recoveryPending()
      await expect(
        panel.getByRole('button', { name: '8행 9열 빈칸', exact: true }),
      ).toBeDisabled()
      server.restoreGame()
      await expect(
        panel.getByRole('button', { name: '8행 9열 빈칸', exact: true }),
      ).toBeEnabled()
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const q = await import('/tests/e2e/sceneProbe.ts' as string)
            return q.omokGeometry().counts
          }),
        )
        .toEqual([1, 1])
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const q = await import('/tests/e2e/sceneProbe.ts' as string)
            return q.omokCameraReady()
          }),
        )
        .toBe(true)
      const point = await page.evaluate(async () => {
        const q = await import('/tests/e2e/sceneProbe.ts' as string)
        return q.pointForOmok(8, 7)
      })
      await page.mouse.move(point.x, point.y)
      await page.mouse.down()
      await page.mouse.move(point.x + 20, point.y, { steps: 4 })
      await page.mouse.up()
      expect(
        server.sent.filter((m) => m.type === 'GAME_ACTION_SEND'),
      ).toHaveLength(2)
      await page.locator('canvas').click({ position: point })
      await expect
        .poll(
          () => server.sent.filter((m) => m.type === 'GAME_ACTION_SEND').length,
        )
        .toBe(3)
      expect(
        server.sent.filter((m) => m.type === 'GAME_ACTION_SEND').at(-1)!.payload
          .input,
      ).toEqual({ x: 8, y: 7 })
      server.flushGame()
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const q = await import('/tests/e2e/sceneProbe.ts' as string)
            return q.omokGeometry().counts
          }),
        )
        .toEqual([2, 1])
      await screenshot(
        page,
        'omok-confirmed-play' + (viewport.width === 1920 ? '' : '-1280'),
      )
      server.finishGame()
      await expect(panel).toContainText('승리')
      await expect(
        panel.getByRole('button', { name: '8행 10열 빈칸', exact: true }),
      ).toHaveCount(0)
      await panel.getByRole('button', { name: '정산 결과 확인' }).click()
      await expect(panel).toContainText('정산 대기 중')
      server.settle()
      await expect(panel).toContainText('정산 완료 · 내 엽전 증감 1')
      await expect(page.getByLabel('보유 엽전', { exact: true })).toHaveText('100냥')
      await screenshot(
        page,
        'omok-settlement' + (viewport.width === 1920 ? '' : '-1280'),
      )
      server.nextRound()
      await page.getByRole('button', { name: '다음 판 준비', exact: true }).click()
      await expect(
        page.getByRole('button', { name: '준비', exact: true }),
      ).toBeEnabled()
      expect(server.maxActive).toBe(1)
      expect(server.connections).toBe(1)
      expect(errors).toEqual([])
    },
  )
