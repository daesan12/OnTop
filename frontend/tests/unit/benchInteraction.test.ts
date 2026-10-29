import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { benchAnchors, canReachBench } from '../../src/features/interactions/benchAnchors'
import { MockBenchService } from '../../src/features/interactions/mock/MockBenchService'
import { getParkInteraction } from '../../src/features/interactions/parkInteraction'
import { interactionAim, interactionScore } from '../../src/features/interactions/interactionAim'
import { sitBench, standBench } from '../../src/features/interactions/benchController'
import { useBenchState } from '../../src/features/interactions/benchState'
import { benchSignal } from '../../src/features/interactions/benchState'
import { benchService } from '../../src/features/interactions/benchService'
import { avatars, receive, resetWorld, useSession } from '../../src/network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { inputState, roamingInput } from '../../src/world/inputOwnership'
vi.mock('../../src/features/interactions/benchService', async () => {
  const { MockBenchService } = await import('../../src/features/interactions/mock/MockBenchService')
  return { benchService: new MockBenchService() }
})

const bench = benchAnchors[0]!
const near = { x: bench.position[0], y: bench.position[1] + 0.8, z: bench.position[2] + 2, yaw: 0 }
const emit = (type: string, payload: Record<string, unknown>) => receive({ type, payload, requestId: null })
function world(version = 1, position = near) {
  emit('WORLD_STATE', { channelId: 'test-channel', version, mapVersion: EXPECTED_MAP_VERSION,
    avatars: [{ userId: '101', position: { ...position, moving: false, running: false, swimming: false, lastInputSeq: 0 } }] })
}
beforeEach(() => {
  vi.useFakeTimers()
  resetWorld()
  interactionAim.ready = false
  roamingInput.ready = true
  Object.assign(inputState, { blocked: false, chatOpen: false, manualOpen: false, mapOpen: false, emoteWheelOpen: false, minigameOpen: false })
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'test-channel', name: 'test', capacity: 4, currentUsers: 1, userIds: ['101'], version: 1 })
  world()
})
afterEach(() => { resetWorld(); roamingInput.ready = false; vi.useRealTimers() })

