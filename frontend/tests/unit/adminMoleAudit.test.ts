import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => ({ session: { status: 'AUTHENTICATED', accessToken: 'test-access' } as { status: 'AUTHENTICATED'; accessToken: string } | null,
  refresh: vi.fn<() => Promise<boolean>>() }))
vi.mock('../../src/auth/authFlow', () => ({ getAuthSession: () => auth.session, restoreAuthSession: auth.refresh }))
import { readMoleTimingDetections, timingSegmentLabel } from '../../src/features/admin/adminMoleAudit'

const timing = { items: [{ userId: '301', nickname: '두더지왕', withdrawn: false, flaggedRounds: 2, fastRounds: 1,
  steadyRounds: 1, auditedRounds: 5, lowestMedianReactionMs: 120, latestRoundId: '602',
  lastDetectedAt: '2026-11-16T03:00:00Z' }], from: '2026-10-17T03:00:00Z', until: '2026-11-16T03:00:00Z', limit: 100 }
beforeEach(() => { auth.session = { status: 'AUTHENTICATED', accessToken: 'test-access' }; auth.refresh.mockReset() })
afterEach(() => vi.unstubAllGlobals())

it.each(['whack-a-mole', 'speed-mole'] as const)('reads %s timing detections with the access token only', async game => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(timing)); vi.stubGlobal('fetch', fetcher)
  await expect(readMoleTimingDetections(game, new AbortController().signal)).resolves.toEqual(timing)
  expect(fetcher).toHaveBeenCalledWith(`/api/v1/admin/macro-analysis/mole/timing?game=${game}`, expect.objectContaining({
    credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer test-access' } }))
})

it('reports a forbidden timing lookup without ending the session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 403 })))
  await expect(readMoleTimingDetections('speed-mole', new AbortController().signal)).rejects.toThrow('관리자 조회 권한이 필요합니다.')
  expect(auth.refresh).not.toHaveBeenCalled()
})

it('labels each game segment by its own length', () => {
  expect(timingSegmentLabel('whack-a-mole', 2)).toBe('3구간 (60–90초)')
  expect(timingSegmentLabel('speed-mole', 0)).toBe('1구간 (0–20초)')
})
