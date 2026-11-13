import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ session: { status: 'AUTHENTICATED', accessToken: 'test-access' } as { status: 'AUTHENTICATED'; accessToken: string } | null,
  refresh: vi.fn<() => Promise<boolean>>() }))
vi.mock('../../src/auth/authFlow', () => ({ getAuthSession: () => auth.session, restoreAuthSession: auth.refresh }))
import { jitterMs, loadJumpRopeMacroReport, parseJumpRopeMacroReport } from '../../src/features/admin/adminJumpRopeMacro'

const suspect = { userId: '202', nickname: '줄넘기왕', withdrawn: false, flaggedRounds: 5, duplicateRounds: 3, steadyRounds: 5,
  auditedRounds: 9, outsideParkRounds: 4, bestScore: 1_965, lowestJitterUs: 96,
  firstFlaggedAt: '2026-11-13T03:00:00Z', lastFlaggedAt: '2026-11-14T01:30:00Z' }
const duplicate = { inputHash: 'ab'.repeat(32), rounds: 4, members: 2, userIds: ['202', '303'], score: 1_965,
  firstCompletedAt: '2026-11-12T03:00:00Z', lastCompletedAt: '2026-11-14T01:30:00Z' }
const report = { enabled: true, limit: 200, suspects: [suspect], duplicateLogs: [duplicate], generatedAt: '2026-11-14T02:00:00Z' }
beforeEach(() => { auth.session = { status: 'AUTHENTICATED', accessToken: 'test-access' }; auth.refresh.mockReset() })
afterEach(() => vi.unstubAllGlobals())

it('accepts the report contract, an empty report and members without a measured rhythm', () => {
  expect(parseJumpRopeMacroReport(report)).toEqual(report)
  expect(parseJumpRopeMacroReport({ ...report, enabled: false, suspects: [], duplicateLogs: [] }))
    .toEqual({ ...report, enabled: false, suspects: [], duplicateLogs: [] })
  expect(parseJumpRopeMacroReport({ ...report, suspects: [{ ...suspect, withdrawn: true, bestScore: null, lowestJitterUs: null }] })
    .suspects[0]).toMatchObject({ withdrawn: true, bestScore: null, lowestJitterUs: null })
})
it.each([null, {}, { ...report, enabled: 'true' }, { ...report, suspects: null }, { ...report, duplicateLogs: null },
  { ...report, generatedAt: 'invalid' }, { ...report, limit: 0 },
  { ...report, suspects: [suspect, suspect] }, { ...report, suspects: [{ ...suspect, userId: 202 }] },
  { ...report, suspects: [{ ...suspect, flaggedRounds: 0 }] }, { ...report, suspects: [{ ...suspect, duplicateRounds: 6 }] },
  { ...report, suspects: [{ ...suspect, auditedRounds: 4 }] }, { ...report, suspects: [{ ...suspect, outsideParkRounds: 10 }] },
  { ...report, suspects: [{ ...suspect, lowestJitterUs: -1 }] }, { ...report, suspects: [{ ...suspect, bestScore: '1965' }] },
  { ...report, suspects: [{ ...suspect, firstFlaggedAt: '2026-11-15T00:00:00Z' }] },
  { ...report, duplicateLogs: [duplicate, duplicate] }, { ...report, duplicateLogs: [{ ...duplicate, inputHash: 'short' }] },
  { ...report, duplicateLogs: [{ ...duplicate, rounds: 1 }] }, { ...report, duplicateLogs: [{ ...duplicate, members: 5 }] },
  { ...report, duplicateLogs: [{ ...duplicate, userIds: [] }] }, { ...report, duplicateLogs: [{ ...duplicate, userIds: [202] }] },
  { ...report, duplicateLogs: [{ ...duplicate, lastCompletedAt: 'invalid' }] },
])('rejects malformed reports without showing an empty success: %j', value => expect(() => parseJumpRopeMacroReport(value)).toThrow())

it('reads with the access token only, without cookies, a body or member identifiers in the URL', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(report)); vi.stubGlobal('fetch', fetcher)
  await expect(loadJumpRopeMacroReport(new AbortController().signal)).resolves.toEqual(report)
  expect(fetcher).toHaveBeenCalledWith('/api/v1/admin/macro-analysis/jump-rope', expect.objectContaining({
    method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer test-access' } }))
  expect(fetcher.mock.calls[0]![1].body).toBeUndefined()
})
it.each([[403, 'forbidden'], [404, 'not_ready'], [503, 'not_ready'], [500, 'failed']] as const)(
  'reports HTTP %i as %s without ending the session', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'X' }, { status })))
    await expect(loadJumpRopeMacroReport(new AbortController().signal)).rejects.toMatchObject({ kind })
    expect(auth.refresh).not.toHaveBeenCalled()
  })
it('ends the session only when the refresh after a 401 fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 401 })))
  auth.refresh.mockResolvedValue(false)
  await expect(loadJumpRopeMacroReport(new AbortController().signal)).rejects.toMatchObject({ kind: 'unauthenticated' })
})
it('shows the rhythm jitter in milliseconds', () => {
  expect(jitterMs(96)).toBe('0.1ms')
  expect(jitterMs(22_635)).toBe('22.6ms')
  expect(jitterMs(null)).toBe('-')
})
