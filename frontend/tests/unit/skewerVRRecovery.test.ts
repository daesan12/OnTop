import { describe, expect, it, vi } from 'vitest'
import { ChefPreview } from '../../src/features/skewer/chef/model'
import { chefRuntimeNotice } from '../../src/features/skewer/chef/vrNotice'
import { CoopClient } from '../../src/features/skewer/coop/client'
import { OnlineChef } from '../../src/features/skewer/coop/drivers'
import type { CoopSnapshot, CoopTransport } from '../../src/features/skewer/coop/contracts'
import type { Envelope } from '../../src/network/protocol'

function fixture() {
  const server: CoopSnapshot = { gameId: 'skewer-coop-00000000-0000-4000-8000-000000000001', version: 20, registered: true,
    privateState: { role: 'chef', chef: new ChefPreview().view() },
    publicState: { gameCode: 'SKEWER_COOP', phase: 'PLAYING', channelId: 'park', actionVersion: 1, round: 0,
      remaining: 200, elapsed: 40, countdown: 0, score: 0, served: 0, paused: false, chefVR: true, rankingEligible: true,
      entryFee: 0, rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: null,
      players: [{ userId: '101', role: 'chef', ready: true, connected: true }, { userId: '202', role: 'server', ready: true, connected: true }],
      greeting: { active: true, index: 4, remaining: 5, answered: false, responded: 0, speech: false } } }
  let connected = true
  const request = vi.fn<CoopTransport['request']>().mockImplementation(async type => {
    if (type === 'GAME_ACTION_SEND') { server.publicState.greeting.answered = true; server.version++ }
    return { type: type === 'GAME_STATE_CHECK' ? 'GAME_STATE' : 'GAME_ACTION_RESULT', payload: structuredClone(server) } as unknown as Envelope
  })
  const client = new CoopClient({ scope: () => ({ userId: '101', channelId: 'park', connected }), request,
    requestJSON: vi.fn().mockResolvedValue({ mine: null, rooms: [] }), subscribe: () => () => {} })
  client.store.setState({ snapshot: structuredClone(server) })
  return { client, server, request, chef: new OnlineChef(client), disconnect: () => { connected = false } }
}
const sent = (request: ReturnType<typeof fixture>['request']) => request.mock.calls.filter(([type]) => type === 'GAME_ACTION_SEND')
async function settled(chef: OnlineChef) { await vi.waitFor(() => expect(chef.view().cooperative?.greetingDelivery).not.toBe('pending')) }

