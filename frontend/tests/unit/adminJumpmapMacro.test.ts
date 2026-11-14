import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ session: { status: 'AUTHENTICATED', accessToken: 'test-access' } as { status: 'AUTHENTICATED'; accessToken: string } | null,
  refresh: vi.fn<() => Promise<boolean>>() }))
vi.mock('../../src/auth/authFlow', () => ({ getAuthSession: () => auth.session, restoreAuthSession: auth.refresh }))
import { finishSeconds, flaggedShare, loadMacroSuspects, parseMacroSuspects } from '../../src/features/admin/adminJumpmapMacro'

const suspect = { userId: '202', nickname: '돌탑달인', withdrawn: false, flaggedRuns: 7, replayRuns: 6, fixedStartRuns: 4,
  totalRuns: 31, bestFinishMs: 58_412, firstDetectedAt: '2026-11-12T03:00:00Z', lastDetectedAt: '2026-11-13T01:30:00Z' }
const list = { enabled: true, limit: 200, items: [suspect], generatedAt: '2026-11-13T02:00:00Z' }
beforeEach(() => { auth.session = { status: 'AUTHENTICATED', accessToken: 'test-access' }; auth.refresh.mockReset() })
afterEach(() => vi.unstubAllGlobals())

it('accepts the list contract, empty lists, withdrawn members and members without a finish', () => {
  expect(parseMacroSuspects(list)).toEqual(list)
  expect(parseMacroSuspects({ ...list, enabled: false, items: [] })).toEqual({ ...list, enabled: false, items: [] })
  expect(parseMacroSuspects({ ...list, items: [{ ...suspect, withdrawn: true, bestFinishMs: null }] }).items[0])
    .toMatchObject({ withdrawn: true, bestFinishMs: null })
})
it.each([null, {}, { ...list, enabled: 'true' }, { ...list, items: null }, { ...list, generatedAt: 'invalid' },
  { ...list, limit: 0 }, { ...list, limit: 1, items: [suspect, { ...suspect, userId: '203' }] },
  { ...list, items: [suspect, suspect] }, { ...list, items: [{ ...suspect, userId: 202 }] },
  { ...list, items: [{ ...suspect, flaggedRuns: 0 }] }, { ...list, items: [{ ...suspect, replayRuns: 8 }] },
  { ...list, items: [{ ...suspect, totalRuns: 6 }] }, { ...list, items: [{ ...suspect, bestFinishMs: 0 }] },
  { ...list, items: [{ ...suspect, nickname: null }] }, { ...list, items: [{ ...suspect, lastDetectedAt: 'invalid' }] },
  { ...list, items: [{ ...suspect, firstDetectedAt: '2026-11-14T00:00:00Z' }] },
])('rejects malformed lists without showing an empty success: %j', value => expect(() => parseMacroSuspects(value)).toThrow())

it('reads with the access token only, without cookies, a body or member identifiers in the URL', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(list)); vi.stubGlobal('fetch', fetcher)
  await expect(loadMacroSuspects(new AbortController().signal)).resolves.toEqual(list)
  expect(fetcher).toHaveBeenCalledWith('/api/v1/admin/macro-analysis/jumpmap', expect.objectContaining({
    method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer test-access' } }))
  expect(fetcher.mock.calls[0]![1].body).toBeUndefined()
})
it.each([[403, 'forbidden'], [404, 'not_ready'], [503, 'not_ready'], [500, 'failed']] as const)(
  'reports HTTP %i as %s without ending the session', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'X' }, { status })))
    await expect(loadMacroSuspects(new AbortController().signal)).rejects.toMatchObject({ kind })
    expect(auth.refresh).not.toHaveBeenCalled()
  })
it('ends the session only when the refresh after a 401 fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 401 })))
  auth.refresh.mockResolvedValue(false)
  await expect(loadMacroSuspects(new AbortController().signal)).rejects.toMatchObject({ kind: 'unauthenticated' })
})
it('formats the finish time and the flagged share for the table', () => {
  expect(finishSeconds(58_412)).toBe('58.412초')
  expect(finishSeconds(null)).toBe('없음')
  expect(flaggedShare(suspect)).toBe('23%')
  expect(flaggedShare({ flaggedRuns: 0, totalRuns: 0 })).toBe('0%')
})
