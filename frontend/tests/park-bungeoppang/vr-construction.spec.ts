import { expect, test } from '@playwright/test';
import { parkFixture } from '../park-integration/fixture';
import { screenshot } from '../e2e/contractFixture';

test('꼬치왕 VR 선택·연결을 열고 헤드셋 연결 확인 후에만 준비할 수 있다', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { configurable: true,
    value: Object.assign(new EventTarget(), { isSessionSupported: async () => true }) }));
  const server = await parkFixture(page);
  await page.route('**/api/v1/operations/status', route => route.fulfill({ json: {
    mode: 'NORMAL', notice: '', maintenanceStartedAt: null, expectedOpenAt: null,
    version: 1, updatedAt: new Date().toISOString(), serverTime: new Date().toISOString(),
  } }));
  await page.route('**/api/v1/announcements', route => route.fulfill({ json: {
    serverTime: new Date().toISOString(), refreshAt: new Date(Date.now() + 10000).toISOString(), announcements: [],
  } }));
  await page.route('**/api/v1/minigames/skewer/coop/rooms?**', route => route.fulfill({ json: { mine: null, rooms: [] } }));
  const admissions: string[] = [];
  page.on('request', request => { if (request.url().includes('/minigames/skewer/admissions')) admissions.push(request.url()) });
  await page.goto('/park'); await expect(page).toHaveTitle('OnTop');
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true);
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  const entrance = await page.evaluate(async () => (await import('/src/features/vrZone/parkBridge.ts' as string)).parkVrEntrance);
  server.place(entrance);
    await page.getByRole('button', { name: /E 온탑 꼬치왕/ }).click();
  const catalog = page.getByRole('dialog', { name: '온탑 꼬치왕', exact: true });
  await expect(catalog.getByRole('button', { name: /^방 만들기/ })).toBeEnabled();
  await catalog.getByRole('button', { name: '공원으로 나가기', exact: true }).click();
  await expect(catalog).toHaveCount(0);
  // Actual cooperative components, isolated participants/transport; no real room or payment.
  const preview = '/tests/park-xr/flowPreview.tsx';
  await page.evaluate(async path => (await import(path)).mount(), preview);
  await page.getByRole('button', { name: /^방 만들기/ }).click();
  await page.getByRole('button', { name: '방 만들기', exact: true }).click();
  await expect(page.getByText('친구를 기다리고 있어요', { exact: true })).toBeVisible();
  await page.evaluate(async path => (await import(path)).joinFriend(), preview);
  await page.getByRole('button', { name: '요리사', exact: true }).click();
  const vr = page.getByRole('button', { name: 'VR로 요리하기', exact: true });
  await expect(vr).toBeEnabled();
  await expect(page.getByRole('button', { name: 'PC로 요리하기', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'VR 요리 · 공사 중', exact: true })).toHaveCount(0);
  await vr.click();
  await expect(page.getByRole('button', { name: '준비 완료', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '헤드셋 연결하기', exact: true }).click();
  await expect(page.locator('.chef-stage')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('chef-app')).toHaveAttribute('data-mode', 'vr');
  await expect(page.getByRole('button', { name: 'VR 시작', exact: true })).toBeEnabled();
  await screenshot(page, 'skewer-vr-entry', 'disabled');
  await page.getByRole('button', { name: '← 역할·준비 화면으로', exact: true }).click();
  await expect(page.getByRole('button', { name: '준비 완료', exact: true })).toBeDisabled();
  await page.evaluate(async path => (await import(path)).headsetPreviewConnected(), preview);
  await expect(page.getByRole('button', { name: '준비 완료', exact: true })).toBeEnabled();
  await page.evaluate(async path => (await import(path)).unmount(), preview);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(admissions).toEqual([]); expect(errors).toEqual([]);
});
