import { expect, test, type Page } from '@playwright/test';
import { parkFixture } from '../park-integration/fixture';
import { screenshot } from '../e2e/contractFixture';
import type { customerAnimationProbe } from '../bungeoppang-v5-e2e/probe';
import type { customerSizeProbe } from './probe';

async function openCart(page: Page) {
  const server = await parkFixture(page);
  await page.goto('/park');
  await expect(page).toHaveTitle('OnTop');
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true);
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  const stand = await page.evaluate(async () => {
    const { GENERATED_PARK_ENABLED } = await import('/src/park/mapSelection.ts' as string);
    if (!GENERATED_PARK_ENABLED) throw new Error('Expected the generated service map');
    // Install the test issuer before opening: entry checks existing sessions immediately.
    const { bungeoppangService } = await import('/src/features/bungeoppang/service.ts' as string);
    const { createV5PreviewService } = await import('/src/features/bungeoppang/serviceV5Preview.ts' as string);
    Object.assign(bungeoppangService, createV5PreviewService(() => .5));
    const { bungeoppangView } = await import('/src/features/bungeoppang/bungeoppangView.ts' as string);
    return { x: bungeoppangView.standX, y: .8, z: bungeoppangView.standZ, yaw: Math.PI };
  });
  server.place(stand);
  await expect(page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true })).toBeVisible();
  await page.locator('canvas').focus(); await page.keyboard.press('KeyE');
  await expect(page.getByRole('region', { name: '붕어빵 굽기 시작' })).toBeVisible();
  await expect(page.getByRole('button', { name: '시작', exact: true })).toBeEnabled();
}

