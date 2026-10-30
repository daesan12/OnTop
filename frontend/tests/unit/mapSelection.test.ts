import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());
it.each([
  ['production', 'generated', false],
  ['development', 'generated', false],
  ['park-integration', 'generated', true],
  ['park-integration', 'legacy', false],
])('selects an explicit map profile: %s / %s', async (mode, flag, expected) => {
  vi.stubEnv('MODE', mode);
  vi.stubEnv('VITE_PARK_MAP', flag);
  vi.resetModules();
  expect((await import('../../src/park/mapSelection')).GENERATED_PARK_ENABLED).toBe(expected);
});
