import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { fixture, screenshot } from '../e2e/contractFixture';
import type { cookingLightingProbe } from './probe';

const lighting = (page: Page, visible?: boolean): Promise<ReturnType<typeof cookingLightingProbe>> => page.evaluate(async value =>
  (await import('/tests/bungeoppang-v5-e2e/probe.ts' as string)).cookingLightingProbe(value), visible);
const timeOffset = (phase: number) => {
  return 1767193200000 + phase * 1800000 - Date.now();
};

async function counterBrightness(image: Buffer) {
  const { data, info } = await sharp(image).extract({ left: 24, top: 300, width: 190, height: 210 })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += info.channels) sum += .2126 * data[i]! + .7152 * data[i + 1]! + .0722 * data[i + 2]!;
  return sum / (info.width * info.height);
}

test('night cooking lamps brighten the counter, ease down in daylight and leave with the game', async ({ page }) => {
  const cycle = Math.floor((Date.now() - 1767193200000) / 1800000), nightPhase = cycle + .95, dayPhase = cycle + 1.42;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const park = await fixture(page, { players: 4, manualMovement: true, serverTimeOffsetMs: timeOffset(nightPhase),
    position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop');
  await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible({ timeout: 90000 });
  const exposure = (await lighting(page)).exposure;
  expect((await lighting(page)).lights).toHaveLength(0);
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play');
  for (const order of await page.locator('.bung25-order').all()) await expect(order).toHaveAttribute('data-stage', 'summary', { timeout: 15000 });
  await page.evaluate(async phase => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(phase), nightPhase);
  await expect.poll(async () => (await lighting(page)).daylight).toBeLessThan(.05);
  await expect.poll(async () => Math.min(...(await lighting(page)).lights.map(light => light.intensity))).toBeGreaterThan(3.2);
  const night = await lighting(page);
  expect(night.lights).toHaveLength(2);
  expect(night.lights.every(light => light.distance <= 3.2 && !light.shadow)).toBe(true);
  expect(night.exposure).toBe(exposure);
  // Same nighttime scene and camera, with only the local working lights toggled for the capture.
  await lighting(page, false); await page.waitForTimeout(300);
  const unlit = await counterBrightness(await page.screenshot());
  await screenshot(page, 'v5-night-lamps-off');
  await lighting(page, true); await page.waitForTimeout(300);
  const lit = await counterBrightness(await page.screenshot());
  await screenshot(page, 'v5-night-lamps-on');
  expect(lit, `counter luminance without/with lamps: ${unlit.toFixed(1)} / ${lit.toFixed(1)}`).toBeGreaterThan(unlit + 10);
  expect(lit).toBeLessThan(180);
  // Move forward to the next morning, respecting the production clock's monotonic rule.
  park.serverTimeOffset(timeOffset(dayPhase));
  await page.evaluate(async phase => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(phase), dayPhase);
  await page.waitForTimeout(500);
  await expect.poll(async () => (await lighting(page)).daylight).toBeGreaterThan(.95);
  await expect.poll(async () => Math.max(...(await lighting(page)).lights.map(light => light.intensity))).toBeLessThan(.8);
  await screenshot(page, 'v5-day-cooking-lamps');
  expect((await lighting(page)).exposure).toBe(exposure);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveCount(0);
  expect((await lighting(page)).lights).toHaveLength(0);
  expect((await lighting(page)).exposure).toBe(exposure);
  expect(errors).toEqual([]);
});
