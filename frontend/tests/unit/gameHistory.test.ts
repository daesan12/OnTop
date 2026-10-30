import { describe, expect, it, vi } from 'vitest'
import { appendHistory, fetchHistory, fetchStats, historyPath, parseHistory, parseStats } from '../../src/features/gameHistory/service'

const item = (gameSessionId = '9007199254740993', patch: Record<string, unknown> = {}) => ({ gameSessionId, gameCode: 'OMOK',
  status: 'FINISHED', myResult: 'FORFEIT', settlementStatus: 'PENDING', endedAt: '2026-10-29T00:00:00Z', ...patch })
const page = (patch: Record<string, unknown> = {}) => ({ items: [item()], nextCursor: null, hasNext: false, ...patch })
const stats = { gameCode: 'OMOK', played: 10, wins: 5, losses: 3, forfeits: 1, draws: 1 }

describe('approved history API contract', () => {
  it('preserves BIGINT strings, a separate forfeit and pending settlement', () => {
    expect(parseHistory(page()).items[0]).toEqual(item())
    expect(parseStats({ items: [stats] })).toEqual([stats])
    expect(parseStats({ items: [stats] })[0].losses).toBe(3)
  })
  it('uses ID order even when end times have a different order', () => {
    const first = item('9007199254740993', { endedAt: '2026-10-28T00:00:00Z' })
    const second = item('9007199254740992', { endedAt: '2026-10-29T00:00:00Z' })
    expect(parseHistory(page({ items: [first, second] })).items).toEqual([first, second])
  })
  it('keeps invalid/null results and missing settlement distinct from losses and settlement', () => {
    expect(parseHistory(page({ items: [item('7', { status: 'INVALID', myResult: null, settlementStatus: null })] })).items[0])
      .toMatchObject({ status: 'INVALID', myResult: null, settlementStatus: null })
    expect(parseHistory(page({ items: [item('7', { status: 'INVALID' })] })).items[0].myResult).toBe('FORFEIT')
    expect(parseHistory({ items: [], nextCursor: null, hasNext: false }).items).toEqual([])
    expect(parseStats({ items: [] })).toEqual([])
  })
  it('requests size 20 and forwards the exact nextCursor with the documented filter', () => {
    const first = parseHistory(page({ nextCursor: '9007199254740993', hasNext: true }))
    expect(historyPath()).toBe('/api/v1/users/me/games?size=20')
    expect(historyPath('OMOK', first.nextCursor!)).toBe('/api/v1/users/me/games?size=20&cursor=9007199254740993&gameCode=OMOK')
    const second = parseHistory(page({ items: [item('9007199254740992')] }), 'OMOK', first.nextCursor!)
    expect(appendHistory(first, second)).toMatchObject({ items: [item(), item('9007199254740992')], nextCursor: null, hasNext: false })
  })
  it.each([
    page({ items: [item('0')] }), page({ items: [item('9223372036854775808')] }), page({ items: [item('1e3')] }),
    page({ items: [item('10'), item('11')] }), page({ items: [item('10'), item('10')] }),
    page({ items: [item('10', { gameSessionId: 10 })] }), page({ items: [item('10', { gameCode: 'BUNGEOPPANG' })] }),
    page({ items: [item('10', { status: 'RUNNING' })] }), page({ items: [item('10', { myResult: 'LOSS' })] }),
    page({ items: [item('10', { settlementStatus: 'FAILED' })] }), page({ items: [item('10', { endedAt: 'bad date' })] }),
    page({ hasNext: true }), page({ nextCursor: '3' }), page({ nextCursor: '3', hasNext: true }),
    { items: [], nextCursor: '10', hasNext: true }, {},
  ])('rejects malformed pages rather than showing invented results: %j', body => expect(() => parseHistory(body)).toThrow())
  it('rejects wrong-filter responses and repeated/non-descending pages', () => {
    expect(() => parseHistory(page(), 'ONE_CARD')).toThrow()
    expect(() => parseHistory(page(), 'ALL', '9007199254740993')).toThrow()
    const first = parseHistory(page({ nextCursor: '9007199254740993', hasNext: true }))
    expect(() => appendHistory(first, parseHistory(page()))).toThrow()
    expect(() => historyPath('ALL', '9223372036854775808')).toThrow()
  })
  it.each([
    { items: [stats, stats] }, { items: [{ ...stats, played: 11 }] }, { items: [{ ...stats, losses: 4 }] },
    { items: [{ ...stats, forfeits: -1 }] }, { items: [{ ...stats, wins: 5.5 }] }, { items: [{ ...stats, wins: '5' }] },
    { items: [{ ...stats, gameCode: 'FARKLE' }] }, { items: [{ ...stats, played: Number.MAX_SAFE_INTEGER + 1 }] }, {},
  ])('rejects inconsistent statistics without adding forfeits into losses: %j', body => expect(() => parseStats(body)).toThrow())
  it('uses cancellable, non-cached GETs through the existing authenticated runtime', async () => {
    const request = vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce({ items: [stats] })
    const abort = new AbortController()
    await fetchHistory(request, 'ALL', abort.signal)
    await fetchStats(request, abort.signal)
    expect(request.mock.calls.map(call => call[0])).toEqual(['/api/v1/users/me/games?size=20', '/api/v1/users/me/game-stats'])
    for (const [, options] of request.mock.calls) expect(options).toMatchObject({ method: 'GET', cache: 'no-store', signal: expect.any(AbortSignal) })
    abort.abort()
    for (const [, options] of request.mock.calls) expect(options.signal.aborted).toBe(true)
  })
})
