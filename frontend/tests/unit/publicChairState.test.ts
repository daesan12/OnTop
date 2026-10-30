import { afterEach, describe, expect, it, vi } from 'vitest'
import { localMovement } from '../../src/network/localMovementPrediction'
import { clearChannel, receive, resetWorld, useSession } from '../../src/network/worldClient'
import { tableSummary, worldState } from '../../src/network/protocol'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

const position = { x: 0, y: 2.8, z: 11, yaw: 0, lastInputSeq: 0, moving: false, running: false, swimming: false }
const table = { tableId: 'issued-table-id', anchorId: 'table-5', chairCount: 3 }
const frame = (version: number, patch: Record<string, unknown> = {}) => ({ channelId: 'park', version, mapVersion: EXPECTED_MAP_VERSION,
  avatars: [{ userId: '101', position }], tables: [table], ...patch })
const publish = (payload: ReturnType<typeof frame>) => receive({ type: 'WORLD_STATE', requestId: null, payload })
function begin() {
  resetWorld()
  receive({ type: 'CONNECTED', requestId: null, payload: { userId: '101' } })
  receive({ type: 'CHANNEL_STATE', requestId: null, payload: { channelId: 'park', name: '공원', version: 1,
    capacity: 16, currentUsers: 1, userIds: ['101'] } })
}
afterEach(() => resetWorld())

describe('public chair snapshots', () => {
  it.each([2, 3, 4])('accepts the approved %i-chair projection and nullable/unmapped anchors', chairCount => {
    expect(worldState(frame(1, { tables: [{ ...table, chairCount }] })).tables?.[0]?.chairCount).toBe(chairCount)
    expect(worldState(frame(1, { tables: [{ ...table, anchorId: null }] })).tables?.[0]?.anchorId).toBeNull()
  })
  it.each([
    null, {}, [{ ...table, chairCount: 1 }], [{ ...table, chairCount: 5 }], [{ ...table, chairCount: 2.5 }],
    [{ ...table, chairCount: '3' }], [{ ...table, chairCount: null }], [{ ...table, tableId: '' }],
    [{ ...table, anchorId: 5 }], [table, table], [table, { ...table, tableId: 'another-id' }],
  ])('rejects malformed or duplicate public tables: %j', tables => expect(() => worldState(frame(1, { tables }))).toThrow())
  it('replaces full snapshots, preserves stable references on movement-only ticks and copies only public fields', () => {
    begin(); publish(frame(1, { tables: [{ ...table, privateDraft: 'ignore' }] }))
    const first = useSession.getState().publicTables
    expect(first).toEqual({ 'issued-table-id': table })
    publish(frame(2, { avatars: [{ userId: '101', position: { ...position, x: 1 } }] }))
    expect(useSession.getState().publicTables).toBe(first)
    publish(frame(3, { tables: [{ ...table, chairCount: 4 }] }))
    expect(useSession.getState().publicTables?.['issued-table-id']?.chairCount).toBe(4)
    publish(frame(4, { tables: [] }))
    expect(useSession.getState().publicTables).toEqual({})
  })
  it('ignores old/foreign-channel snapshots and cannot publish malformed data or advance its version', () => {
    begin(); publish(frame(3))
    const approved = useSession.getState().publicTables
    publish(frame(2, { tables: [] })); publish(frame(4, { channelId: 'other', tables: [] }))
    expect(useSession.getState().publicTables).toBe(approved)
    expect(() => publish(frame(10, { tables: [{ ...table, chairCount: 7 }] }))).toThrow()
    publish(frame(4, { tables: [{ ...table, chairCount: 2 }] }))
    expect(useSession.getState().publicTables?.['issued-table-id']?.chairCount).toBe(2)
    expect(useSession.getState().tableId).toBe('')
    expect(useSession.getState().tableStates).toEqual({})
  })
  it('clears projections on legacy omission, map mismatch, channel exit and reconnect', () => {
    begin(); publish(frame(1)); publish(frame(2, { tables: undefined }))
    expect(useSession.getState().publicTables).toBeNull()
    publish(frame(3)); publish(frame(4, { mapVersion: 'wrong-map' }))
    expect(useSession.getState().publicTables).toBeNull()
    publish(frame(5)); clearChannel()
    expect(useSession.getState().publicTables).toBeNull()
    begin(); publish(frame(1)); resetWorld('reconnecting')
    expect(useSession.getState().publicTables).toBeNull()
  })
  it('validates the HTTP chairCount while remaining compatible with older summaries', () => {
    const summary = { tableId: 'issued-table-id', capacity: 4, occupiedSeats: 1, availableSeats: 3,
      joinable: true, gameCode: 'ONE_CARD', status: 'WAITING' }
    expect(tableSummary(summary).chairCount).toBeUndefined()
    for (const chairCount of [2, 3, 4]) expect(tableSummary({ ...summary, chairCount }).chairCount).toBe(chairCount)
    for (const chairCount of [null, 1, 5, 2.5, '3']) expect(() => tableSummary({ ...summary, chairCount })).toThrow()
  })
  it('uses the same explicitly bound public chairs for movement prediction and clears incompatible projections', () => {
    begin()
    useSession.setState({ bindings: [{ channelId: 'park', tableId: table.tableId, anchorId: table.anchorId }] })
    const update = vi.spyOn(localMovement, 'setChairs')
    publish(frame(1))
    expect(update).toHaveBeenLastCalledWith(new Map([['table-5', 3]]))
    publish(frame(2, { tables: [{ ...table, anchorId: 'wrong-anchor' }] }))
    expect(update).toHaveBeenLastCalledWith(new Map())
    publish(frame(3, { mapVersion: 'wrong-map' }))
    expect(update).toHaveBeenLastCalledWith(new Map())
  })
})