describe('VR 인사 전송 실패 복구', () => {
  it('친구 연결이 끊겼으면 서버의 paused 갱신 전에도 요리·인사 입력을 보내지 않는다', () => {
    const { client, request, chef } = fixture()
    client.snapshot!.publicState.players[1].connected = false
    chef.action({ type: 'thread' }); chef.action({ type: 'submit' }); chef.action({ type: 'greet' })
    expect(request).not.toHaveBeenCalled()
    expect(chef.view().cooperative?.runtimeNotice?.blocking).toBe(true)
    client.stop()
  })
  it('실패한 인사를 재시도하면 서버 확인 뒤 한 번 전송하며 확인 완료 뒤에는 중복 전송하지 않는다', async () => {
    const { chef, request, client } = fixture()
    request.mockRejectedValueOnce(new Error('연결 지연'))
    chef.action({ type: 'greet' }); await settled(chef)
    expect(chef.view().cooperative?.greetingDelivery).toBe('retry')
    request.mockClear(); chef.action({ type: 'greet' }); chef.action({ type: 'greet' })
    expect(chef.view().cooperative?.greetingDelivery).toBe('pending')
    await settled(chef)
    expect(request.mock.calls.map(([type]) => type)).toEqual(['GAME_STATE_CHECK', 'GAME_ACTION_SEND', 'GAME_STATE_CHECK'])
    expect(chef.view().cooperative?.answered).toBe(true)
    chef.action({ type: 'greet' }); expect(sent(request)).toHaveLength(1)
    client.stop()
  })
  it('응답만 유실되고 서버에 이미 인사가 반영됐다면 확인만 하고 다시 보내지 않는다', async () => {
    const { chef, request, server, client } = fixture()
    request.mockImplementationOnce(async () => { server.publicState.greeting.answered = true; server.version++; throw new Error('응답 유실') })
    chef.action({ type: 'greet' }); await settled(chef)
    expect(chef.view().cooperative?.answered).toBe(false)
    chef.action({ type: 'greet' }); await settled(chef)
    expect(sent(request)).toHaveLength(1)
    expect(chef.view().cooperative?.answered).toBe(true)
    expect(client.store.getState().error).toBe('')
    client.stop()
  })
  it.each(['event', 'round', 'finished', 'paused', 'expired'] as const)('재시도 상태 확인 중 %s 경계를 지나면 지난 인사를 전송하지 않는다', async boundary => {
    const { chef, request, server, client } = fixture()
    request.mockRejectedValueOnce(new Error('실패'))
    chef.action({ type: 'greet' }); await settled(chef)
    if (boundary === 'event') server.publicState.greeting.index++
    if (boundary === 'round') server.publicState.round!++
    if (boundary === 'finished') server.publicState.phase = 'FINISHED'
    if (boundary === 'paused') server.publicState.paused = true
    if (boundary === 'expired') server.publicState.greeting.active = false
    server.version++
    chef.action({ type: 'greet' }); await settled(chef)
    expect(sent(request)).toHaveLength(1)
    if (boundary === 'event' || boundary === 'round') expect(chef.view().cooperative?.greetingDelivery).toBe('idle')
    client.stop()
  })
  it('상태 확인 실패도 재시도 가능하며 연결이 끊겼을 때는 전송하지 않는다', async () => {
    const { chef, request, disconnect, client } = fixture()
    request.mockRejectedValueOnce(new Error('실패'))
    chef.action({ type: 'greet' }); await settled(chef)
    request.mockRejectedValueOnce(new Error('상태 확인 실패'))
    chef.action({ type: 'greet' }); await settled(chef)
    expect(sent(request)).toHaveLength(1)
    expect(chef.view().cooperative?.greetingDelivery).toBe('retry')
    disconnect(); chef.action({ type: 'greet' })
    expect(sent(request)).toHaveLength(1)
    expect(chef.view().cooperative?.runtimeNotice?.kind).toBe('connection')
    client.stop()
  })
  it('대기 중인 최초 GREET도 다음 인사 이벤트에 적용하지 않는다', async () => {
    const { client, request, server } = fixture()
    let release!: (value: Envelope) => void
    request.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const pause = client.act({ type: 'PAUSE', paused: false })
    await Promise.resolve()
    const greeting = client.act({ type: 'GREET' })
    client.snapshot!.publicState.greeting.index++
    server.publicState.greeting.index++
    release({ payload: {} } as Envelope)
    await Promise.all([pause, greeting])
    expect(sent(request).filter(([, payload]) => (payload.input as { type: string }).type === 'GREET')).toHaveLength(0)
    client.stop()
  })
})

describe('VR 요리 오류와 친구 연결 안내', () => {
  const base = { phase: 'PLAYING', connected: true, friendConnected: true, paused: false, ownPause: false, restarting: false, error: '' }
  it('일반 오류는 원문과 함께 표시하고 요리 입력은 잠그지 않는다', () => {
    expect(chefRuntimeNotice({ ...base, error: '주문표를 다시 확인해 주세요.' })).toMatchObject({ kind: 'error', blocking: false, detail: '주문표를 다시 확인해 주세요.' })
  })
  it('친구 연결 안내가 이전 요리 오류보다 먼저 나오며 서버 확인 전 시간 정지를 단정하지 않는다', () => {
    const pending = chefRuntimeNotice({ ...base, friendConnected: false, error: '이전 오류' })!
    expect(pending).toMatchObject({ kind: 'connection', blocking: true, title: '친구와 다시 연결하고 있어요' })
    expect(pending.detail).not.toContain('멈췄어요')
    expect(chefRuntimeNotice({ ...base, friendConnected: false, paused: true })?.detail).toContain('영업 시간이 멈췄어요')
  })
  it('친구 일시정지와 내 연결 끊김을 구분하고 정상 복구·종료 후 안내를 없앤다', () => {
    expect(chefRuntimeNotice({ ...base, paused: true, pauseReason: 'EXIT_CONFIRM' })?.kind).toBe('pause')
    expect(chefRuntimeNotice({ ...base, connected: false })?.title).toContain('서버와')
    expect(chefRuntimeNotice(base)).toBeUndefined()
    expect(chefRuntimeNotice({ ...base, phase: 'FINISHED', connected: false, error: '오류' })).toBeUndefined()
    expect(chefRuntimeNotice({ ...base, paused: true, ownPause: true })).toBeUndefined()
  })
})
