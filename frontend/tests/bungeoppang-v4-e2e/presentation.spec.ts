import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fixture, screenshot } from '../e2e/contractFixture';

test('matched presentation sample with four fillings', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    let seed = 2601;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop');
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible({ timeout: 90000 });
  await page.locator('canvas').focus(); await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 10000 });
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Space'); await page.keyboard.press(['KeyQ', 'KeyW', 'KeyE', 'KeyA'][i]!);
    await page.waitForTimeout(320); await page.keyboard.press(`Digit${i + 1}`);
    await page.keyboard.press(['KeyQ', 'KeyW', 'KeyE', 'KeyA'][i]!); await page.waitForTimeout(80);
  }
  await page.waitForTimeout(1400);
  if (process.env.BUNG_PRESENTATION_PHASE !== 'before') {
    const colors = await page.evaluate(async () => (await import('/tests/e2e/bungeoppangPresentationProbe.ts' as string)).fillingColors());
    expect(colors).toEqual(['a34551', 'f5ca4b', 'ed833d', '493026']);
    await expect(page.locator('.bung-heat')).toHaveCount(4);
    await expect(page.locator('.bung-held-tool [data-tool="chocolate"]')).toContainText('초코 들었어요');
  }
  const metrics = await page.evaluate(async () => (await import('/tests/e2e/bungeoppangPresentationProbe.ts' as string)).measureBungeoppangPresentation());
  const directory = process.env.QA_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'ontop-fe-qa');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `presentation-${process.env.BUNG_PRESENTATION_PHASE ?? 'after'}.json`), JSON.stringify(metrics, null, 2));
  await screenshot(page, `bungeoppang-feedback-${process.env.BUNG_PRESENTATION_PHASE ?? 'after'}`);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toBeHidden();
});

test('customer arrival, real take-out flights, tray disposal, failed bread and delivery remain consistent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({ width: 1280, height: 720 });
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park');
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible({ timeout: 90000 });
  await page.locator('canvas').focus(); await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 10000 });
  await expect(page.locator('.bung-customer-arrive')).toBeVisible();
  await expect(page.locator('.bung-customer-scene')).toHaveAttribute('data-state', 'waiting');
  const bake = async (slot: number, code: string, ingredient: string) => {
    await page.waitForTimeout(80);
    await page.keyboard.press('Space'); await page.keyboard.press(code); await page.waitForTimeout(320);
    await page.keyboard.press(ingredient); await page.keyboard.press(code);
    for (let side = 0; side < 2; side++) {
      // Accelerate only the UI clock for this focused animation test. The separate lifecycle test uses real 60s.
      await page.evaluate(async index => {
        const { useBungeoppang, advanceBungeoppangTime } = await import('/src/features/bungeoppang/store.ts' as string);
        const { bungeoppangClock } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string);
        const { cookLevel } = await import('/src/features/bungeoppang/rulesV4.ts' as string);
        const s = useBungeoppang.getState(), bread = s.grill!.slots[index];
        let lo = bread.since, hi = s.rules.durationMs - 1;
        while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (cookLevel(bread.since, mid, bread.heat, s.rules) < 80) lo = mid + 1; else hi = mid; }
        bungeoppangClock.playAt = performance.now() - lo; advanceBungeoppangTime();
      }, slot);
      await page.keyboard.press(code);
    }
  };
  const tray = page.getByRole('region', { name: '완성품 쟁반' }), bin = page.getByLabel('폐기함', { exact: true });
  await bake(0, 'KeyQ', 'Digit1');
  await expect(tray).toHaveAttribute('data-count', '1');
  await expect(page.locator('.bung-flight[data-kind="store"]')).toHaveCount(1);
  await expect(page.locator('.bung-action-receipt')).toContainText('쟁반에 보관');
  await screenshot(page, 'bungeoppang-feedback-store');
  await bake(1, 'KeyW', 'Digit2');
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: '쟁반 2 슈크림 버리기', exact: true }).click();
  await expect(bin).toHaveAttribute('data-count', '1');
  await expect(page.locator('.bung-flight[data-kind="discard"]')).toHaveCount(1);
  await screenshot(page, 'bungeoppang-feedback-discard');
  await bake(2, 'KeyE', 'Digit1');
  await expect(page.locator('.bung-customer-scene')).toHaveAttribute('data-state', 'ready');
  await page.waitForTimeout(80); await page.keyboard.press('KeyR');
  await expect(page.getByRole('region', { name: '손님 주문' })).toHaveAttribute('data-customer', '2');
  await expect(page.locator('.bung-customer-depart')).toContainText('고마워요');
  await expect(page.locator('.bung-flight[data-kind="deliver"]')).toHaveCount(2);
  await screenshot(page, 'bungeoppang-feedback-deliver');
  await page.waitForTimeout(80);
  await page.keyboard.press('Space'); await page.keyboard.press('KeyA'); await page.waitForTimeout(320);
  await page.keyboard.press('Digit3'); await page.keyboard.press('KeyA'); await page.waitForTimeout(320);
  await page.keyboard.press('KeyA'); await page.waitForTimeout(320); await page.keyboard.press('KeyA');
  await expect(bin).toHaveAttribute('data-count', '2');
  await expect(page.locator('.bung-action-receipt')).toContainText('설익었어요');
  await page.waitForTimeout(80); await page.keyboard.press('Space'); await page.keyboard.press('KeyD'); await page.waitForTimeout(320); await page.keyboard.press('Shift+KeyD');
  await expect(bin).toHaveAttribute('data-count', '3');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(async () => (await import('/tests/e2e/sceneProbe.ts' as string)).visualTime(.95));
  for (const [code, ingredient] of [['KeyQ', 'Digit1'], ['KeyW', 'Digit2'], ['KeyE', 'Digit3'], ['KeyA', 'Digit4']]) {
    await page.waitForTimeout(80); await page.keyboard.press('Space'); await page.keyboard.press(code!); await page.waitForTimeout(320);
    await page.keyboard.press(ingredient!); await page.keyboard.press(code!);
  }
  await page.keyboard.press('Digit4');
  await expect(page.locator('.bung-heat[data-rush="true"]')).toHaveCount(4);
  await expect(page.locator('.bung-heat-speed').first()).toContainText('몰림');
  await expect(page.locator('.bung-tool-change')).toHaveCSS('animation-name', 'none');
  await screenshot(page, 'bungeoppang-feedback-night-reduced-motion');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0); expect(errors).toEqual([]);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-flight')).toHaveCount(0); await expect(page.locator('.bung-root')).toBeHidden();
});
