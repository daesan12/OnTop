import { describe, expect, it, vi } from 'vitest'
import { parseYut } from '../../src/game/yutnori/contracts'
import { YutClient } from '../../src/game/yutnori/client'
import type { CoopTransport } from '../../src/features/skewer/coop/contracts'

function snapshot() {
  return { gameId: 'yut-test', version: 1, registered: true, role: 'PLAYER', publicState: {
    gameCode: 'YUTNORI', phase: 'PLAYING', channelId: 'channel-1', roomName: '함께', host: '101', turnUser: '101',
    team: 0, credits: 1, deadline: 90000, winner: -1, reason: '', message: '', entryFee: 0,
    rules: { emptyBackEnters: false, doubleCaptureBonus: false, backHomeFinish: false },
    players: [{ userId: '101', nickname: '청', team: 0, ready: true, connected: true },
      { userId: '202', nickname: '홍', team: 1, ready: true, connected: true }],
    pieces: [[0, 0, 0, 0], [0, 0, 0, 0]], rolls: [], moves: [], opening: [0, 3], log: [],
  } }
}

describe('윷놀이 서버 계약과 유실 입력 복구', () => {
  it('다른 게임과 잘못된 말판 응답을 거절한다', () => {
    expect(parseYut(snapshot())).not.toBeNull()
    const other = snapshot(); other.publicState.gameCode = 'SKEWER_COOP'
    expect(parseYut(other)).toBeNull()
    const wrong = snapshot(); wrong.publicState.pieces[0][0] = -1
    expect(parseYut(wrong)).toBeNull()
  })

  it('응답 유실 후 새 던지기를 막고 동일 행동 ID로 재확인한다', async () => {
    const requests: Record<string, unknown>[] = []
    const transport: CoopTransport = {
      scope: () => ({ userId: '101', channelId: 'channel-1', connected: true }), subscribe: () => () => {},
      requestJSON: async () => ({ rooms: [], mine: snapshot() }),
      request: vi.fn(async (_type, payload) => {
        if (_type !== 'GAME_ACTION_SEND') return { type: 'GAME_CONNECTION_STATE', payload: {} }
        requests.push(structuredClone(payload))
        if (requests.length === 1) throw new Error('timeout')
        return { type: 'GAME_ACTION_RESULT', payload: {} }
      }) as CoopTransport['request'],
    }
    const client = new YutClient(transport)
    client.start()
    await client.refresh()
    await client.act({ type: 'THROW' })
    expect(client.store.getState().uncertain).toBe(true)
    await client.act({ type: 'THROW' })
    expect(requests).toHaveLength(1)
    await client.retry()
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(client.store.getState().uncertain).toBe(false)
    client.stop()
  })
})
