import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { fixture } from '../e2e/contractFixture'
import { loadRenewalFixtureMap } from './fixture'

const helper = '/tests/park-xr/syntheticXR.ts'

test('공원 VR을 유지하며 오목 착석부터 정산 후 퇴장까지 진행한다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const renewal = process.env.PARK_XR_MAP === 'renewal' ? loadRenewalFixtureMap() : undefined
  const anchor = renewal?.data.tables[0]
  const approach = anchor?.interactionPoints?.[0]
  const server = await fixture(page, { generatedPark: true, omok: true, ownUserId: '101', manualLobby: true, tabletServer: true, carry: true,
    ...(renewal && anchor && approach ? { connectedMap: renewal.identity, mapVersion: renewal.identity.mapVersion,
      anchorId: anchor.id, position: { x: approach[0], y: approach[1] + .8, z: approach[2], yaw: 0 } } : {}),
  })
  const seen = (type: string) => server.sent.filter(message => message.type === type).at(-1)?.payload
  const snapshot = () => page.evaluate(async p => (await import(p)).snapshot(), helper)
  const lobby = 'park-xr-omok-lobby', hud = 'park-xr-omok'
  const visible = (name: string) => page.evaluate(async ({ p, name }) => (await import(p)).xrCanvasInView(name), { p: helper, name })
  async function select(name: string, x: number, y: number) {
    await page.evaluate(async ({ p, name, x, y }) => {
      const xr = await import(p)
      xr.buttons({})
      if (name === 'board') xr.aimOmok(x, y)
      else xr.aimCanvas(name, x, y)
      await new Promise(resolve => setTimeout(resolve, 120))
      xr.buttons({ trigger: true })
      await new Promise(resolve => setTimeout(resolve, 120))
      xr.buttons({})
    }, { p: helper, name, x, y })
  }
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  const enterVR = page.getByRole('button', { name: '공원 VR 시작', exact: true })
  await expect(enterVR).toBeEnabled({ timeout: 90000 })
  await page.evaluate(async p => (await import(p)).install(), helper)
  await enterVR.click()
  await expect.poll(() => snapshot()).toMatchObject({ active: true, mode: 'park' })
  await expect.poll(() => visible(lobby)).toBe(true)
  server.tableJoinMode('hold')
  await select(lobby, .5, 580 / 940)
  await expect.poll(() => seen('TABLE_JOIN')).toMatchObject({ tableId: expect.any(String) })
  expect(await snapshot()).toMatchObject({ active: true })
  server.approveTableJoins()
  server.host('101')
  await expect(page.getByRole('dialog', { name: '게임 태블릿', exact: true })).toBeAttached()
  await expect.poll(() => server.walletReads).toBeGreaterThanOrEqual(2)
  await expect.poll(() => visible(lobby)).toBe(true)
  await select(lobby, 886 / 1536, 389 / 940)
  await select(lobby, 1109 / 1536, 765 / 940)
  await expect.poll(() => seen('TABLE_CONFIGURE')).toMatchObject({ gameCode: 'OMOK', selectedPlayers: 2, betAmountPerPlayer: 1 })
  await expect(page.getByText('참가 금액을 확인했어요', { exact: true })).toBeAttached()
  const preparation = await page.evaluate(async p => (await import(p)).sceneFramePNG(), helper)
  await writeFile(info.outputPath('omok-vr-preparation.png'), Buffer.from(preparation.split(',')[1]!, 'base64'))
  await select(lobby, .5, 593 / 940)
  expect(seen('READY_SET')).toBeUndefined()
  await select(lobby, .5, 593 / 940)
  await expect.poll(() => seen('READY_SET')).toMatchObject({ ready: true, betAmountPerPlayer: 1 })
  server.readyTabletOthers(true)
  await select(lobby, 1109 / 1536, 593 / 940)
  await expect.poll(() => seen('TABLE_START')).toMatchObject({ actionId: expect.any(String) })
  server.omokColors('102')
  await expect.poll(() => visible(hud)).toBe(true)
  await expect.poll(() => page.evaluate(async p => (await import(p)).faceOmok(), helper)).toBe(true)
  await select('board', 7, 7)
  expect(seen('GAME_ACTION_SEND')).toBeUndefined()
  server.opponentMove()
  await select('board', 7, 7)
  await expect.poll(() => seen('GAME_ACTION_SEND')).toMatchObject({ input: { x: 7, y: 7 } })
  expect(await snapshot()).toMatchObject({ active: true, mode: 'omok' })
  server.finishGame()
  server.settle()
  server.nextRound()
  await expect.poll(() => visible(lobby)).toBe(true)
  await select(lobby, .5, 755 / 940)
  await expect(page.getByRole('dialog', { name: '게임 태블릿', exact: true })).toBeVisible()
  await select(lobby, 243 / 1536, 765 / 940)
  await expect.poll(() => seen('TABLE_LEAVE')).toBeDefined()
  await expect.poll(() => snapshot()).toMatchObject({ active: true, mode: 'park' })
  expect(errors).toEqual([])
})

