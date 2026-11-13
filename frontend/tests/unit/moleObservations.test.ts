import { afterEach, describe, expect, it, vi } from 'vitest'
import { MoleTapRecorder } from '../../src/features/arcade/moleObservations'

const state = vi.hoisted(() => ({ owner: 'owner', session: { status: 'AUTHENTICATED', accessToken: 'fixture' } }))
vi.mock('../../src/network/worldClient', () => ({ useSession: { getState: () => ({ sessionId: state.owner }) } }))
vi.mock('../../src/auth/authFlow', () => ({ getAuthSession: () => state.session }))

const tap = { sequence: 1, clientAtMs: 250, hole: 1, input: 'KEYBOARD', outcome: 'HIT' } as const

afterEach(() => {
  state.owner = 'owner'
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('두더지 판 중 타격 관측', () => {
  it('두 게임은 판이 끝나기 전에 같은 판의 타격을 묶어 보낸다', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    for (const game of ['whack-a-mole', 'speed-mole'] as const) {
      const recorder = new MoleTapRecorder(game, '456')
      recorder.push(tap)
      recorder.push({ ...tap, sequence: 2, clientAtMs: 400 })
      await vi.advanceTimersByTimeAsync(350)
      const [url, init] = fetch.mock.lastCall!
      expect(url).toBe(`/api/v1/minigames/${game}/rounds/456/observations`)
      expect(JSON.parse(init.body).taps).toHaveLength(2)
      recorder.flush()
    }
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('전송 오류를 흡수하고 회원이 바뀌면 이전 판 입력을 보내지 않는다', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetch)
    const recorder = new MoleTapRecorder('speed-mole', '456')
    recorder.push(tap)
    recorder.flush()
    await vi.advanceTimersByTimeAsync(350)
    recorder.push({ ...tap, sequence: 2 })
    state.owner = 'other'
    recorder.flush()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
