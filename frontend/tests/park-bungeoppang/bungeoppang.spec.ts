import { test, expect } from '@playwright/test';
import { parkFixture } from '../park-integration/fixture';

test('existing bungeoppang game opens at the new cart, cooks and returns to the same park', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const server = await parkFixture(page);
  await page.goto('/park');
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true);
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  const stand = await page.evaluate(async () => {
    // Test-only issuer: the production game/store/input/rendering modules stay intact.
    const { bungeoppangService } = await import('/src/features/bungeoppang/service.ts' as string);
    const { createV5PreviewService } = await import('/src/features/bungeoppang/serviceV5Preview.ts' as string);
    Object.assign(bungeoppangService, createV5PreviewService(() => .5));
    const { bungeoppangView } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string);
    return { x: bungeoppangView.standX, y: .8, z: bungeoppangView.standZ, yaw: Math.PI };
  });
  server.place(stand);
  await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible();
  await page.locator('canvas').focus();
  await page.keyboard.press('KeyE');
  await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toBeVisible();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  const phase = () => page.evaluate(async () =>
    (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().phase);
  await expect.poll(phase, { timeout: 20000 }).toBe('play');
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-bungeoppang/probe.ts' as string)).cookingStageReady())).toBe(true);
  await page.locator('canvas').focus();
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(320); // Respect the existing interval between cooking actions.
  await page.keyboard.press('KeyQ');
  await expect.poll(() => page.evaluate(async () =>
    (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().grill?.log.map((e: { action: string }) => e.action)))
    .toEqual(['POUR', 'FILL']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', { name: '그만두기 확인' })).toBeVisible();
  await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect.poll(phase).toBe('idle');
  expect(await page.evaluate(async () =>
    (await import('/src/world/inputOwnership.ts' as string)).inputState.minigameOpen)).toBe(false);
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady())).toBe(true);
  expect(errors).toEqual([]);
});
