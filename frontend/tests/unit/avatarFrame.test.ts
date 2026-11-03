import { describe, expect, it, vi } from 'vitest'
import { AvatarFrame } from '../../src/network/avatarFrame'
import type { AvatarSnapshot, Pose } from '../../src/network/worldClient'
import { sampleMovement } from '../../src/world/movementPresentation'

const target = (): Pose => ({ x: 0, y: 0, z: 0, yaw: 0 })
const avatar = (): AvatarSnapshot => ({ userId: 'remote', previous: target(), current: { x: 12, y: 4, z: -2, yaw: 1 },
  at: 0, nickname: '', color: 0, moving: true, running: false, swimming: false, connected: true,
  emote: '', emoteAt: 0, tableId: '', seatIndex: -1, benchId: '', fitnessId: '', fitnessStartedAt: 0,
  telescopeId: '', telescopeYaw: 0, telescopePitch: 0, followTargetId: '' })

describe('render-frame avatar sampling', () => {
  it('shares the first remote pose in one frame and copies into independent consumer targets', () => {
    const raw = vi.fn((a: AvatarSnapshot, now: number, out: Pose) => sampleMovement(a, now, 120, out))
    const frame = new AvatarFrame(raw, () => false), source = avatar(), body = target(), ripple = target()
    frame.begin()
    expect(frame.sample(source, 60, body)).toBe(body)
    frame.sample(source, 64, ripple)
    expect(raw).toHaveBeenCalledTimes(1)
    expect(ripple).toEqual(body)
    body.x = -999
    frame.sample(source, 65, ripple)
    expect(ripple.x).toBe(6)
    frame.begin()
    frame.sample(source, 90, ripple)
    expect(raw).toHaveBeenCalledTimes(2)
    expect(ripple.x).toBe(9)
  })

  it('keeps local prediction live, including role changes within a frame', () => {
    const source = avatar(), raw = vi.fn((_: AvatarSnapshot, now: number, out: Pose) => Object.assign(out, { x: now }))
    let own = false
    const frame = new AvatarFrame(raw, () => own), p = target()
    frame.begin(); frame.sample(source, 1, p); frame.sample(source, 2, p)
    expect(raw).toHaveBeenCalledTimes(1)
    own = true; frame.sample(source, 3, p); frame.sample(source, 4, p)
    expect(p.x).toBe(4); expect(raw).toHaveBeenCalledTimes(3)
    own = false; frame.sample(source, 5, p)
    expect(p.x).toBe(5); expect(raw).toHaveBeenCalledTimes(4)
  })

  it('never returns a pose from an earlier packet, user object or restored connection', () => {
    const raw = vi.fn((a: AvatarSnapshot, _now: number, out: Pose) => Object.assign(out, a.current))
    const frame = new AvatarFrame(raw, () => false), first = avatar(), p = target()
    frame.begin(); frame.sample(first, 10, p)
    const corrected = { ...first, current: { ...first.current, x: 100 } }
    frame.sample(corrected, 11, p)
    expect(p.x).toBe(100)
    const reconnected = { ...corrected, current: { ...corrected.current, x: -50 } }
    frame.sample(reconnected, 12, p)
    expect(p.x).toBe(-50); expect(raw).toHaveBeenCalledTimes(3)
  })

  it.each(['tableId', 'benchId', 'fitnessId', 'telescopeId'] as const)('resamples immediately after a %s transition', key => {
    const source = avatar(), raw = vi.fn((a: AvatarSnapshot, _now: number, out: Pose) => Object.assign(out, a.current))
    const frame = new AvatarFrame(raw, () => false), p = target()
    frame.begin(); frame.sample(source, 1, p)
    source[key] = 'new-place'; frame.sample(source, 2, p)
    expect(raw).toHaveBeenCalledTimes(2)
  })

  it('resamples in-place corrections and changed interpolation origins without waiting for the next frame', () => {
    const source = avatar(), raw = vi.fn((a: AvatarSnapshot, now: number, out: Pose) => sampleMovement(a, now, 120, out))
    const frame = new AvatarFrame(raw, () => false), p = target()
    frame.begin(); frame.sample(source, 60, p)
    source.current.x = 24; frame.sample(source, 60, p)
    expect(p.x).toBe(12)
    source.previous.x = 12; frame.sample(source, 60, p)
    expect(p.x).toBe(18)
    source.at = 60; frame.sample(source, 60, p)
    expect(p.x).toBe(12); expect(raw).toHaveBeenCalledTimes(4)
  })

  it('does not share across canvases, startup reads or resumed frames', () => {
    const raw = vi.fn((_: AvatarSnapshot, now: number, out: Pose) => Object.assign(out, { x: now }))
    const a = new AvatarFrame(raw, () => false), b = new AvatarFrame(raw, () => false), source = avatar(), p = target()
    a.sample(source, 1, p); a.sample(source, 2, p)
    expect(p.x).toBe(2)
    a.begin(); b.begin(); a.sample(source, 3, p); b.sample(source, 4, p)
    expect(p.x).toBe(4)
    a.begin(); a.sample(source, 10000, p)
    expect(p.x).toBe(10000); expect(raw).toHaveBeenCalledTimes(5)
  })
})
