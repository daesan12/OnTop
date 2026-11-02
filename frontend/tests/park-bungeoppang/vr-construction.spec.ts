import { expect, test } from '@playwright/test';
import { parkFixture } from '../park-integration/fixture';
import { screenshot } from '../e2e/contractFixture';

test('latest park blocks skewer entry under construction without admission requests', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const server = await parkFixture(page);
  const admissions: string[] = [];
  page.on('request', request => { if (request.url().includes('/minigames/skewer/admissions')) admissions.push(request.url()) });
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop');
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true);
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  const entrance = await page.evaluate(async () => (await import('/src/features/vrZone/parkBridge.ts' as string)).parkVrEntrance);
  server.place(entrance);
  await page.getByRole('button', { name: /E VR 게임 선택/ }).click();
  const catalog = page.getByRole('dialog', { name: 'VR 게임 선택', exact: true });
  await expect(catalog.getByRole('button', { name: '온탑 꼬치왕 공사 중', exact: true })).toBeDisabled();
  await expect(catalog.getByRole('status')).toContainText('엽전은 차감되지 않아요');
  await expect(page.getByRole('button', { name: 'VR로 플레이', exact: true })).toHaveCount(0);
  await screenshot(page, 'skewer-under-construction', 'disabled');
  await catalog.getByRole('button', { name: 'VR 게임 선택 닫기', exact: true }).click();
  await expect(catalog).toHaveCount(0);
  expect(admissions).toEqual([]); expect(errors).toEqual([]);
});
