import { beforeEach, describe, expect, it } from 'vitest'
import { receive, resetWorld, useSession, clearChannel } from '../../src/network/worldClient'
import { worldState } from '../../src/network/protocol'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
const top = { itemId: 1, itemCode: 'TEST_TOP', equipSlot: 'TOP', imageKey: 'test-top' }
const position = { x: 0, y: .8, z: 34, yaw: 0, lastInputSeq: 0, moving: false, running: false, swimming: false }
const emit = (type: string, payload: object) => receive({ type, payload: payload as Record<string, unknown>, requestId: null })
function join() {
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'a', version: 1, name: '공원', currentUsers: 2, capacity: 40, userIds: ['101', '102'] })
}
function snapshot(version: number, equipment: unknown, channelId = 'a', remote = true) {
  return { channelId, version, mapVersion: EXPECTED_MAP_VERSION,
    avatars: [{ userId: '101', position, equipment }, ...(remote ? [{ userId: '102', position, equipment }] : [])] }
}
beforeEach(() => { resetWorld(); join() })
describe('server-approved public equipment', () => {
  it('updates stationary users, preserves null/missing, clears [] and keeps equal snapshots referentially stable', () => {
    emit('WORLD_STATE', snapshot(1, [top]))
    const first = useSession.getState().equipment
    expect(first['101']).toEqual([top]); expect(first['102']).toEqual([top])
    emit('WORLD_STATE', snapshot(2, [{ ...top }]))
    expect(useSession.getState().equipment).toBe(first)
    emit('WORLD_STATE', snapshot(3, null)); emit('WORLD_STATE', snapshot(4, undefined))
    expect(useSession.getState().equipment).toBe(first)
    emit('WORLD_STATE', snapshot(5, []))
    expect(useSession.getState().equipment['101']).toEqual([])
  })
  it('ignores stale/other-channel state and clears departed and prior-session appearances', () => {
    emit('WORLD_STATE', snapshot(3, [top]))
    const first = useSession.getState().equipment
    emit('WORLD_STATE', snapshot(2, [])); emit('WORLD_STATE', snapshot(4, [], 'b'))
    expect(useSession.getState().equipment).toBe(first)
    emit('WORLD_STATE', snapshot(4, null, 'a', false))
    expect(useSession.getState().equipment['102']).toBeUndefined()
    clearChannel(); expect(useSession.getState().equipment).toEqual({})
    join(); emit('WORLD_STATE', snapshot(1, [top])); resetWorld('reconnecting')
    expect(useSession.getState().equipment).toEqual({})
  })
  it('validates max-five unique slots and removes private fields from approved display data', () => {
    for (const bad of [[{ ...top, itemId: '1' }], [{ ...top, equipSlot: 'OTHER' }], [top, { ...top, itemId: 2 }],
      [{ ...top, imageKey: {} }], { ...top }]) expect(() => worldState(snapshot(1, bad))).toThrow()
    emit('WORLD_STATE', snapshot(1, [{ ...top, price: 99, userItemId: 50, quantity: 1 }]))
    expect(useSession.getState().equipment['101']).toEqual([top])
  })
})
