import { expect, test, type Page } from '@playwright/test';
import { fixture, screenshot } from '../e2e/contractFixture';
import type { customerAnimationProbe } from './probe';
const customers = (page: Page): Promise<ReturnType<typeof customerAnimationProbe>> => page.evaluate(async () =>
  (await import('/tests/bungeoppang-v5-e2e/probe.ts' as string)).customerAnimationProbe());

test('six optimized customer skins animate, select orders and release visit resources', async ({ page }) => {
  test.setTimeout(100000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await fixture(page, { players: 4, manualMovement: true, position: { x: -36, y: .8, z: 16.3, yaw: Math.PI } });
  await page.goto('/park');
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  await page.getByRole('button', { name: 'E 붕어빵 굽기', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveAttribute('data-phase', 'play', { timeout: 15000 });
  await expect.poll(async () => (await customers(page)).filter(c => c.loaded && c.motion === 'idle').length, { timeout: 20000 }).toBe(3);
  const initial = await customers(page);
  expect(initial.map(c => c.lookId)).toEqual(['boy-red-scarf', 'student-brown-coat', 'worker-earmuffs']);
  expect(initial.every(c => c.skins.length === 1 && c.skins[0]!.bones === 65)).toBe(true);
  await screenshot(page, 'v5-animated-customers-first-three');
  await page.waitForTimeout(700);
  const animated = await customers(page);
  expect(animated.every((c, i) => c.skins[0]!.pose.some((value, j) => Math.abs(value - initial[i]!.skins[0]!.pose[j]!) > .0001))).toBe(true);
  const head = animated[1]!.head;
  await page.mouse.click(head.x, head.y);
  await expect.poll(() => page.evaluate(async () => (await import('/src/features/bungeoppang/store.ts' as string)).useBungeoppang.getState().selectedCustomer)).toBe('2');
  // Art fixture changes only order identities; real delivery approval is covered by the session and cooking tests.
  await page.evaluate(async () => {
    const { useBungeoppang } = await import('/src/features/bungeoppang/store.ts' as string);
    const s = useBungeoppang.getState();
    useBungeoppang.setState({ grill: { ...s.grill, activeOrders: s.grill.activeOrders.map((o: { orderId: string }, i: number) => ({ ...o, orderId: String(i + 4) })) }, selectedCustomer: '4' });
  });
  await expect.poll(async () => (await customers(page)).filter(c => c.loaded && c.motion === 'walk').length, { timeout: 12000, intervals: [30, 50, 100] }).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await customers(page)).filter(c => c.loaded && c.motion === 'idle').length, { timeout: 22000 }).toBe(3);
  const frozen = await customers(page);
  await page.waitForTimeout(350);
  expect((await customers(page)).map(c => c.skins[0]!.pose)).toEqual(frozen.map(c => c.skins[0]!.pose));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => (await customers(page)).filter(c => c.loaded && c.motion === 'idle').length).toBe(3);
  expect((await customers(page)).map(c => c.lookId)).toEqual(['older-flat-cap', 'girl-pink-hat', 'woman-glasses-bun']);
  await screenshot(page, 'v5-animated-customers-other-three');
  await page.evaluate(async () => (await import('/tests/bungeoppang-v5-e2e/probe.ts' as string)).watchV5Disposal());
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(page.locator('.bung-root')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const p = await import('/tests/bungeoppang-v5-e2e/probe.ts' as string);
    const d = p.disposalProbe(); return d.tracked > 0 && d.disposed === d.tracked;
  })).toBe(true);
  expect(errors).toEqual([]);
});
