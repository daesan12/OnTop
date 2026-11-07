import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { identity, parkFixture } from '../park-integration/fixture'
import { disabledJumpmapStatus } from '../fixtures/jumpmap'
import { COURSE, START } from '../../src/features/jumpmap/course'

const xr = '/tests/park-xr/syntheticXR.ts'
for (const haptics of [true, false]) test(`점프맵 VR 도약·착지와 중단 처리 (${haptics ? '진동 지원' : '진동 미지원'})`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'xr', { configurable: true, value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) })
    const urls = new WeakMap<ArrayBuffer, string>(), buffers = new WeakMap<AudioBuffer, string>()
    const starts: string[] = []; (window as unknown as { xrAudioStarts: string[] }).xrAudioStarts = starts
    const read = Response.prototype.arrayBuffer
    Response.prototype.arrayBuffer = async function () { const data = await read.call(this); urls.set(data, this.url); return data }
    const decode = AudioContext.prototype.decodeAudioData
    AudioContext.prototype.decodeAudioData = function (data: ArrayBuffer) {
      return decode.call(this, data).then(buffer => { buffers.set(buffer, urls.get(data) ?? ''); return buffer })
    }
    const create = AudioContext.prototype.createBufferSource
    AudioContext.prototype.createBufferSource = function () {
      const node = create.call(this), start = node.start
      node.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
        starts.push(node.buffer ? buffers.get(node.buffer) ?? '' : ''); start.apply(node, args)
      }
      return node
    }
  })
  const server = await parkFixture(page, { carrySupported: true })
  await page.route('**/api/v1/operations/status', r => r.fulfill({ json: { mode: 'NORMAL', notice: '', version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(), maintenanceStartedAt: null, expectedOpenAt: null } }))
  await page.route('**/api/v1/announcements', r => r.fulfill({ json: { serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [] } }))
  await page.route('**/api/v1/minigames/jumpmap/status?**', r => r.fulfill({ json: { ...disabledJumpmapStatus('channel-1'), enabled: true } }))
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop')
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.getByText('공원을 준비하고 있어요…', { exact: true })).toBeHidden({ timeout: 90000 })
  server.place({ x: START.x, y: .8, z: START.z })
  await expect(page.getByRole('button', { name: '돌탑 점프맵 VR 시작', exact: true })).toBeEnabled()
  await page.evaluate(async ({ xr, haptics }) => (await import(xr)).install({ haptics }), { xr, haptics })
  await page.getByRole('button', { name: '돌탑 점프맵 VR 시작', exact: true }).click()
  const state = () => page.evaluate(async p => (await import(p)).snapshot(), xr)
  const feedback = () => page.evaluate(async p => (await import(p)).feedbackSnapshot(), xr)
  const audio = () => page.evaluate(() => (window as unknown as { xrAudioStarts: string[] }).xrAudioStarts)
  const jumpCount = async () => (await audio()).filter(url => url.endsWith('/move-jump.ogg')).length
  const landCount = async () => (await audio()).filter(url => url.endsWith('/stone.wav')).length
  await expect.poll(async () => (await state()).active).toBe(true)
  const pad = COURSE[0]!, y = pad.top + .8
  const place = async (dy: number) => { server.place({ x: pad.x, y: y + dy, z: pad.z }); await page.waitForTimeout(105) }
  await place(0); await page.waitForTimeout(200)
  // Exercise actual A input; fixture poses supply the server's resulting trajectory.
  await page.evaluate(async p => (await import(p)).input(0, true), xr)
  await expect.poll(() => server.requests.some(r => r.type === 'WORLD_MOVE' && r.payload.jump)).toBe(true)
  await place(.7); await place(.3); await place(0)
  await page.evaluate(async p => (await import(p)).input(0), xr)
  await expect.poll(jumpCount).toBe(1); await expect.poll(landCount).toBe(1)
  expect((await feedback()).pulses).toHaveLength(haptics ? 4 : 0)
  if (haptics) {
    const pulses = (await feedback()).pulses
    expect(pulses.map((p: { hand: string }) => p.hand)).toEqual(['left', 'right', 'left', 'right'])
    expect(pulses[0].duration).toBe(40); expect(pulses[2].duration).toBeGreaterThan(40)
  }
  await page.waitForTimeout(200)
  server.emit('JUMPMAP_STEP', { channelId: 'channel-1', mapVersion: identity.mapVersion, playerId: '101', block: 0 })
  await page.waitForTimeout(200); expect(await landCount()).toBe(1)
  await page.evaluate(async p => (await import(p)).buttons({ guide: true }), xr)
  await expect.poll(async () => (await state()).view?.key).toBe('guide')
  await page.evaluate(async p => (await import(p)).buttons({ guide: false }), xr)
  await place(.7); await place(.3); await place(0)
  expect(await jumpCount()).toBe(1); expect(await landCount()).toBe(1)
  expect((await feedback()).pulses).toHaveLength(haptics ? 4 : 0)
  await page.evaluate(async p => (await import(p)).input(0, true), xr)
  await expect.poll(async () => (await state()).view?.key).toBe('roaming')
  await page.evaluate(async p => (await import(p)).input(0), xr)
  await page.evaluate(async p => (await import(p)).visibility('visible-blurred'), xr)
  await place(.7); await place(.3); await place(0)
  await page.evaluate(async p => (await import(p)).visibility('visible'), xr)
  await page.waitForTimeout(150)
  expect(await jumpCount()).toBe(1); expect(await landCount()).toBe(1)
  await page.evaluate(async p => (await import(p)).input(0, true), xr)
  await expect.poll(() => server.requests.filter(r => r.type === 'WORLD_MOVE' && r.payload.jump).length).toBe(2)
  await place(.7); await place(.3); await place(0)
  await page.evaluate(async p => (await import(p)).input(0), xr)
  await expect.poll(jumpCount).toBe(2); await expect.poll(landCount).toBe(2)
  const frame = await page.evaluate(async p => (await import(p)).sceneFramePNG(), xr)
  await writeFile(info.outputPath('jump-feedback.png'), Buffer.from(frame.split(',')[1]!, 'base64'))
  await page.evaluate(async p => (await import(p)).input(0, false, 0, true), xr)
  await expect.poll(async () => (await state()).active).toBe(false)
  if (haptics) expect((await feedback()).resets).toBeGreaterThan(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
