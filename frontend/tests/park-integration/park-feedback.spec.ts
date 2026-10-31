import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { parkFixture } from './fixture'
import { fixture } from '../e2e/contractFixture'

const artifacts = process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-park-feedback')
const errors = new WeakMap<import('@playwright/test').Page, string[]>()
test.beforeEach(({ page }) => {
  const messages: string[] = []; errors.set(page, messages)
  page.on('pageerror', error => messages.push(error.message))
  page.on('console', message => { if (message.type() === 'error') messages.push(message.text()) })
})
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]) })

async function load(page: import('@playwright/test').Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 })
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await fs.mkdir(artifacts, { recursive: true })
}

test('running toward pigeons starts a decoded spatial takeoff sound only when they scatter', async ({ page }) => {
  const bytes = (await fs.stat(new URL('../../public/audio/bgm/amb-pigeon-takeoff.ogg', import.meta.url))).size
  await page.addInitScript(bytes => {
    const buffers = new WeakSet<AudioBuffer>()
    const decode = AudioContext.prototype.decodeAudioData
    AudioContext.prototype.decodeAudioData = async function (data: ArrayBuffer) {
      const pigeon = data.byteLength === bytes
      const buffer = await decode.call(this, data)
      if (pigeon) buffers.add(buffer)
      return buffer
    }
    const create = AudioContext.prototype.createBufferSource
    ;(window as any).pigeonSounds = []
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this), start = source.start.bind(source)
      source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
        if (source.buffer && buffers.has(source.buffer)) {
          const samples = source.buffer.getChannelData(0)
          ;(window as any).pigeonSounds.push({ duration: source.buffer.duration,
            audible: samples.some(value => Math.abs(value) > .01) })
        }
        return start(...args)
      }
      return source
    }
  }, bytes)
  const server = await parkFixture(page)
  await load(page)
  const bird = await page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).migrationFollowupsProbe().birdModes[0])
  server.place({ x: bird.x, y: bird.y + .72, z: bird.z + 5, yaw: Math.PI })
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).renderedOwnPosition()?.[2])).toBeCloseTo(bird.z + 5, 0)
  await page.locator('canvas').click()
  await page.keyboard.down('w')
  try {
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => (window as any).pigeonSounds.length)).toBe(0)
    await page.keyboard.down('Shift')
    await expect.poll(() => page.evaluate(async () =>
      (await import('/tests/park-integration/probe.ts' as string)).migrationFollowupsProbe().birdModes.some((b: { mode: string }) => b.mode === 'fly'))).toBe(true)
    await expect.poll(() => page.evaluate(() => (window as any).pigeonSounds.length)).toBeGreaterThan(0)
  } finally { await page.keyboard.up('w'); await page.keyboard.up('Shift') }
  const sounds = await page.evaluate(() => (window as any).pigeonSounds as { duration: number; audible: boolean }[])
  expect(sounds.length).toBeLessThanOrEqual(2)
  expect(sounds.every(sound => sound.duration > 0 && sound.audible)).toBe(true)
  await page.screenshot({ path: path.join(artifacts, 'pigeon-takeoff.png') })
})

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test(`tablet game list scrolls without moving the detail or overflowing at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await fixture(page, { generatedPark: true, omok: true, manualLobby: true, tabletServer: true })
    await load(page)
    await page.locator('canvas').focus()
    await page.keyboard.press('KeyE')
    const tablet = page.getByRole('dialog', { name: '게임 태블릿', exact: true })
    await expect(tablet).toBeVisible({ timeout: 20000 })
    await expect.poll(() => tablet.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.99)
    const list = tablet.getByRole('group', { name: '게임 선택', exact: true })
    await list.scrollIntoViewIfNeeded()
    await expect.poll(() => list.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)
    const detail = tablet.locator('.tablet-selection-detail'), before = await detail.boundingBox()
    const box = (await list.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 900)
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
    await expect(list.locator('.tablet-coming')).toBeInViewport()
    const after = (await detail.boundingBox())!
    expect(Math.abs(after.y - before!.y)).toBeLessThan(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: path.join(artifacts, `tablet-scroll-${viewport.width}.png`) })
    // Scroll back, select another playable game, then prepare and leave through the existing contract.
    await list.getByRole('button', { name: /원카드.*2~4인/ }).click()
    await expect(detail.getByRole('heading', { name: '원카드', exact: true })).toBeVisible()
    await tablet.getByLabel('1인 참가비').fill('20')
    await tablet.getByRole('button', { name: '선택하고 준비하기' }).click()
    await expect(tablet.getByRole('heading', { name: '오목' })).toBeVisible()
    await tablet.getByRole('button', { name: '일어나기', exact: true }).click()
    await expect(tablet).toHaveCount(0)
  })
}
