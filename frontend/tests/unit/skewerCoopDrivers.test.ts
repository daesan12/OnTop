import { describe, expect, it, vi } from 'vitest'
import { HallPreview } from '../../src/features/skewer/serviceHall/previewModel'
import { TABLES } from '../../src/features/skewer/serviceHall/plan'
import { OnlineHall, OnlineChef } from '../../src/features/skewer/coop/drivers'
import { ChefPreview } from '../../src/features/skewer/chef/model'
import type { CoopClient } from '../../src/features/skewer/coop/client'
import { parseCoop } from '../../src/features/skewer/coop/contracts'

function fixture() {
  const hall = new HallPreview().view(), act = vi.fn((_input: Record<string, unknown>, _quiet?: boolean) => Promise.resolve())
  const client = { snapshot: { gameId: 'skewer-coop-00000000-0000-4000-8000-000000000000', version: 1,
    registered: true, privateState: { role: 'server', hall }, publicState: { gameCode: 'SKEWER_COOP', actionVersion: 1, phase: 'PLAYING', channelId: 'park', players: [{ userId: '101', role: 'server' }, { userId: '202', role: 'chef' }], elapsed: 0, remaining: 240, countdown: 0, score: 0, served: 0, greeting: { active: false }, paused: false } }, playable: true, act }
  return { client, driver: new OnlineHall(client as unknown as CoopClient), hall, act }
}
describe('협동 홀 입력의 서버 판정 경계', () => {
  it('요리사 화면은 서버가 갱신한 동료 위치를 그대로 전달한다', () => {
    const { client } = fixture(), source = client as unknown as CoopClient
    source.snapshot!.privateState = { role: 'chef', chef: { ...new ChefPreview().view(), hallSight: { position: { x: 1, z: 2 }, carrying: false, cleaning: false, tables: [] } } }
    Object.assign(source, { store: { getState: () => ({ result: null }) } })
    const chef = new OnlineChef(source)
    expect(chef.view().hallSight?.position).toEqual({ x: 1, z: 2 })
    source.snapshot!.privateState.chef!.hallSight!.position = { x: 3, z: 4 }
    expect(chef.view().hallSight?.position).toEqual({ x: 3, z: 4 })
  })
  it('요리사로 바뀌는 순간 이전 홀 장면의 마지막 프레임을 유지한다', () => {
    const { client, driver } = fixture()
    const last = driver.view()
    Reflect.deleteProperty(client.snapshot.privateState, 'hall')
    client.snapshot.privateState.role = 'chef'
    expect(driver.view()).toBe(last)
    expect(driver.view().tables).toHaveLength(6)
  })
  it('서빙 담당으로 바뀌는 순간 이전 주방 장면이 전달받은 주문만 유지한다', () => {
    const { client } = fixture()
    const source = client as unknown as CoopClient
    source.snapshot!.privateState = { role: 'chef', chef: new ChefPreview().view() }
    Object.assign(source, { store: { getState: () => ({ result: null }) } })
    const chef = new OnlineChef(source), last = chef.view()
    source.snapshot!.privateState = { role: 'server', hall: new HallPreview().view() }
    expect(chef.view()).toBe(last)
    expect(chef.view().visible).toHaveLength(2)
  })
  it('화면 이동 예측보다 서버가 확정한 위치로 상호작용 가능 여부를 표시한다', () => {
    const { driver, hall } = fixture()
    hall.position = { ...TABLES[1].approach }
    for (let i = 0; i < 12; i++) driver.step(.05, 1, 0)
    expect(driver.nearest()).toEqual({ kind: 'table', id: 2 })
    expect(driver.actionLabel()).toBe('2번 청소하기')
  })
  it('서버 응답 전에 E를 놓아도 청소 취소가 시작 요청 뒤에 전송된다', () => {
    const { driver, hall, act } = fixture()
    hall.position = { ...TABLES[1].approach }
    driver.press(); driver.release()
    expect(act.mock.calls.map(call => (call[0] as unknown as { type: string }).type)).toEqual(['MOVE', 'INTERACT', 'CLEAN_CANCEL'])
    expect(hall.clean).toBeNull()
  })
  it('가만히 있을 때 불필요한 이동 요청을 반복하지 않는다', async () => {
    const { driver, act } = fixture()
    for (let i = 0; i < 10; i++) { driver.step(.05); await Promise.resolve() }
    expect(act).not.toHaveBeenCalled()
  })
  it('잘못된 게임 코드와 미전달 원본 주문이 섞인 요리사 상태 구조를 거절한다', () => {
    const { client } = fixture()
    expect(parseCoop(client.snapshot)).not.toBeNull()
    expect(parseCoop({ ...client.snapshot, publicState: { ...client.snapshot.publicState, gameCode: 'OMOK' } })).toBeNull()
    expect(parseCoop({ ...client.snapshot, privateState: { role: 'chef', chef: { visible: [{}, {}, {}], skewer: [] } } })).toBeNull()
  })
})
