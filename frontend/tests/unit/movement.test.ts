import { afterEach, describe, expect, it, vi } from 'vitest'
import { cameraRelativeMove, MovementInputBuffer, normalizedMove, type MovementIntent } from '../../src/network/movementInput'
import { sampleMovement, sampleSwimmingPose } from '../../src/world/movementPresentation'
import { constrainRoamingCamera } from '../../src/world/cameraCollision'
import { avatars, receive, resetWorld, sampleAvatar } from '../../src/network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { NETWORK } from '../../src/config'
import liveArrival from '../fixtures/liveMovementArrival.json'

const idle = (): MovementIntent => ({ dx: 0, dz: 0, run: false, jump: false })
const pose = { x: 0, y: 0.8, z: 34, yaw: 0 }
afterEach(() => { resetWorld(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('M02 movement intent and delivery', () => {
  it('keeps cardinal/diagonal speeds equal and rotates input with the camera', () => {
    expect(cameraRelativeMove(1, 0, 0, false, false, idle())).toMatchObject({ dx: 0, dz: -1 })
    const diagonal = cameraRelativeMove(1, 1, 0, true, false, idle())
    expect(Math.hypot(diagonal.dx, diagonal.dz)).toBeCloseTo(1)
    expect(cameraRelativeMove(1, 0, Math.PI / 2, false, false, idle()).dx).toBeCloseTo(-1)
    expect(cameraRelativeMove(1, -1, Math.PI / 3, true, true, idle())).toMatchObject({ run: true, jump: true })
    const jump = cameraRelativeMove(0, 0, 0, false, true, idle())
    expect(Math.hypot(jump.dx, jump.dz)).toBe(0)
    expect(jump.jump).toBe(true)
    expect(cameraRelativeMove(0, 0, 0, true, false, idle()).run).toBe(false)
  })
  it('accepts finite normalized intent without producing coordinates or dt', () => {
    const intent = normalizedMove(1, 1, true, true)!
    expect(Math.hypot(intent.dx, intent.dz)).toBeCloseTo(1)
    expect(Object.keys(intent).sort()).toEqual(['dx', 'dz', 'jump', 'run'])
    expect(normalizedMove(0, 0, true, false)).toEqual(idle())
    for (const [dx, dz] of [[NaN, 0], [0, Infinity], [2, 0]]) expect(normalizedMove(dx!, dz!, false, false)).toBeNull()
  })
  it('coalesces input at the existing cadence while preserving one queued jump', async () => {
    vi.useFakeTimers()
    const send = vi.fn()
    const buffer = new MovementInputBuffer(send, () => Date.now())
    buffer.enqueue({ ...idle(), dz: -1 }, 'session-a')
    buffer.enqueue({ ...idle(), dx: 1, jump: true }, 'session-a')
    buffer.enqueue({ ...idle(), dx: 1, run: true }, 'session-a')
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1]).toEqual([{ dx: 1, dz: 0, run: true, jump: true }, 'session-a'])
    await vi.advanceTimersByTimeAsync(300)
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('a stop cancels an unsent jump, and a disconnect discards all queued input', async () => {
    vi.useFakeTimers()
    const send = vi.fn()
    const buffer = new MovementInputBuffer(send, () => Date.now())
    buffer.enqueue({ ...idle(), dz: -1 }, 'old')
    buffer.enqueue({ ...idle(), jump: true }, 'old')
    buffer.clear(false)
    buffer.enqueue(idle(), 'old')
    await vi.advanceTimersByTimeAsync(59)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(send.mock.calls[1]?.[0]).toEqual(idle())
    buffer.enqueue({ ...idle(), dz: -1, jump: true }, 'old')
    buffer.clear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(send).toHaveBeenCalledTimes(2)
    buffer.enqueue({ ...idle(), dx: 1 }, 'new')
    expect(send.mock.calls[2]?.[1]).toBe('new')
    buffer.clear()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('retains a queued jump when direction keys are released, without repeating or crossing scopes', async () => {
    vi.useFakeTimers()
    const send = vi.fn()
    const buffer = new MovementInputBuffer(send, () => Date.now())
    buffer.enqueue({ ...idle(), dz: -1 }, 'a')
    await vi.advanceTimersByTimeAsync(10)
    buffer.enqueue({ ...idle(), dz: -1, jump: true }, 'a')
    buffer.enqueue(idle(), 'a') // Ordinary horizontal release must not swallow Space.
    await vi.advanceTimersByTimeAsync(49)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(send.mock.calls[1]).toEqual([{ ...idle(), jump: true }, 'a'])
    buffer.enqueue(idle(), 'a')
    await vi.advanceTimersByTimeAsync(60)
    expect(send.mock.calls[2]).toEqual([idle(), 'a'])
    buffer.enqueue({ ...idle(), jump: true }, 'a')
    buffer.enqueue(idle(), 'b')
    await vi.advanceTimersByTimeAsync(60)
    expect(send.mock.calls[3]).toEqual([idle(), 'b'])
  })
  it('rechecks fractional timer deadlines instead of delivering an early callback', async () => {
    vi.useFakeTimers()
    let now = 0
    const send = vi.fn()
    const buffer = new MovementInputBuffer(send, () => now)
    buffer.enqueue(idle(), 'a')
    now = .25
    buffer.enqueue({ ...idle(), dx: 1 }, 'a')
    now = 59.99
    await vi.advanceTimersByTimeAsync(60)
    expect(send).toHaveBeenCalledTimes(1)
    now = 60
    await vi.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('keeps the send cadence and delivers stop independently of delayed acknowledgements', async () => {
    vi.useFakeTimers()
    const replies: (() => void)[] = []
    const send = vi.fn(() => new Promise<void>(resolve => replies.push(resolve)))
    const buffer = new MovementInputBuffer(send, () => Date.now())
    buffer.enqueue({ ...idle(), dz: -1 }, 'a')
    buffer.enqueue({ ...idle(), dx: 1, jump: true }, 'a')
    await vi.advanceTimersByTimeAsync(59)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(send.mock.calls[1]).toEqual([{ ...idle(), dx: 1, jump: true }, 'a'])
    buffer.enqueue(idle(), 'a')
    await vi.advanceTimersByTimeAsync(60)
    expect(send.mock.calls[2]).toEqual([idle(), 'a'])
    buffer.clear()
    buffer.enqueue({ ...idle(), dx: 1 }, 'b')
    buffer.enqueue({ ...idle(), dz: 1 }, 'b')
    await vi.advanceTimersByTimeAsync(20)
    replies[0]!()
    replies[1]!() // Old connection completions cannot change b's send cadence.
    await vi.advanceTimersByTimeAsync(39)
    expect(send).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(send.mock.calls[4]).toEqual([{ ...idle(), dz: 1 }, 'b'])
    buffer.clear()
  })
})

describe('M02 approved movement presentation', () => {
  it('keeps clustered live reply/broadcast arrivals within the prototype velocity envelope', () => {
    let now = 0, cursor = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const emit = (type: string, payload: Record<string, unknown>) => receive({ type, payload, requestId: null })
    emit('CONNECTED', { userId: '101' })
    emit('CHANNEL_STATE', { channelId: 'a', name: 'park', capacity: 2, currentUsers: 1, userIds: ['101'], version: 1 })
    let previous: { x: number; z: number } | undefined
    const speeds: number[] = []
    // Real captures include different approved endpoints arriving <1ms apart.
    // Raw receipt-history interpolation produced >24m/s peaks in this 9m/s run.
    for (let t = 0; t < liveArrival.end; t += 1000 / 60) {
      while (cursor < liveArrival.snapshots.length && liveArrival.snapshots[cursor]!.at <= t) {
        const snapshot = liveArrival.snapshots[cursor++]!
        now = snapshot.at
        emit('WORLD_STATE', { channelId: 'a', mapVersion: EXPECTED_MAP_VERSION, version: cursor,
          avatars: [{ userId: '101', position: snapshot.position }] })
      }
      const a = avatars.get('101')
      if (!a) continue
      const sampled = sampleAvatar(a, t, { ...pose })
      if (previous && t > 700 && t < liveArrival.end - 200)
        speeds.push(Math.hypot(sampled.x - previous.x, sampled.z - previous.z) * 60)
      previous = { ...sampled }
    }
    expect(speeds.length).toBeGreaterThan(100)
    expect(Math.max(...speeds)).toBeLessThan(12)
    const a = avatars.get('101')!, stopped = sampleAvatar(a, liveArrival.end + 2000, { ...pose })
    expect(stopped).toMatchObject({ x: a.current.x, y: a.current.y, z: a.current.z })
  })
  it('interpolates jump height, uses the shortest yaw arc and never extrapolates', () => {
    const sample = { previous: { ...pose, yaw: Math.PI - 0.1 }, current: { ...pose, x: 4, y: 2.8, yaw: -Math.PI + 0.1 }, at: 100 }
    const target = { ...pose }
    sampleMovement(sample, 160, 120, target)
    expect(target.x).toBe(2)
    expect(target.y).toBeCloseTo(1.8)
    expect(target.yaw).toBeCloseTo(Math.PI)
    sampleMovement(sample, 10_000, 120, target)
    expect(target.x).toBe(4)
    expect(target.y).toBe(2.8)
  })
  it('repeated position acknowledgements do not postpone interpolation or invent swimming', () => {
    resetWorld()
    const emit = (type: string, payload: Record<string, unknown>) => receive({ type, payload, requestId: null })
    emit('CONNECTED', { userId: '101' })
    emit('CHANNEL_STATE', { channelId: 'a', name: 'park', capacity: 2, currentUsers: 1, userIds: ['101'], version: 1 })
    const snapshot = (version: number, x: number, swimming = false) => emit('WORLD_STATE', {
      channelId: 'a', mapVersion: EXPECTED_MAP_VERSION, version,
      avatars: [{ userId: '101', position: { ...pose, x, moving: true, running: false, swimming, lastInputSeq: version } }],
    })
    snapshot(1, 0)
    snapshot(2, 1)
    const original = avatars.get('101')!
    snapshot(3, 1)
    const repeated = avatars.get('101')!
    expect(repeated.at).toBe(original.at)
    expect(repeated.previous).toEqual(original.previous)
    const target = { ...pose }
    sampleAvatar(repeated, original.at + NETWORK.interpolationMs, target)
    expect(target.x).toBeCloseTo(1, 12)
    expect(sampleSwimmingPose(repeated, repeated.at, 120, target)).toBeNull()
    snapshot(4, 1, true)
    expect(sampleSwimmingPose(avatars.get('101')!, repeated.at, 120, target)).not.toBeNull()
    const disconnected = { ...avatars.get('101')!, connected: false }
    expect(sampleSwimmingPose(disconnected, repeated.at, 120, target)).toBeNull()
  })
  it('constrains the actual camera after easing without moving its horizontal position', () => {
    const camera = { x: 4, y: 0, z: 7 }
    constrainRoamingCamera(camera, () => 2)
    expect(camera).toEqual({ x: 4, y: 2.3, z: 7 })
    camera.y = 10
    constrainRoamingCamera(camera, () => 2)
    expect(camera.y).toBe(10)
  })
})
