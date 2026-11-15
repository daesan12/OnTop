import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { parkFixture } from './fixture'
import { composeHangul } from '../../src/features/parkXR/hangul'

const helper = '/tests/park-xr/syntheticXR.ts'

test('220m 공원 VR에서 주변 닉네임을 보고 이동 입력을 막은 채 한글 채팅을 보낸다', async ({ page }, info) => {
  expect(composeHangul([... 'ㅇㅏㄴㄴㅕㅇ ㅎㅏㅅㅔㅇㅛ'])).toBe('안녕 하세요')
  expect(composeHangul([... 'ㅇㅣㄹㄱㅇㅓㅂㅗㅏ'])).toBe('읽어봐')
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }))
  const server = await parkFixture(page, { carrySupported: true })
  const now = new Date().toISOString()
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: { mode: 'NORMAL', notice: '',
    maintenanceStartedAt: null, expectedOpenAt: null, version: 1, updatedAt: now, serverTime: now } }))
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: { announcements: [], serverTime: now,
    refreshAt: new Date(Date.now() + 10000).toISOString() } }))
  await page.goto('/park')
  const start = page.getByRole('button', { name: '공원 VR 시작', exact: true })
  await expect(start).toBeEnabled({ timeout: 90000 })
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
  await page.evaluate(async p => { const xr = await import(p); xr.install(); xr.height(1.3) }, helper)
  await start.click()
  const snapshot = () => page.evaluate(async p => (await import(p)).snapshot(), helper)
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  await expect.poll(async () => {
    const state = await snapshot()
    return state.position[1] - (state.pose.y - .8)
  }).toBeCloseTo(1.65, 2)
  const own = { ...(await snapshot()).pose, moving: false, running: false, swimming: false, lastInputSeq: 0 }
  server.emit('WORLD_STATE', { channelId: 'channel-1', version: 100, mapVersion: server.mapIdentity.mapVersion,
    avatars: [ { userId: '101', position: own, vrActive: true },
      { userId: '102', nickname: '옆 산책자', position: { ...own, x: own.x + 1.5 } } ] })
  const visible = (name: string) => page.evaluate(async ({ p, name }) => (await import(p)).visibleXRObject(name), { p: helper, name })
  await expect.poll(() => visible('park-xr-nickname')).toBe(true)

  await page.evaluate(async p => (await import(p)).buttons({ chat: true }), helper)
  await expect.poll(() => page.evaluate(async p => (await import(p)).xrCanvasInView('park-xr-chat'), helper)).toBe(true)
  const before = server.requests.length
  await page.evaluate(async p => (await import(p)).input(1, true), helper)
  const press = async (x: number, y: number) => {
    await page.evaluate(async ({ p, x, y }) => {
      const xr = await import(p); xr.aimCanvas('park-xr-chat', x / 1536, y / 1024); xr.buttons({ trigger: false })
    }, { p: helper, x, y })
    await page.waitForTimeout(120)
    await page.evaluate(async p => (await import(p)).buttons({ trigger: true }), helper)
    await page.waitForTimeout(120)
  }
  await press(762, 628) // ㅎ
  await press(1140, 628) // ㅏ
  await press(1105, 905) // 보내기
  await expect.poll(() => server.requests.find(r => r.type === 'WORLD_CHAT_SEND')?.payload.text).toBe('하')
  const frame = await page.evaluate(async p => (await import(p)).sceneFramePNG(), helper)
  await writeFile(info.outputPath('park-vr-chat.png'), Buffer.from(frame.split(',')[1]!, 'base64'))
  expect(server.requests.slice(before).some(r => r.type === 'WORLD_MOVE' && (r.payload.dz || r.payload.jump))).toBe(false)
  await expect.poll(async () => (await snapshot()).active).toBe(true)
  await press(1350, 905)
  await expect.poll(() => visible('park-xr-chat')).toBe(false)
  await page.evaluate(async p => (await import(p)).input(0, false, 0, true), helper)
  await expect.poll(async () => (await snapshot()).active).toBe(false)
})
