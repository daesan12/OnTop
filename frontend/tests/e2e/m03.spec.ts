import { expect, test, type Page } from '@playwright/test'
import { fixture, screenshot } from './contractFixture'
import { FITNESS_STATIONS } from '../../src/config'

async function probe(page: Page): Promise<ReturnType<typeof import('./sceneProbe').characterProbe>> {
  return page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).characterProbe())
}
async function loaded(page: Page) {
  await page.goto('/park')
  await expect(page).toHaveTitle('OnTop')
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible()
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90_000 })
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).fixtureProfiles())
  await expect.poll(async () => (await probe(page)).avatars.map(a => a.character)).toEqual(['girl', 'man'])
}

test('M03 renders both shipped rigs through approved movement and isolated action pose fixtures', async ({ page }) => {
  const errors: string[] = [], consoleErrors: string[] = [], assets = new Set<string>()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('response', response => { if (/characters\/(man|girl)\.glb/.test(response.url()) && response.ok()) assets.add(new URL(response.url()).pathname + new URL(response.url()).search) })
  const server = await fixture(page, { manualMovement: true, position: { x: 0, y: 0.8, z: 34, yaw: 0 } })
  await loaded(page)
  server.remotePose({ x: 2.2, y: 0.8, z: 34, yaw: 0, moving: true })
  server.pose({ moving: true })
  await expect.poll(async () => (await probe(page)).avatars.every(a => a.bones === 49 && a.near && a.visible)).toBe(true)
  server.pose({ running: true })
  server.remotePose({ running: true })
  await expect.poll(async () => (await probe(page)).avatars.every(a => a.elbow![0]! < -0.65)).toBe(true)
  server.pose({ moving: false, running: false })
  server.remotePose({ moving: false, running: false })
  await page.evaluate(async () => {
    const p = await import('/tests/e2e/sceneProbe.ts' as string)
    for (const id of ['101', '102']) p.fixtureCharacterPose(id, { swimming: true })
  })
  // Latest dev treads water upright at rest; full crawl tilt is only for movement.
  await expect.poll(async () => (await probe(page)).avatars.every(a => Math.abs(a.figureX! - .18) < .001)).toBe(true)
  for (let index = 0; index < FITNESS_STATIONS.length; index++) {
    await page.evaluate(async index => (await import('/tests/e2e/sceneProbe.ts' as string)).fixtureExercise(index), index)
    await expect.poll(async () => (await probe(page)).avatars.every(a => Number.isFinite(a.arm?.[0]) && a.figureX !== .18)).toBe(true)
  }
  await screenshot(page, 'm03-exercise-poses')
  await page.evaluate(async () => {
    const p = await import('/tests/e2e/sceneProbe.ts' as string)
    for (const id of ['101', '102']) p.fixtureCharacterPose(id, { fitnessId: '', swimming: false, emote: 'EMOTE_CLAP' })
  })
  await expect.poll(async () => (await probe(page)).avatars.every(a => a.arm![0]! < -0.4)).toBe(true)
  await screenshot(page, 'm03-characters-clap')
  await page.evaluate(async () => {
    const p = await import('/tests/e2e/sceneProbe.ts' as string)
    for (const id of ['101', '102']) p.fixtureCharacterPose(id, { emote: '', seatIndex: 0, tableId: 'fixture-server-table' })
  })
  await expect.poll(async () => (await probe(page)).avatars[0]!.visible).toBe(false)
  await expect.poll(async () => (await probe(page)).avatars[1]!.leg![0]).toBeCloseTo(-Math.PI / 2, 2)
  expect((await probe(page)).avatars[1]!.visible).toBe(true)
  await page.evaluate(async () => {
    const p = await import('/tests/e2e/sceneProbe.ts' as string)
    for (const id of ['101', '102']) p.fixtureCharacterPose(id, { emote: '', seatIndex: -1, tableId: '' })
  })
  await expect.poll(async () => (await probe(page)).avatars.every(a => a.visible && Math.abs(a.leg![0]!) < 0.01)).toBe(true)
  await expect.poll(async () => (await probe(page)).avatars[0]!.seatedCloth).toBe(0)
  expect([...assets].sort()).toEqual(['/art/characters/girl.glb?rig=6', '/art/characters/man.glb?rig=6'])
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
  expect(consoleErrors).toEqual([])
  expect(errors).toEqual([])
})

test('M03 preserves independent skeletons across LOD and releases player resources on repeated departure', async ({ page }) => {
  const errors: string[] = [], consoleErrors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  const server = await fixture(page, { manualMovement: true })
  await loaded(page)
  // Global GPU counts also include the rotating advertisements. Use a fixed poster-only
  // scene and wait for those uploads so a scheduled film is not mistaken for an avatar leak.
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).fixtureStaticAdvertisementClock())
  await expect.poll(async () => page.evaluate(async () =>
    (await import('/tests/e2e/sceneProbe.ts' as string)).advertisementPostersReady())).toBe(true)
  server.remotePose({ x: -7, y: 0.8, z: 21, moving: true })
  await expect.poll(async () => !!(await probe(page)).avatars[1]!.texture).toBe(true)
  const before = await probe(page), remote = before.avatars[1]!
  expect(remote.skeleton).not.toBe(before.avatars[0]!.skeleton)
  server.remotePose({ x: 25 })
  await expect.poll(async () => (await probe(page)).avatars[1]!.far).toBe(true)
  expect((await probe(page)).avatars[1]!.skeleton).toBe(remote.skeleton)
  server.remotePose({ x: -7 })
  await expect.poll(async () => (await probe(page)).avatars[1]!.near).toBe(true)
  // Skeleton allocation and LOD flags precede rendering. Require actual GPU bone-texture
  // uploads for both models before comparing resource counts, including on re-entry.
  await expect.poll(async () => (await probe(page)).avatars.every(a => a.textureUploaded)).toBe(true)
  const baseline = (await probe(page)).memory
  for (let i = 0; i < 3; i++) {
    await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).watchCharacterResources())
    server.players(1)
    await expect.poll(async () => (await probe(page)).avatars[1]!.visible).toBeUndefined()
    const released = await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).characterResources())
    expect(released).toEqual({ disposed: 1, sharedDisposed: 0 })
    server.players(2)
    await expect.poll(async () => !!(await probe(page)).avatars[1]!.texture).toBe(true)
    await expect.poll(async () => (await probe(page)).avatars[1]!.textureUploaded).toBe(true)
    const result = await probe(page)
    expect(result.avatars[1]!.geometry).toBe(remote.geometry)
    expect(result.avatars[1]!.skeleton).not.toBe(remote.skeleton)
    expect(result.memory.geometries).toBe(baseline.geometries)
    expect(result.memory.textures).toBe(baseline.textures)
  }
  await screenshot(page, 'm03-reentry')
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
  expect(consoleErrors).toEqual([])
  expect(errors).toEqual([])
})
