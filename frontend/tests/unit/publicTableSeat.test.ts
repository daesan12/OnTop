import { beforeEach, describe, expect, it } from 'vitest'
import { TABLES, tableSeats } from '../../src/config'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { worldState, type PublicTableSeat } from '../../src/network/protocol'
import { avatars, receive, resetWorld, useSession } from '../../src/network/worldClient'
import { avatarPoseKind } from '../../src/world/avatarMotion'

const anchor = TABLES[0]!, tableId = 'public-table'
const position = { x: 0, y: .8, z: 34, yaw: 0, lastInputSeq: 0, moving: false, running: false, swimming: false }
const table = { tableId, version: 1, capacity: 2, minimumPlayers: 2,
  seats: [{ seatNumber: 1, userId: '102', ready: false }, { seatNumber: 2, userId: null, ready: false }],
  allReady: false, selectorUserId: '102', gameCode: null, targetScore: null, betAmountPerPlayer: null }
const emit = (type: string, payload: object) => receive({ type, requestId: null, payload: payload as Record<string, unknown> })
const snapshot = (version: number, tableSeat?: PublicTableSeat | null) => ({
  channelId: 'a', version, mapVersion: EXPECTED_MAP_VERSION,
  avatars: [{ userId: '101', position }, { userId: '102', position,
    ...(tableSeat === undefined ? {} : { tableSeat }) }],
})
beforeEach(() => {
  resetWorld()
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'a', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'] })
  useSession.setState({ bindings: [{ channelId: 'a', tableId, anchorId: anchor.id }],
    tables: [{ tableId, capacity: 2, occupiedSeats: 1, availableSeats: 1, joinable: true,
      gameCode: null, betAmountPerPlayer: null, status: 'WAITING' }] })
})

describe('public world table seat presentation (proposed BE contract)', () => {
  it('shows a remote seated pose without joining or watching their table', () => {
    emit('WORLD_STATE', snapshot(1, { tableId, seatNumber: 1 }))
    const remote = avatars.get('102')!, seat = tableSeats(anchor)[0]!
    expect(avatarPoseKind(remote)).toBe('seated')
    expect(remote).toMatchObject({ tableId: anchor.id, seatIndex: 0, moving: false })
    expect(remote.current).toEqual({ x: anchor.position[0] + seat.x, y: anchor.position[1] + .8,
      z: anchor.position[2] + seat.z, yaw: seat.yaw })
    expect(useSession.getState()).toMatchObject({ tableId: '', watchedTableId: '', seatIndex: -1, tableStates: {} })
    emit('WORLD_STATE', snapshot(2, { tableId, seatNumber: 2 }))
    expect(avatars.get('102')!.seatIndex).toBe(1)
  })

  it('clears a stale detailed table pose on public null and ignores older/wrong-channel snapshots', () => {
    emit('WORLD_STATE', snapshot(1))
    emit('TABLE_WATCH_STATE', table)
    expect(avatars.get('102')!.seatIndex).toBe(0)
    emit('WORLD_STATE', snapshot(3, null))
    expect(avatars.get('102')!.seatIndex).toBe(-1)
    expect(avatars.get('102')!.current).toEqual({ x: 0, y: .8, z: 34, yaw: 0 })
    emit('WORLD_STATE', snapshot(2, { tableId, seatNumber: 1 }))
    emit('WORLD_STATE', { ...snapshot(4, { tableId, seatNumber: 1 }), channelId: 'b' })
    expect(avatars.get('102')!.seatIndex).toBe(-1)
  })

  it('retains legacy detailed-state fallback and never guesses unknown bindings', () => {
    emit('WORLD_STATE', snapshot(1))
    emit('TABLE_WATCH_STATE', table)
    emit('WORLD_STATE', snapshot(2))
    expect(avatars.get('102')!.seatIndex).toBe(0)
    emit('WORLD_STATE', snapshot(3, { tableId: 'unmapped', seatNumber: 1 }))
    expect(avatars.get('102')!.seatIndex).toBe(-1)
  })

  it('uses TABLE_STATE for own membership even when public presentation is absent or delayed', () => {
    emit('WORLD_STATE', snapshot(1))
    emit('TABLE_STATE', { ...table, seats: [{ seatNumber: 1, userId: '101', ready: false },
      { seatNumber: 2, userId: null, ready: false }], selectorUserId: '101' })
    emit('WORLD_STATE', { ...snapshot(2, null), avatars: [{ userId: '101', position, tableSeat: null },
      { userId: '102', position, tableSeat: { tableId, seatNumber: 2 } }] })
    expect(useSession.getState()).toMatchObject({ tableId, seatIndex: 0, watchedTableId: '' })
    expect(avatars.get('101')!.seatIndex).toBe(0)
    expect(avatars.get('102')!.seatIndex).toBe(1)
  })

  it('clears public seat data across channel changes and avatar removal', () => {
    emit('WORLD_STATE', snapshot(1, { tableId, seatNumber: 1 }))
    emit('WORLD_STATE', { ...snapshot(2), avatars: [{ userId: '101', position }] })
    emit('WORLD_STATE', snapshot(3))
    expect(avatars.get('102')!.seatIndex).toBe(-1)
    emit('WORLD_STATE', snapshot(4, { tableId, seatNumber: 1 }))
    resetWorld()
    emit('CONNECTED', { userId: '101' })
    emit('CHANNEL_STATE', { channelId: 'a', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'] })
    emit('WORLD_STATE', snapshot(1))
    expect(avatars.get('102')!.seatIndex).toBe(-1)
  })

  it('rejects malformed and duplicate public seats before mutating avatars', () => {
    for (const tableSeat of [{ tableId, seatNumber: 0 }, { tableId, seatNumber: 5 },
      { tableId: '', seatNumber: 1 }, { tableId, seatNumber: 1.5 }, 'seated']) {
      expect(() => worldState({ ...snapshot(1), avatars: [{ userId: '102', position, tableSeat }] })).toThrow()
    }
    const seat = { tableId, seatNumber: 1 }
    expect(() => worldState({ ...snapshot(1), avatars: ['101', '102'].map(userId => ({ userId, position, tableSeat: seat })) })).toThrow()
    expect(() => worldState(snapshot(1, null))).not.toThrow()
    expect(() => worldState(snapshot(1))).not.toThrow()
  })
})