for (const durationMs of [120000, 180000]) test(`new park preserves score/combo ranks on the ${durationMs}ms board`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openCart(page);
  const first = { rank: 1, userId: '102', nickname: '먼저 완료', score: 1200, maxCombo: 12, completedAt: '2026-10-29T08:00:00Z' };
  const second = { ...first, userId: '103', nickname: '나중 완료', completedAt: '2026-10-29T09:00:00Z' };
  const me = { ...first, rank: 3, userId: '101', nickname: '새 맵 검증', maxCombo: 8, completedAt: '2026-10-29T07:00:00Z' };
  const lower = Array.from({ length: 27 }, (_, i) => ({ ...first, rank: i + 4, userId: String(i + 104), nickname: `랭킹 참여자 ${i + 4}`, score: 1000 - i }));
  let reads = 0;
  await page.route('**/api/v1/minigames/bungeoppang/rankings?**', route => {
    const query = new URL(route.request().url()).searchParams; reads++;
    expect(query.get('rulesVersion')).toBe('v5'); expect(query.get('durationMs')).toBe(String(durationMs));
    return route.fulfill({ json: { rulesVersion: 'v5', durationMs, period: 'ALL_TIME', basis: 'PERSONAL_BEST',
      snapshotId: `generated-${durationMs}`, updatedAt: '2026-10-29T10:00:00Z', totalParticipants: 30,
      items: query.get('cursor') === 'last' ? lower.slice(17) : query.has('cursor') ? [me, ...lower.slice(0, 17)] : [first, second],
      me, nextCursor: query.get('cursor') === 'last' ? null : query.has('cursor') ? 'last' : 'next' } });
  });
  await page.evaluate(async duration => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const { createGrill } = await import('/src/features/bungeoppang/rulesV5.ts' as string);
    const { BUNGEOPPANG_V5, BUNGEOPPANG_V5_LEGACY } = await import('/src/features/bungeoppang/config.ts' as string);
    const rules = duration === 180000 ? BUNGEOPPANG_V5_LEGACY : BUNGEOPPANG_V5;
    const grill = createGrill(Array(rules.heatListLength).fill(100), [
      { orderId: '1', orderIndex: 0, customerSlot: 0, availableAfterSeq: 0, items: { bean: 2, custard: 0, pizza: 0, chocolate: 0 } },
    ], rules);
    useBungeoppang.setState({ phase: 'result', gameId: `generated-${duration}`, rules, grill,
      result: { score: 1200, maxCombo: 8, made: 20, golden: 12, failed: 0, wasted: 0,
        coinsCalculated: 8, coinsGranted: 8, todayEarned: 8, dailyCap: 1000, capReached: false },
      submitting: false, starting: false, submitError: null, walletError: null });
  }, durationMs);
  const summary = page.getByRole('region', { name: '전체 랭킹 요약', exact: true });
  await expect(summary).toContainText('최고 1,200점 · 최대 8콤보');
  await summary.getByRole('button', { name: '랭킹 보기', exact: true }).click();
  const ranking = page.getByRole('dialog', { name: '붕어빵 전체 랭킹', exact: true });
  const rows = ranking.locator('tbody tr'); await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('먼저 완료'); await expect(rows.nth(1)).toContainText('나중 완료');
  for (const row of await rows.all()) await expect(row).toContainText('1위');
  await ranking.getByRole('button', { name: '다음 순위 더 보기', exact: true }).click();
  await expect(rows).toHaveCount(20);
  await ranking.getByRole('button', { name: '다음 순위 더 보기', exact: true }).click();
  await expect(rows).toHaveCount(30); await expect(rows.nth(2)).toContainText('3위');
  await expect(rows.nth(2)).toContainText('8콤보');
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 800, height: 600 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await ranking.evaluate(node => { node.scrollTop = 0 });
    await expect(ranking.getByRole('columnheader', { name: '최대 콤보', exact: true })).toBeInViewport();
    await expect(ranking).toHaveCSS('scrollbar-width', 'none');
    await expect(ranking.locator('.bung-ranking-table-wrap')).toHaveCSS('overflow-y', 'visible');
    const bounds = await ranking.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    const before = await ranking.evaluate(node => node.scrollTop);
    await ranking.hover(); await page.mouse.wheel(0, 100000);
    await expect.poll(() => ranking.evaluate(node => node.scrollTop)).toBeGreaterThan(before);
    await expect(rows.last()).toBeInViewport({ ratio: 1 });
    await expect(ranking.getByRole('button', { name: '결과로 돌아가기', exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await screenshot(page, `ranking-wheel-${durationMs}-${viewport.width}`, 'disabled');
  }
  await ranking.getByRole('button', { name: '결과로 돌아가기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '붕어빵 결과', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '공원으로', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveCount(0);
  expect(reads).toBe(3); expect(errors).toEqual([]);
});

test('new cart renders smaller child customers, supports selection and returns to the generated park', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openCart(page);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 20000 });
  expect(await page.evaluate(async () =>
    (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().rules.durationMs)).toBe(120000);
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const { resetCustomerArrivalsV5, advanceCustomerArrivalsV5 } = await import('/src/features/bungeoppang/customerArrivalV5.ts' as string);
    const s = useBungeoppang.getState();
    const orders = s.grill.activeOrders.map((o: object, i: number) => ({ ...o, orderId: ['1', '2', '5'][i] }));
    useBungeoppang.setState({ grill: { ...s.grill, activeOrders: orders }, selectedCustomer: '1' });
    resetCustomerArrivalsV5(orders);
    for (const t of [350, 6350, 12350]) advanceCustomerArrivalsV5(orders, t, 90000, 120000);
  });
  const customers = (): Promise<ReturnType<typeof customerAnimationProbe>> => page.evaluate(async () =>
    (await import('/tests/bungeoppang-v5-e2e/probe.ts' as string)).customerAnimationProbe());
  await expect.poll(async () => (await customers()).filter(c => c.loaded && c.visible && c.motion === 'idle').length,
    { timeout: 25000 }).toBe(3);
  expect((await customers()).map(c => c.lookId)).toEqual(['boy-red-scarf', 'student-brown-coat', 'girl-pink-hat']);
  const before = await customers(); await page.waitForTimeout(400);
  expect((await customers()).every((c, i) => c.skins[0]!.pose.some((n, j) => Math.abs(n - before[i]!.skins[0]!.pose[j]!) > .0001))).toBe(true);
  await expect(page.locator('.bung25-order[data-order-id="5"]')).toHaveAttribute('data-stage', 'summary', { timeout: 16000 });
  for (const orderId of ['5', '1']) {
    const actor = (await customers()).find(c => c.orderId === orderId)!;
    await page.mouse.click(actor.head.x, actor.head.y);
    await expect.poll(() => page.evaluate(async () =>
      (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().selectedCustomer)).toBe(orderId);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const sizes = (): Promise<ReturnType<typeof customerSizeProbe>> => page.evaluate(async () =>
    (await import('/tests/park-bungeoppang/probe.ts' as string)).customerSizeProbe());
  for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 640 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const people = await sizes();
      return people.length === 3 && people.every(p => p.top >= 0 && p.top < viewport.height);
    }).toBe(true);
    for (const child of (await sizes()).filter(p => ['boy-red-scarf', 'girl-pink-hat'].includes(p.lookId))) expect(child.height).toBeCloseTo(1.4, 1);
    await screenshot(page, `generated-child-customers-${viewport.width}`, 'disabled');
  }
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await import('/tests/park-integration/probe.ts' as string)).sceneReady())).toBe(true);
  expect(errors).toEqual([]);
});