describe('M01 target selection and bench lifecycle', () => {
  it('shows no E hint before the canvas input listeners are installed', () => {
    roamingInput.ready = false
    expect(getParkInteraction()).toBeNull()
  })
  it('selects the same reachable seat data used by the hint and rejects upper-floor access', () => {
    expect(getParkInteraction()).toMatchObject({ kind: 'bench', id: bench.id, occupied: false })
    const elevated = benchAnchors.find(b => b.position[1] > 3)!
    expect(elevated).toBeDefined()
    expect(canReachBench({ x: elevated.position[0], y: 0.8, z: elevated.position[2], yaw: 0 }, elevated.id)).toBe(false)
    expect(canReachBench(near, 'unknown-bench')).toBe(false)
    expect(canReachBench({ ...near, x: Infinity }, bench.id)).toBe(false)
  })
  it('prioritizes the viewed target and rejects a target behind the camera', () => {
    const aim = { ready: true, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 }
    expect(interactionScore(1, { x: 0, y: 0, z: 1 }, aim)).toBe(Infinity)
    expect(interactionScore(3, { x: 0, y: 0, z: -3 }, aim))
      .toBeLessThan(interactionScore(1, { x: 1, y: 0, z: -1 }, aim))
  })
  it.each(['chatOpen', 'manualOpen', 'mapOpen', 'emoteWheelOpen', 'minigameOpen', 'blocked'] as const)(
    'hides interaction when %s owns input', key => {
      inputState[key] = true
      expect(getParkInteraction()).toBeNull()
      inputState[key] = false
    })
  it('waits for approval, rejects repeat input and keeps seating across real world snapshots', async () => {
    const sitting = sitBench(bench.id, 0)
    expect(useBenchState.getState().pending).toBe(true)
    expect(useSession.getState().benchId).toBe('')
    expect(await sitBench(bench.id, 0)).toBe(false)
    await vi.advanceTimersByTimeAsync(180)
    expect(await sitting).toBe(true)
    expect(avatars.get('101')).toMatchObject({ benchId: bench.id, seatIndex: 0, current: bench.seats[0] })
    world(2)
    expect(avatars.get('101')?.current).toEqual(bench.seats[0])
    const standing = standBench()
    expect(useSession.getState().benchId).toBe(bench.id)
    await vi.advanceTimersByTimeAsync(180)
    expect(await standing).toBe(true)
    expect(useSession.getState().benchId).toBe('')
    expect(avatars.get('101')?.current).toEqual(near)
  })
  it('cancels a delayed sit on disconnect without restoring old occupancy', async () => {
    const sitting = sitBench(bench.id, 0)
    resetWorld('reconnecting')
    await vi.advanceTimersByTimeAsync(1000)
    expect(await sitting).toBe(false)
    expect(useBenchState.getState().placements).toEqual({})
    expect(useBenchState.getState().pending).toBe(false)
    expect(useSession.getState().benchId).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('releases pending on a seat conflict, reports rejection and allows another seat', async () => {
    const peer = benchService.sit({ channelId: 'test-channel', userId: '102', position: near }, bench.id, 0, benchSignal())
    await vi.advanceTimersByTimeAsync(180)
    await peer
    const conflict = sitBench(bench.id, 0)
    await vi.advanceTimersByTimeAsync(180)
    expect(await conflict).toBe(false)
    expect(useBenchState.getState().pending).toBe(false)
    expect(useBenchState.getState().error).toContain('먼저 앉았습니다')
    expect(useSession.getState().benchId).toBe('')
    const retry = sitBench(bench.id, 1)
    await vi.advanceTimersByTimeAsync(180)
    expect(await retry).toBe(true)
    expect(avatars.get('101')?.seatIndex).toBe(1)
  })
  it('discards approval if the server moved the user out of reach', async () => {
    const sitting = sitBench(bench.id, 0)
    world(2, { ...near, x: near.x + 30 })
    await vi.advanceTimersByTimeAsync(180)
    expect(await sitting).toBe(false)
    expect(useSession.getState().benchId).toBe('')
    expect(useBenchState.getState().error).toContain('위치나 이용 상태')
  })
  it('removes occupancy when the user disappears from the world snapshot', async () => {
    const sitting = sitBench(bench.id, 0)
    await vi.advanceTimersByTimeAsync(180)
    await sitting
    emit('WORLD_STATE', { channelId: 'test-channel', version: 2, mapVersion: EXPECTED_MAP_VERSION, avatars: [] })
    expect(useBenchState.getState().placements).toEqual({})
    expect(useSession.getState().benchId).toBe('')
  })
  it('cancels pending approval if the user disappears before any lease exists', async () => {
    const sitting = sitBench(bench.id, 0)
    emit('WORLD_STATE', { channelId: 'test-channel', version: 2, mapVersion: EXPECTED_MAP_VERSION, avatars: [] })
    await vi.advanceTimersByTimeAsync(180)
    expect(await sitting).toBe(false)
    expect(useBenchState.getState().pending).toBe(false)
    expect(useBenchState.getState().placements).toEqual({})
  })
  it('clears approved occupancy and disables interaction on map mismatch', async () => {
    const sitting = sitBench(bench.id, 0)
    await vi.advanceTimersByTimeAsync(180)
    expect(await sitting).toBe(true)
    emit('WORLD_STATE', { channelId: 'test-channel', version: 2, mapVersion: 'different-map',
      avatars: [{ userId: '101', position: { ...near, moving: false, running: false, swimming: false, lastInputSeq: 0 } }] })
    expect(useBenchState.getState().placements).toEqual({})
    expect(useSession.getState().benchId).toBe('')
    expect(getParkInteraction()).toBeNull()
  })
  it('clears pending approval on channel leave', async () => {
    const sitting = sitBench(bench.id, 0)
    emit('CHANNEL_LEFT', { channelId: 'test-channel' })
    await vi.advanceTimersByTimeAsync(180)
    expect(await sitting).toBe(false)
    expect(useBenchState.getState().pending).toBe(false)
    expect(useBenchState.getState().placements).toEqual({})
  })
})

describe('isolated bench mock authority (current tab only)', () => {
  it('has two independent seats, one winner per seat and independent channels', async () => {
    const service = new MockBenchService(1), signal = new AbortController()
    const context = { userId: 'a', channelId: 'one', position: near }
    const requests = [service.sit(context, bench.id, 0, signal.signal),
      service.sit({ ...context, userId: 'b' }, bench.id, 0, signal.signal),
      service.sit({ ...context, userId: 'c' }, bench.id, 1, signal.signal),
      service.sit({ ...context, userId: 'd', channelId: 'two' }, bench.id, 0, signal.signal)]
    const results = Promise.allSettled(requests)
    await vi.advanceTimersByTimeAsync(1)
    const outcomes = await results
    expect(outcomes.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'fulfilled'])
    signal.abort()
    const again = service.sit(context, bench.id, 0, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(1)
    expect(await again).toMatchObject({ userId: 'a', seat: 0 })
  })
})