test('기존 오목 대국을 VR에서 이어 두고 B로 일반 화면에 돌아온다', async ({ page }, info) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const renewal = process.env.PARK_XR_MAP === 'renewal' ? loadRenewalFixtureMap() : undefined
  const anchor = renewal?.data.tables[0]
  const approach = anchor?.interactionPoints?.[0]
  const server = await fixture(page, { generatedPark: true, omok: true, ownUserId: '101', manualLobby: true, tabletServer: true,
    ...(renewal && anchor && approach ? { connectedMap: renewal.identity, mapVersion: renewal.identity.mapVersion,
      anchorId: anchor.id, position: { x: approach[0], y: approach[1] + .8, z: approach[2], yaw: 0 } } : {}),
  })
  await page.goto('/park')
  await page.getByRole('button', { name: 'E 테이블에 앉기', exact: true }).click({ timeout: 90000 })
  server.host('101')
  const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
  await tablet.getByLabel('1인 참가비').fill('1')
  await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
  await tablet.getByRole('checkbox', { name: '참가 금액을 확인했어요' }).check()
  await tablet.getByRole('button', { name: '준비 완료', exact: true }).click()
  server.readyTabletOthers(true)
  await tablet.getByRole('button', { name: '게임 시작', exact: true }).click()
  server.omokColors('101')
  await page.evaluate(async p => (await import(p)).install(), helper)
  await page.getByRole('button', { name: '오목 VR 시작', exact: true }).click()
  const snapshot = () => page.evaluate(async p => (await import(p)).snapshot(), helper)
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  await expect.poll(() => page.evaluate(async p => (await import(p)).xrCanvasInView('park-xr-omok'), helper)).toBe(true)
  server.turnTo('101')
  await expect.poll(() => page.evaluate(async p => (await import(p)).faceOmok(), helper)).toBe(true)
  await page.evaluate(async p => (await import(p)).aimOmok(7, 7), helper)
  await page.waitForTimeout(120)
  await page.evaluate(async p => (await import(p)).buttons({ trigger: true }), helper)
  await expect.poll(() => server.sent.find(m => m.type === 'GAME_ACTION_SEND')?.payload.input).toEqual({ x: 7, y: 7 })
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  const frame = await page.evaluate(async p => (await import(p)).sceneFramePNG(), helper)
  await writeFile(info.outputPath('omok-vr-board.png'), Buffer.from(frame.split(',')[1]!, 'base64'))
  await page.evaluate(async p => (await import(p)).input(0, false, 0, true), helper)
  await expect.poll(async () => (await snapshot()).active).toBe(false)
  await expect(page.getByRole('region', { name: '오목 경기', exact: true })).toBeVisible()
})
