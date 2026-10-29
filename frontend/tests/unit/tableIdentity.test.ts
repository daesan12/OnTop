import { describe, it, expect, beforeEach } from 'vitest'
import { bindAnchor, parseBindings } from '../../src/network/tableBindings'
import { TABLES } from '../../src/config'
import { receive, resetWorld, useSession } from '../../src/network/worldClient'
const anchorId = TABLES[0]!.id
beforeEach(() => resetWorld())
describe('explicit server table identities', () => {
  it('never maps a UUID or a list position implicitly', () => {
    expect(bindAnchor([], 'a', anchorId, ['table-server'])).toBeNull()
    expect(
      bindAnchor(
        [{ channelId: 'a', anchorId, tableId: 'table-server' }],
        'a',
        anchorId,
        ['different'],
      ),
    ).toBeNull()
  })
  it('requires known anchors and one-to-one mappings within each channel', () => {
    expect(() =>
      parseBindings([{ channelId: 'a', tableId: 't', anchorId: 'unknown' }]),
    ).toThrow()
    expect(() =>
      parseBindings([
        { channelId: 'a', tableId: 't', anchorId },
        { channelId: 'a', tableId: 'other', anchorId },
      ]),
    ).toThrow()
    expect(
      bindAnchor(
        parseBindings([{ channelId: 'a', tableId: 't', anchorId }]),
        'a',
        anchorId,
        ['t'],
      ),
    ).toBe('t')
  })
  it('assigns the own seat only from TABLE_STATE and preserves it on a rejected action', () => {
    useSession.setState({
      sessionId: '101',
      tables: [
        {
          tableId: 't',
          capacity: 2,
          occupiedSeats: 1,
          availableSeats: 1,
          joinable: true,
          gameCode: null, betAmountPerPlayer: null,
          status: 'WAITING',
        },
      ],
    })
    const payload = {
      tableId: 't',
      version: 2,
      capacity: 2,
      minimumPlayers: 2,
      seats: [
        { seatNumber: 1, userId: '102', ready: false },
        { seatNumber: 2, userId: '101', ready: false },
      ],
      allReady: false,
      selectorUserId: '102',
      gameCode: null, betAmountPerPlayer: null,
      targetScore: null,
    }
    receive({ type: 'TABLE_WATCH_STATE', requestId: null, payload })
    expect(useSession.getState().tableId).toBe('')
    receive({ type: 'TABLE_STATE', requestId: 'join', payload })
    expect(useSession.getState().seatIndex).toBe(1)
    receive({
      type: 'ERROR',
      requestId: 'next',
      payload: { code: 'TABLE_FULL', message: '만석' },
    })
    expect(useSession.getState().tableId).toBe('t')
    receive({
      type: 'TABLE_STATE',
      requestId: null,
      payload: {
        ...payload,
        version: 1,
        seats: [
          { seatNumber: 1, userId: null, ready: false },
          { seatNumber: 2, userId: null, ready: false },
        ],
        selectorUserId: null,
      },
    })
    expect(useSession.getState().seatIndex).toBe(1)
  })
})
