import { afterEach, expect, it, vi } from 'vitest'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { TABLES } from '../../src/config'
import { remoteMovement } from '../../src/network/remoteMovement'
import { authoritativePose, avatars, clearChannel, receive, resetWorld, sampleAvatar, useSession } from '../../src/network/worldClient'

afterEach(() => { resetWorld(); vi.restoreAllMocks() })
const position = { lastInputSeq: 0, x: 0, y: .8, z: 34, yaw: 0, moving: true, running: true, swimming: false }
const motion = (tick: number, epoch = 0) => ({ tick, epoch, appliedInputSeq: 0, inputAgeMs: 0,
  velocityY: 0, grounded: true, inputActive: true })
it('uses tick history only for remote roaming; keeps official poses, approved seating, legacy and map guards', () => {
  resetWorld('connected')
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
  useSession.setState({ sessionId: '101', roomId: 'one', mapCompatible: true,
    bindings: [{ channelId: 'one', tableId: 'table-1', anchorId: TABLES[0]!.id }] })
  const state = (version: number, at: number, x: number, options: { seated?: boolean; legacy?: boolean; epoch?: number; map?: string } = {}) => {
    clock.mockReturnValue(at)
    receive({ type: 'WORLD_STATE', requestId: null, payload: {
      channelId: 'one', version, mapVersion: options.map ?? EXPECTED_MAP_VERSION,
      avatars: [{ userId: '102', position: { ...position, x },
        ...(!options.legacy ? { motion: motion((version - 1) * 3, options.epoch) } : {}),
        tableSeat: options.seated ? { tableId: 'table-1', seatNumber: 1 } : null }],
    } })
  }
  state(1, 0, 0); state(2, 100, .9)
  const p = { ...position }
  sampleAvatar(avatars.get('102')!, 230, p)
  expect(p.x).toBeCloseTo(.45)
  expect(authoritativePose('102')!.x).toBe(.9)
  state(1, 240, -100) // stale world snapshot cannot rewind the history
  expect(authoritativePose('102')!.x).toBe(.9)
  state(3, 250, 50, { epoch: 1 })
  sampleAvatar(avatars.get('102')!, 250, p); expect(p.x).toBe(50)
  state(4, 300, 50, { seated: true, epoch: 1 })
  expect(remoteMovement.metrics().tracks).toBe(0)
  sampleAvatar(avatars.get('102')!, 300, p)
  expect(p.x).toBe(avatars.get('102')!.current.x)
  expect(avatars.get('102')!.tableId).toBe(TABLES[0]!.id)
  state(5, 400, 55, { legacy: true })
  expect(remoteMovement.metrics().tracks).toBe(0)
  state(6, 500, 56, { epoch: 1 })
  expect(remoteMovement.metrics().tracks).toBe(1)
  state(7, 600, 57, { map: 'different' })
  expect(remoteMovement.metrics().tracks).toBe(0)
  clearChannel(); expect(remoteMovement.metrics().tracks).toBe(0)
})
