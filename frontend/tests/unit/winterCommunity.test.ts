import { beforeEach, describe, expect, it } from 'vitest'
import { acceptWinterBuilding, acceptWinterTree, parseTreePage, resetWinterCommunity, useWinterCommunity } from '../../src/features/winter/community/state'

const at = '2026-11-21T01:00:00Z'
const status = (count: number, revision = count) => ({ count, revision, lit: count >= 100, litAt: count >= 100 ? at : null })
describe('공동 겨울 공원 수신 상태', () => {
  beforeEach(resetWinterCommunity)
  it('늦은 99개 응답이 100개 점등을 덮지 않는다', () => {
    acceptWinterTree(status(100)); expect(acceptWinterTree(status(99))).toBe(false)
    expect(useWinterCommunity.getState().tree?.lit).toBe(true)
  })
  it('익명 편지에 잘못 실린 이름도 화면 상태에 남기지 않는다', () => {
    const page = parseTreePage({ status: status(1), nextBefore: null, messages: [{ id: 1, text: '<script>문자</script>', anonymous: true, nickname: '숨길 이름', createdAt: at }] })
    expect(page.messages[0]!.nickname).toBeNull(); expect(page.messages[0]!.text).toBe('<script>문자</script>')
  })
  it('다른 채널과 낡은 눈 상태를 버린다', () => {
    const state = { channelId: 'a', version: 4, serverTime: at, balls: [], snowmen: [] }
    expect(acceptWinterBuilding(state, 'b')).toBe(false)
    expect(acceptWinterBuilding(state, 'a')).toBe(true)
    expect(acceptWinterBuilding({ ...state, version: 3 }, 'a')).toBe(false)
    expect(useWinterCommunity.getState().building?.version).toBe(4)
  })
  it('최대 크기를 넘거나 잠금 상태가 없는 눈덩이를 거부한다', () => {
    const ball = { id: '00000000-0000-4000-8000-000000000001', x: 1, groundY: 0, z: 2, radius: 1.11, pushing: [], reserved: false }
    const state = { channelId: 'a', version: 4, serverTime: at, balls: [ball], snowmen: [] }
    expect(acceptWinterBuilding(state, 'a')).toBe(false)
    expect(acceptWinterBuilding({ ...state, balls: [{ ...ball, radius: 1.1 }] }, 'a')).toBe(true)
  })
})
