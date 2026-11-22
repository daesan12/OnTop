import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ hold: vi.fn(), panel: false }))
vi.mock('../../src/network/worldClient', () => ({
  useSession: { getState: () => ({ sessionId: '1', roomId: 'a' }) }, estimatedServerTime: () => 0,
  avatars: new Map([['1', { current: { x: 0, z: 0, yaw: 0 } }]]),
}))
vi.mock('../../src/world/inputOwnership', () => ({ panelOwnsKeys: () => mocks.panel }))
vi.mock('../../src/features/winter/state', () => ({ winterFrozen: () => false }))
vi.mock('../../src/features/winter/community/api', () => ({ holdSnow: mocks.hold }))
import { beginSnowPress, clearSnowRollInput, endSnowPress, useSnowRollInput } from '../../src/features/winter/community/rollInput'
import { resetWinterCommunity, useWinterCommunity } from '../../src/features/winter/community/state'

const held = () => useWinterCommunity.setState({ building: { channelId: 'a', version: 1, serverTime: '2026-11-21T00:00:00Z', snowmen: [],
  balls: [{ id: '00000000-0000-4000-8000-000000000001', x: 0, z: 1, groundY: 0, radius: .25, pushing: ['1'], reserved: false }] } })
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('document', { hidden: false }); mocks.panel = false; mocks.hold.mockReset(); resetWinterCommunity(); clearSnowRollInput() })
afterEach(async () => { clearSnowRollInput(); await vi.advanceTimersByTimeAsync(0); vi.useRealTimers(); vi.unstubAllGlobals() })

it('짧게 누르면 기존 눈싸움 동작만 한 번 실행한다', async () => {
  const short = vi.fn(); beginSnowPress(short); await vi.advanceTimersByTimeAsync(200); endSnowPress(); endSnowPress()
  expect(short).toHaveBeenCalledTimes(1); expect(mocks.hold).not.toHaveBeenCalled(); expect(useSnowRollInput.getState().phase).toBe('idle')
})
it('긴 누름을 놓은 뒤 시작 응답이 와도 눈싸움 대신 눈을 내려놓는다', async () => {
  let acknowledge!: () => void
  mocks.hold.mockImplementationOnce(() => new Promise<void>(resolve => { acknowledge = () => { held(); resolve() } })).mockResolvedValue(undefined)
  const short = vi.fn(); beginSnowPress(short); await vi.advanceTimersByTimeAsync(450)
  endSnowPress(); acknowledge(); await vi.advanceTimersByTimeAsync(0)
  expect(short).not.toHaveBeenCalled(); expect(mocks.hold.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'RELEASE'])
  expect(useSnowRollInput.getState().phase).toBe('idle')
})
it('굴리는 중 대화창이 열리면 유지 요청을 멈추고 내려놓는다', async () => {
  mocks.hold.mockImplementation(async action => { if (action === 'BEGIN') held() })
  beginSnowPress(vi.fn()); await vi.advanceTimersByTimeAsync(450)
  expect(useSnowRollInput.getState().phase).toBe('rolling')
  mocks.panel = true; await vi.advanceTimersByTimeAsync(600)
  expect(mocks.hold.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'RELEASE'])
  expect(useSnowRollInput.getState().phase).toBe('idle')
})
