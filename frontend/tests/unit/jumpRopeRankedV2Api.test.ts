import { afterEach, expect, test, vi } from 'vitest'
import { JumpRopeService, jumpRopeService, type JumpRopeReceipt } from '../../src/features/jumpRope/service'
import { retryJumpRope, submitJumpRope, useJumpRope } from '../../src/features/jumpRope/store'
import { useSession } from '../../src/network/worldClient'

/** Story 430: the park game follows the server's rulesVersion and sends duckSpansUs only for v2 rounds. */
const start = { id: '430', seed: 42, serverNow: '2026-11-14T00:00:00Z', startedAt: '2026-11-14T00:00:03Z',
  expiresAt: '2026-11-14T00:01:38Z', durationMs: 60000 }
const confirmed = { id: '430', score: 1965, counts: { perfect: 66, good: 0, miss: 0 }, endReason: 'time',
  completedAt: '2026-11-14T00:01:03Z', reward: 39 }
const sessionId = useSession.getState().sessionId

afterEach(() => {
  vi.restoreAllMocks()
  useJumpRope.setState({ settlement: null, active: false, open: false })
  useSession.setState({ sessionId })
})

function requests(...responses: unknown[]) {
  const request = vi.fn<(path: string, init: RequestInit) => Promise<unknown>>()
  for (const response of responses) request.mockResolvedValueOnce(response)
  return request
}

test('starts a round with the rules version the server chose and refuses unknown versions', async () => {
  const request = requests({ ...start, rulesVersion: 1 }, { ...start, rulesVersion: 2 }, { ...start, rulesVersion: 3 })
  const service = new JumpRopeService(request)
  await expect(service.start('key', new AbortController().signal)).resolves.toMatchObject({ rulesVersion: 1 })
  await expect(service.start('key', new AbortController().signal)).resolves.toMatchObject({ rulesVersion: 2, seed: 42 })
  await expect(service.start('key', new AbortController().signal)).rejects.toMatchObject({ retryable: true })
})

test('a v1 completion sends only jumps; a v2 completion also sends the duck spans and needs a v2 receipt', async () => {
  const request = requests({ ...confirmed, rulesVersion: 1 }, { ...confirmed, rulesVersion: 2 }, { ...confirmed, rulesVersion: 2 },
    { ...confirmed, rulesVersion: 1 }, { ...confirmed, rulesVersion: 2 })
  const service = new JumpRopeService(request)
  await expect(service.complete('430', [728335])).resolves.toMatchObject({ rulesVersion: 1, reward: 39 })
  await expect(service.complete('430', [728335], [[21950000, 22650000]])).resolves.toMatchObject({ rulesVersion: 2, score: 1965 })
  await expect(service.complete('430', [], [])).resolves.toMatchObject({ rulesVersion: 2 })
  // The confirmed version must match the request shape in both directions.
  await expect(service.complete('430', [], [])).rejects.toMatchObject({ retryable: true })
  await expect(service.complete('430', [])).rejects.toMatchObject({ retryable: true })
  const bodies = request.mock.calls.map(([, init]) => JSON.parse(init.body as string))
  expect(bodies).toEqual([
    { jumpOffsetsUs: [728335] },
    { jumpOffsetsUs: [728335], duckSpansUs: [[21950000, 22650000]] },
    { jumpOffsetsUs: [], duckSpansUs: [] },
    { jumpOffsetsUs: [], duckSpansUs: [] },
    { jumpOffsetsUs: [] },
  ])
  expect(request.mock.calls.every(([path]) => path === '/api/v1/minigames/jump-rope/rounds/430/complete')).toBe(true)
})

test('accepts the board of either rules version', async () => {
  const board = { period: 'ALL_TIME', offset: 0, limit: 10, items: [{ rank: 1, nickname: '둘째판', score: 1965 }], me: null }
  const service = new JumpRopeService(requests({ ...board, rulesVersion: 2 }, { ...board, rulesVersion: 1 }, { ...board, rulesVersion: 3 }))
  await expect(service.rankings(new AbortController().signal)).resolves.toMatchObject({ kind: 'ready', entries: board.items })
  await expect(service.rankings(new AbortController().signal)).resolves.toMatchObject({ kind: 'ready' })
  await expect(service.rankings(new AbortController().signal)).rejects.toMatchObject({ retryable: true })
})

test('the store submits and retries the same frozen v2 logs, and v1 submissions carry no spans', async () => {
  const owner = 'jump-v2-owner'
  useSession.setState({ sessionId: owner })
  const receipt: JumpRopeReceipt = { ...confirmed, rulesVersion: 2, endReason: 'time' }
  const complete = vi.spyOn(jumpRopeService, 'complete').mockRejectedValueOnce(new Error('network')).mockResolvedValue(receipt)
  const spans: [number, number][] = [[19227904, 19947904]]
  submitJumpRope({ owner, id: '430', offsets: [728335], duckSpans: spans, expiresAt: Infinity, reason: 'time' })
  spans[0]![1] = 1
  await vi.waitFor(() => expect(useJumpRope.getState().settlement?.status).toBe('failed'))
  retryJumpRope()
  await vi.waitFor(() => expect(useJumpRope.getState().settlement).toMatchObject({ status: 'saved', receipt }))
  expect(complete.mock.calls).toEqual([['430', [728335], [[19227904, 19947904]]], ['430', [728335], [[19227904, 19947904]]]])
  expect(Object.isFrozen(complete.mock.calls[1]![2])).toBe(true)

  complete.mockClear()
  submitJumpRope({ owner, id: '431', offsets: [728335], expiresAt: Infinity, reason: 'time' })
  await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
  expect(complete.mock.calls[0]![2]).toBeUndefined()
})
