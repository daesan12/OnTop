import { describe, expect, it, vi } from 'vitest'
import { boardNodes, boardJunctions, boardPoint } from '../../src/game/yutnori/Board'
import { stickFaces } from '../../src/game/yutnori/StickResult'
import { parseYut } from '../../src/game/yutnori/contracts'
import { YutClient } from '../../src/game/yutnori/client'
import type { CoopTransport } from '../../src/features/skewer/coop/contracts'

function snapshot() {
  return { gameId: 'yut-test', version: 1, registered: true, role: 'PLAYER', privateState: {} as { teamChat?: unknown[] }, publicState: {
    gameCode: 'YUTNORI', phase: 'PLAYING', channelId: 'channel-1', roomName: '함께', host: '101', turnUser: '101',
    teamCount: 2, pieceCount: 4, eliminatedTeams: [], team: 0, credits: 1, deadline: 90000, winner: -1, reason: '', message: '', entryFee: 0,
    rules: { emptyBackEnters: false, doubleCaptureBonus: false, backHomeFinish: false },
    players: [{ userId: '101', nickname: '청', team: 0, ready: true, connected: true },
      { userId: '202', nickname: '홍', team: 1, ready: true, connected: true }],
    chat: [] as unknown[], pieces: [[0, 0, 0, 0], [0, 0, 0, 0]], rolls: [], moves: [], opening: [0, 3], log: [],
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
        if (_type !== 'GAME_ACTION_SEND') return { type: 'GAME_CONNECTION_STATE', requestId: 'yut-test', payload: {} }
        requests.push(structuredClone(payload))
        if (requests.length === 1) throw new Error('timeout')
        return { type: 'GAME_ACTION_RESULT', requestId: 'yut-test', payload: {} }
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


describe('공식 29칸과 빽도 표식, 다팀 계약', () => {
  it('바깥 20칸 안쪽 9칸을 중복 없이 그리고 다섯 교차점만 크게 그린다', () => {
    expect(boardNodes).toHaveLength(29)
    expect(new Set(boardNodes.map(node => boardPoint(node).join(','))).size).toBe(29)
    expect(boardJunctions).toEqual([5, 10, 15, 20, 23])
    expect(boardJunctions).not.toContain(25)
    expect(boardPoint(20)).toEqual([460, 460])
    expect(boardPoint(1)).toEqual([460, 380])
  })
  it('16가지 조합에서 표식은 첫 윷의 평평한 면에만 나타난다', () => {
    for (let mask = 0; mask < 16; mask++) {
      const faces = stickFaces(mask)
      expect(faces.filter(face => face.marked)).toHaveLength(mask & 1 ? 1 : 0)
      expect(faces.slice(1).every(face => !face.marked)).toBe(true)
    }
    expect(stickFaces(1)).toEqual([{ flat: true, marked: true }, ...Array.from({ length: 3 }, () => ({ flat: false, marked: false }))])
  })
  it('2~4팀과 말 1~4개를 받고 팀과 말의 범위가 다른 응답을 거절한다', () => {
    for (const teams of [2, 3, 4]) for (const pieces of [1, 2, 3, 4]) {
      const state = snapshot()
      state.publicState.teamCount = teams; state.publicState.pieceCount = pieces
      state.publicState.pieces = Array.from({ length: teams }, () => Array(pieces).fill(0))
      state.publicState.winner = teams - 1
      expect(parseYut(state)).not.toBeNull()
      state.publicState.players[0].team = teams
      expect(parseYut(state)).toBeNull()
    }
    const wrong = snapshot(); wrong.publicState.pieceCount = 3
    expect(parseYut(wrong)).toBeNull()
  })
})


it('팀 대화를 공개 채팅이나 관전자 개인 상태로 받지 않는다', () => {
  const message = { id: 1, scope: 'TEAM', team: 0, userId: '101', nickname: '청', text: '비밀', sentAt: 1000 }
  const state = snapshot(); state.privateState.teamChat = [message]
  expect(parseYut(state)).not.toBeNull()
  state.publicState.chat = [message]
  expect(parseYut(state)).toBeNull()
  state.publicState.chat = []; state.role = 'SPECTATOR'
  expect(parseYut(state)).toBeNull()
  state.privateState = {}
  expect(parseYut(state)).not.toBeNull()
})


it('채팅 전송이 거절되면 실패를 반환하여 입력을 지우지 않도록 한다', async () => {
  const transport: CoopTransport = {
    scope: () => ({ userId: '101', channelId: 'channel-1', connected: true }), subscribe: () => () => {},
    requestJSON: async (_url, init) => {
      if (init?.method === 'POST') throw Object.assign(new Error('409'), { code: 'YUT_REJECTED' })
      return { rooms: [], mine: snapshot() }
    }, request: vi.fn() as CoopTransport['request'],
  }
  const client = new YutClient(transport); client.start(); await client.refresh()
  expect(await client.chat('ALL', '남겨둘 메시지')).toBe(false)
  expect(client.store.getState().error).toContain('입력은 남겨두었으니')
  client.stop()
})
