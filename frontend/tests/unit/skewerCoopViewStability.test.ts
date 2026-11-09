import { describe, expect, it, vi } from 'vitest'
import { CoopClient } from '../../src/features/skewer/coop/client'
import { ChefPreview } from '../../src/features/skewer/chef/model'
import { HallPreview } from '../../src/features/skewer/serviceHall/previewModel'
import type { CoopSnapshot, CoopTransport } from '../../src/features/skewer/coop/contracts'
import type { Envelope } from '../../src/network/protocol'
import { OnlineChef, OnlineHall } from '../../src/features/skewer/coop/drivers'

function snapshot(role: 'chef' | 'server' = 'chef'): CoopSnapshot {
  return { gameId: 'skewer-coop-00000000-0000-4000-8000-000000000001', version: 10, registered: true,
    privateState: role === 'chef' ? { role, chef: new ChefPreview().view() } : { role, hall: new HallPreview().view() },
    publicState: { gameCode: 'SKEWER_COOP', phase: 'PLAYING', channelId: 'park', actionVersion: 1, round: 0,
      remaining: 240, elapsed: 0, countdown: 0, score: 0, served: 0, paused: false, chefVR: false,
      rankingEligible: true, entryFee: 0, rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: null,
      players: [{ userId: '101', role, ready: true, connected: true }, { userId: '202', role: role === 'chef' ? 'server' : 'chef', ready: true, connected: true }],
      greeting: { active: false, index: 0, remaining: 0, answered: false, responded: 0, speech: false } } }
}
function fixture() {
  let publish!: (message: Envelope) => boolean
  const requestJSON = vi.fn<CoopTransport['requestJSON']>().mockResolvedValue({ rooms: [] })
  const client = new CoopClient({ scope: () => ({ userId: '101', channelId: 'park', connected: true }),
    requestJSON, request: async () => ({ payload: {} }) as Envelope, subscribe: fn => { publish = fn; return () => {} } })
  client.start()
  return { client, requestJSON, publish: (value: CoopSnapshot) => publish({ type: 'GAME_STATE', payload: value } as unknown as Envelope) }
}
describe('협동 역할 화면 고정과 낡은 응답 격리', () => {
  it.each(['chef', 'server'] as const)('%s의 인사 완료 문구는 같은 스냅샷이 반복돼도 3.5초 뒤 사라진다', role => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
    const { client, publish } = fixture()
    try {
      const current = snapshot(role); current.publicState.message = '인사 완료! +24점'; publish(current)
      const driver = role === 'chef' ? new OnlineChef(client) : new OnlineHall(client)
      expect(driver.view().message).toContain('인사 완료')
      clock.mockReturnValue(3501); current.version++; publish(current)
      expect(driver.view().message).toBe('')
      clock.mockReturnValue(8000); current.version++; publish(current)
      expect(driver.view().message).toBe('')
    } finally { client.stop(); clock.mockRestore() }
  })
  it('동료의 비공개 화면이 오면 버전이 높아도 요리사 화면을 서빙 화면으로 바꾸지 않는다', () => {
    const { client, publish } = fixture()
    try {
      const own = snapshot(); publish(own)
      const peer = snapshot(); peer.version++; peer.privateState = snapshot('server').privateState
      publish(peer)
      expect(client.snapshot).toEqual(own)
    } finally { client.stop() }
  })
  it('경기 중 역할 교환·이전 카운트다운·다른 경기 응답을 모두 무시한다', () => {
    const { client, publish } = fixture()
    try {
      const own = snapshot(); publish(own)
      const changed = snapshot('server'); changed.version++; publish(changed)
      const countdown = snapshot(); countdown.publicState.phase = 'COUNTDOWN'; countdown.version++; publish(countdown)
      const other = snapshot(); other.gameId = other.gameId.replace(/1$/, '2'); publish(other)
      expect(client.snapshot).toEqual(own)
    } finally { client.stop() }
  })
  it('같은 역할의 일시정지·인사·새 라운드는 화면을 유지하며 갱신한다', () => {
    const { client, publish } = fixture()
    try {
      publish(snapshot())
      const next = snapshot(); next.version++; next.publicState.round = 1; next.publicState.phase = 'COUNTDOWN'; next.publicState.paused = true
      publish(next)
      expect(client.snapshot).toEqual(next)
      expect(client.snapshot?.privateState.role).toBe('chef')
    } finally { client.stop() }
  })
  it('대기실에서는 정상적인 역할 선택을 허용한다', () => {
    const { client, publish } = fixture()
    try {
      const waiting = snapshot(); waiting.publicState.phase = 'WAITING'; publish(waiting)
      const selected = snapshot('server'); selected.version++; selected.publicState.phase = 'WAITING'; publish(selected)
      expect(client.snapshot).toEqual(selected)
    } finally { client.stop() }
  })
})
