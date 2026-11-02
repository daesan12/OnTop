import { describe, expect, it } from 'vitest'
import { RemoteMovement } from '../../src/network/remoteMovement'

const pose = (x: number, moving = true) => ({ x, y: .8, z: 0, yaw: 0, moving, running: true, swimming: false })
const motion = (tick: number, epoch = 0) => ({ tick, epoch, appliedInputSeq: tick, inputAgeMs: 0,
  velocityY: 0, grounded: true, inputActive: true })
describe('remote server-tick snapshot interpolation', () => {
  it('uses the delayed server timeline instead of restarting a blend at every arrival', () => {
    const buffer = new RemoteMovement(120)
    buffer.push('other', pose(0), motion(0), 0)
    buffer.push('other', pose(.9), motion(3), 100)
    const p = pose(0)
    buffer.sample('other', 120, p); expect(p.x).toBeCloseTo(0)
    buffer.sample('other', 170, p); expect(p.x).toBeCloseTo(.45)
    buffer.push('other', pose(1.8), motion(6), 220)
    buffer.sample('other', 220, p); expect(p.x).toBeCloseTo(.9)
    buffer.sample('other', 270, p); expect(p.x).toBeCloseTo(1.35)
  })
  it('sorts reordered ticks, deduplicates receipt snapshots, bounds history and rejects old epochs', () => {
    const buffer = new RemoteMovement(120), p = pose(0)
    buffer.push('other', pose(0), motion(0), 0)
    buffer.push('other', pose(1.8), motion(6), 200)
    buffer.push('other', pose(.9), motion(3), 230)
    buffer.push('other', pose(999), motion(6), 231)
    buffer.sample('other', 270, p); expect(p.x).toBeCloseTo(1.35)
    expect(buffer.metrics().reordered).toBe(1)
    buffer.push('other', pose(50), motion(7, 1), 250)
    buffer.sample('other', 270, p); expect(p.x).toBe(50)
    buffer.push('other', pose(-500), motion(8, 0), 280)
    buffer.sample('other', 280, p); expect(p.x).toBe(50)
    for (let tick = 9; tick < 100; tick++) buffer.push('other', pose(50), motion(tick, 1), tick * 34)
    expect(buffer.metrics().maxFrames).toBe(16)
    buffer.forget('other'); expect(buffer.sample('other', 4000, p)).toBe(false)
  })
  it('holds safely without extrapolation, limits catch-up after a gap, and delays animation flags too', () => {
    const buffer = new RemoteMovement(120), p = pose(0)
    buffer.push('other', pose(0), motion(0), 0)
    buffer.push('other', pose(.9), motion(3), 100)
    buffer.sample('other', 220, p)
    buffer.sample('other', 1000, p); expect(p.x).toBeCloseTo(.9)
    buffer.push('other', pose(9, false), motion(30), 1001)
    buffer.sample('other', 1017, p)
    expect(p.x - .9).toBeLessThanOrEqual(12.125 * .017 + .001)
    expect(buffer.flags('other')?.moving).toBe(true)
    buffer.sample('other', 2000, p); expect(p.x).toBeCloseTo(9)
    expect(buffer.flags('other')?.moving).toBe(false)
    buffer.reset(); expect(buffer.metrics().tracks).toBe(0)
  })
  it('rephases after discarded server catch-up ticks instead of permanently starving or rewinding', () => {
    const buffer = new RemoteMovement(), p = pose(0)
    buffer.push('other', pose(0), motion(0), 0)
    buffer.push('other', pose(.9), motion(3), 100)
    buffer.sample('other', 200, p)
    let previous = p.x
    // Server pauses 400ms and resumes without simulating the missing time.
    for (let index = 2; index <= 40; index++) {
      buffer.push('other', pose(index * .9), motion(index * 3), index * 100 + 400)
      for (let frame = 0; frame < 6; frame++) {
        buffer.sample('other', index * 100 + 400 + frame * 1000 / 60, p)
        expect(p.x).toBeGreaterThanOrEqual(previous - .0001)
        previous = p.x
      }
    }
    buffer.sample('other', 4400 + 1000 / 60 * 5, p)
    // A real buffer is restored: not permanently following the latest arrival.
    expect(p.x).toBeCloseTo((40 + 5 / 6 - 1.8) * .9)
  })
})
