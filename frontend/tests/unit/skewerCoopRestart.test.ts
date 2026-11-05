import { describe, expect, it, vi } from 'vitest'
import { CoopClient } from '../../src/features/skewer/coop/client'
import { parseCoop, type CoopSnapshot, type CoopTransport } from '../../src/features/skewer/coop/contracts'
import { HallPreview } from '../../src/features/skewer/serviceHall/previewModel'
import { ChefPreview } from '../../src/features/skewer/chef/model'
import { OnlineChef } from '../../src/features/skewer/coop/drivers'

function fixture() {
  const snapshot: CoopSnapshot = {
    gameId: 'skewer-coop-00000000-0000-4000-8000-000000000001', version: 1, registered: true,
    publicState: { gameCode: 'SKEWER_COOP', phase: 'PLAYING', channelId: 'park', actionVersion: 0,
      round: 0, restart: null, remaining: 180, elapsed: 60, countdown: 0, score: 420, served: 3,
      paused: false, pauseReason: '', pausedBy: [], rankingEligible: false, chefVR: false, entryFee: 0,
      rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: null,
      players: [{ userId: '101', role: 'server', ready: true, connected: true }, { userId: '202', role: 'chef', ready: true, connected: true }],
      greeting: { active: false, index: 0, remaining: 5, answered: false, responded: 0, speech: false } },
    privateState: { role: 'server', hall: new HallPreview().view() },
  }
  const request = vi.fn<CoopTransport['request']>().mockImplementation(async (type) => ({
    type: type === 'GAME_STATE_CHECK' ? 'GAME_STATE' : 'GAME_ACTION_RESULT', payload: structuredClone(snapshot),
  }) as never)
  const client = new CoopClient({ scope: () => ({ userId: '101', channelId: 'park', connected: true }), request,
    requestJSON: vi.fn(), subscribe: () => () => {} })
  client.store.setState({ snapshot })
  return { client, snapshot, request }
}

describe('협동 재시작 계약', () => {
  it('VR 요리사도 정지 중 현재 요청에 동의와 거절을 보낼 수 있다', async () => {
    const { client, snapshot, request } = fixture()
    snapshot.privateState = { role: 'chef', chef: new ChefPreview().view() }
    Object.assign(snapshot.publicState, { paused: true, pauseReason: 'RESTART_CONFIRM',
      restart: { id: '8', requestedBy: '202', expiresAt: Date.now() + 15000 } })
    const driver = new OnlineChef(client)
    expect(driver.view().cooperative?.restart).toEqual({ id: '8', own: false })
    driver.action({ type: 'restartDecline' })
    await client.act({ type: 'MOVE', dx: 0, dz: 0 })
    expect(request.mock.calls.filter(([type]) => type === 'GAME_ACTION_SEND')[0][1])
      .toMatchObject({ input: { type: 'RESTART_REPLY', requestId: '8', accept: false } })
  })
  it('동의 대기 중 일반 입력은 막고 요청 ID가 일치하는 응답만 전송한다', async () => {
    const { client, snapshot, request } = fixture()
    Object.assign(snapshot.publicState, { paused: true, pauseReason: 'RESTART_CONFIRM',
      restart: { id: '7', requestedBy: '202', expiresAt: Date.now() + 15000 } })
    await client.act({ type: 'INTERACT' })
    await client.act({ type: 'RESTART_REPLY', requestId: '6', accept: true })
    expect(request).not.toHaveBeenCalled()
    await client.act({ type: 'RESTART_REPLY', requestId: '7', accept: false })
    expect(request.mock.calls.filter(([type]) => type === 'GAME_ACTION_SEND')).toHaveLength(1)
    expect(request.mock.calls[0][1]).toMatchObject({ input: { type: 'RESTART_REPLY', requestId: '7', accept: false } })
  })
  it('서버가 재시작한 뒤 이전 판에서 대기 중이던 입력을 보내지 않는다', async () => {
    const { client, snapshot, request } = fixture()
    const pending = client.act({ type: 'INTERACT' })
    snapshot.publicState.round = 1
    await pending
    expect(request).not.toHaveBeenCalled()
  })
  it('낡은 입력 복구 중 새 판으로 바뀌면 재전송하지 않는다', async () => {
    const { client, snapshot, request } = fixture()
    request.mockImplementation(async (type) => {
      if (type === 'GAME_ACTION_SEND') throw { code: 'GAME_ACTION_STALE_VERSION' }
      snapshot.publicState.round = 1; snapshot.version++
      return { type: 'GAME_STATE', payload: structuredClone(snapshot) } as never
    })
    await client.act({ type: 'INTERACT' })
    expect(request.mock.calls.filter(([type]) => type === 'GAME_ACTION_SEND')).toHaveLength(1)
  })
  it('새 필드는 기존 응답과 호환되며 비참가자의 동의 요청과 잘못된 라운드를 거절한다', () => {
    const { snapshot } = fixture()
    expect(parseCoop(snapshot)).not.toBeNull()
    Object.assign(snapshot.publicState, { paused: true, pauseReason: 'RESTART_CONFIRM',
      restart: { id: '1', requestedBy: '202', expiresAt: Date.now() + 15000 } })
    expect(parseCoop(snapshot)).not.toBeNull()
    snapshot.publicState.restart!.requestedBy = '999'
    expect(parseCoop(snapshot)).toBeNull()
    snapshot.publicState.restart = null; snapshot.publicState.round = -1
    expect(parseCoop(snapshot)).toBeNull()
  })
})
