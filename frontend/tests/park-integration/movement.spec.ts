import { test, expect } from '@playwright/test';
import { parkFixture } from './fixture';

test('new-map prediction changes only the rendered own position and supports servers without motion', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await parkFixture(page);
  await page.goto('/park');
  await expect(page).toHaveTitle('OnTop');
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).sceneReady()), { timeout: 90000 }).toBe(true);
  await expect(page.getByText('공원을 준비하고 있어요…')).toBeHidden({ timeout: 90000 });
  await expect(page.getByLabel('공원 기본 화면')).toBeVisible();
  const origin = await page.evaluate(async () => {
    const wc = await import('/src/network/worldClient.ts' as string);
    const { LIVE_MAP_IDENTITY } = await import('/src/network/mapContract.ts' as string);
    const { localMovement } = await import('/src/network/localMovementPrediction.ts' as string);
    const session = wc.useSession.getState(), position = { ...wc.authoritativePose(session.sessionId), moving: false, running: false, swimming: false, lastInputSeq: 0 };
    if (localMovement.ready) throw new Error('A motion-less server must retain interpolation.');
    wc.receive({ type: 'WORLD_STATE', requestId: null, payload: { channelId: session.roomId, version: 100000,
      mapVersion: LIVE_MAP_IDENTITY.mapVersion, avatars: [{ userId: session.sessionId, position,
        motion: { epoch: 0, tick: 1, appliedInputSeq: 0, inputAgeMs: 250, velocityY: 0, grounded: true, inputActive: false } }] } });
    await localMovement.prepare();
    if (!localMovement.ready) throw new Error('Generated-map prediction failed to initialize.');
    localMovement.intend({ dx: 1, dz: 0, run: false, jump: false });
    return position;
  });
  await expect.poll(() => page.evaluate(async () =>
    (await import('/tests/park-integration/probe.ts' as string)).renderedOwnPosition()?.[0])).toBeGreaterThan(origin.x + .1);
  const official = await page.evaluate(async () => {
    const wc = await import('/src/network/worldClient.ts' as string), id = wc.useSession.getState().sessionId;
    return { authoritative: wc.authoritativePose(id), current: wc.avatars.get(id)?.current };
  });
  expect(official.authoritative?.x).toBe(origin.x);
  expect(official.current?.x).toBe(origin.x);
  await page.screenshot({ path: info.outputPath('new-map-movement-prediction.png') });
  await page.evaluate(async position => {
    const wc = await import('/src/network/worldClient.ts' as string), session = wc.useSession.getState();
    wc.receive({ type: 'WORLD_STATE', requestId: null, payload: { channelId: session.roomId, version: 100001,
      mapVersion: session.mapVersion, avatars: [{ userId: session.sessionId, position }] } });
  }, origin);
  expect(await page.evaluate(async () =>
    (await import('/src/network/localMovementPrediction.ts' as string)).localMovement.ready)).toBe(false);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});
