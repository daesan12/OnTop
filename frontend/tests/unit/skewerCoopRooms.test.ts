import { describe, expect, it, vi } from 'vitest'
import { CoopClient } from '../../src/features/skewer/coop/client'
import type { CoopSnapshot, CoopTransport } from '../../src/features/skewer/coop/contracts'

const id = 'skewer-coop-00000000-0000-4000-8000-000000000001'
function snapshot(): CoopSnapshot {
  return { gameId: id, version: 1, registered: true, privateState: { role: '' }, publicState: {
    gameCode: 'SKEWER_COOP', phase: 'WAITING', channelId: 'park', actionVersion: 1,
    remaining: 240, elapsed: 0, countdown: 0, score: 0, served: 0, paused: false, chefVR: false,
    rankingEligible: false, entryFee: 0, rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: null,
    players: [{ userId: '101', role: '', ready: false, connected: true }, { userId: '202', role: '', ready: false, connected: true }],
    greeting: { active: false, index: 0, remaining: 0, answered: false, responded: 0, speech: false },
  } }
}
function fixture() {
  const requestJSON = vi.fn<CoopTransport['requestJSON']>().mockResolvedValue(null)
  const request = vi.fn<CoopTransport['request']>().mockResolvedValue({ payload: {} } as never)
  const client = new CoopClient({ scope: () => ({ userId: '101', channelId: 'park', connected: true }), requestJSON, request, subscribe: () => () => {} })
  return { client, request, requestJSON }
}
describe('협동 방 탐색과 준비 취소', () => {
  it('가게 이름과 비밀번호를 POST 본문으로만 전송한다', async () => {
    const { client, requestJSON } = fixture()
    requestJSON.mockResolvedValue({ ...snapshot(), registered: false })
    await client.enter(undefined, { roomName: '달빛 꼬치집', password: 'friend123' })
    const [path, init] = requestJSON.mock.calls[0]
    expect(path).not.toContain('friend123')
    expect(JSON.parse(String(init?.body))).toMatchObject({ roomName: '달빛 꼬치집', password: 'friend123', channelId: 'park' })
  })
  it('비밀번호 오류를 표시하고 역할 화면으로 넘어가지 않는다', async () => {
    const { client, requestJSON } = fixture()
    requestJSON.mockRejectedValue({ code: 'SKEWER_COOP_PASSWORD_INVALID', message: '서버 요청에 실패했습니다. (409)' })
    expect(await client.enter(id, { password: 'wrong' })).toBe(false)
    expect(client.snapshot).toBeNull()
    expect(client.store.getState().error).toBe('비밀번호가 맞지 않아요.')
  })
  it('비밀번호 확인 후 정원이 마감되면 정원 안내를 표시하고 다른 방을 고를 수 있게 유지한다', async () => {
    const { client, requestJSON } = fixture()
    client.store.setState({ lobbyPage: 'rooms' })
    requestJSON.mockRejectedValue({ code: 'SKEWER_COOP_ROOM_FULL', message: '서버 요청에 실패했습니다. (409)' })

    expect(await client.enter(id, { password: 'correct123' })).toBe(false)

    expect(client.store.getState()).toMatchObject({ snapshot: null, pending: false, lobbyPage: 'rooms',
      error: '가게 인원이 가득 찼어요. 다른 가게를 선택해 주세요.' })
    expect(requestJSON).toHaveBeenCalledTimes(1)
  })
  it('반복 비밀번호 오류 제한은 정원 마감 안내와 구분한다', async () => {
    const { client, requestJSON } = fixture()
    requestJSON.mockRejectedValue({ code: 'SKEWER_COOP_PASSWORD_THROTTLED' })

    expect(await client.enter(id, { password: 'wrong' })).toBe(false)

    expect(client.store.getState().error).toContain('30초 후')
    expect(client.store.getState().error).not.toContain('가득')
  })
  it('두명이 역할선택중이어도 기권하지 않고 나간 뒤 방 목록으로 돌아온다', async () => {
    const { client, request, requestJSON } = fixture()
    client.store.setState({ snapshot: snapshot() })
    await client.leave()
    expect(request).not.toHaveBeenCalled()
    expect(requestJSON.mock.calls[0][0]).toMatch(/\/leave$/)
    expect(client.snapshot).toBeNull()
    expect(client.store.getState().lobbyPage).toBe('rooms')
    requestJSON.mockResolvedValue({ mine: snapshot(), rooms: [] })
    await client.refresh()
    expect(client.snapshot).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })
  it('동료가 준비중 나가면 완료화면 대신 목록을 보여주고 정산을 조회하지 않는다', async () => {
    const { client, requestJSON } = fixture()
    client.store.setState({ snapshot: snapshot() })
    const cancelled = snapshot()
    cancelled.publicState.phase = 'FINISHED'
    cancelled.publicState.endReason = 'SKEWER_CANCELLED'
    requestJSON.mockResolvedValue({ mine: cancelled, rooms: [] })
    await client.refresh()
    expect(client.snapshot).toBeNull()
    expect(client.store.getState().lobbyPage).toBe('rooms')
    expect(requestJSON.mock.calls.every(([path]) => !path.includes('/result'))).toBe(true)
  })
  it('퇴장 실패시 현재 방을 유지해서 다시 시도할 수 있다', async () => {
    const { client, requestJSON } = fixture()
    client.store.setState({ snapshot: snapshot() })
    requestJSON.mockRejectedValue(new Error('offline'))
    await expect(client.leave()).rejects.toThrow('offline')
    expect(client.snapshot?.gameId).toBe(id)
  })
})
