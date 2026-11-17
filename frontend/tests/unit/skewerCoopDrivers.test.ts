import { describe, expect, it, vi } from 'vitest'
import { HallPreview } from '../../src/features/skewer/serviceHall/previewModel'
import { STATIONS, TABLES } from '../../src/features/skewer/serviceHall/plan'
import { OnlineHall, OnlineChef } from '../../src/features/skewer/coop/drivers'
import { ChefPreview } from '../../src/features/skewer/chef/model'
import type { CoopClient } from '../../src/features/skewer/coop/client'
import { parseCoop } from '../../src/features/skewer/coop/contracts'

function fixture() {
  const hall = new HallPreview().view(), act = vi.fn((_input: Record<string, unknown>, _quiet?: boolean) => Promise.resolve())
  const client = { snapshot: { gameId: 'skewer-coop-00000000-0000-4000-8000-000000000000', version: 1,
    registered: true, privateState: { role: 'server', hall }, publicState: { gameCode: 'SKEWER_COOP', actionVersion: 1, phase: 'PLAYING', channelId: 'park', players: [{ userId: '101', role: 'server' }, { userId: '202', role: 'chef' }], elapsed: 0, remaining: 240, countdown: 0, score: 0, served: 0, greeting: { active: false }, paused: false } }, playable: true, act }
  Object.assign(client, { transport: { scope: () => ({ userId: '101', channelId: 'park', connected: true }) } })
  client.snapshot.publicState.players.forEach(player => Object.assign(player, { connected: true }))
  return { client, driver: new OnlineHall(client as unknown as CoopClient), hall, act }
}
describe('협동 홀 입력의 서버 판정 경계', () => {
  it('이전 클릭 이동 진입점은 온라인 이동 요청을 전송하지 않는다', () => {
    const { driver, act } = fixture()
    driver.navigate({ x: 8, z: 0 })
    expect(act).not.toHaveBeenCalled()
  })
  it('시작과 방향 전환은 렌더 프레임을 기다리지 않고 보내며 다음 프레임에 중복하지 않는다', async () => {
    const clock = vi.spyOn(performance, 'now')
    try {
      const { driver, act } = fixture()
      clock.mockReturnValue(10)
      driver.step(0)
      driver.setMovement(1, 0)
      driver.step(1 / 60, 1, 0)
      await Promise.resolve()
      clock.mockReturnValue(26)
      driver.setMovement(-1, 0)
      await Promise.resolve()
      clock.mockReturnValue(42)
      driver.setMovement(0, 1)
      await Promise.resolve()
      clock.mockReturnValue(58)
      driver.setMovement(0, 0)
      expect(act.mock.calls.map(([input]) => input)).toEqual([
        { type: 'MOVE', dx: 1, dz: 0 }, { type: 'MOVE', dx: -1, dz: 0 },
        { type: 'MOVE', dx: 0, dz: 1 }, { type: 'MOVE', dx: 0, dz: 0 },
      ])
    } finally { clock.mockRestore() }
  })
  it('같은 이동을 유지할 때는 프레임마다 요청을 추가하지 않는다', async () => {
    const clock = vi.spyOn(performance, 'now')
    try {
      const { driver, act } = fixture()
      for (let now = 0; now < 300; now += 16) {
        clock.mockReturnValue(now)
        driver.step(1 / 60, 1, 0)
        await Promise.resolve()
      }
      expect(act).toHaveBeenCalledTimes(2)
    } finally { clock.mockRestore() }
  })
  it('응답을 기다리는 중에도 새 방향과 정지는 즉시 보내고 유지 입력은 중복하지 않는다', async () => {
    const { driver, act } = fixture()
    let acknowledge!: () => void
    act.mockImplementationOnce(() => new Promise<void>(resolve => { acknowledge = resolve }))
    driver.step(1 / 60, 1, 0)
    driver.step(1 / 60, -1, 0)
    driver.step(1 / 60, 0, 1)
    for (let i = 0; i < 20; i++) driver.step(1 / 60, 0, 1)
    expect(act).toHaveBeenCalledTimes(3)
    acknowledge()
    await Promise.resolve()
    driver.step(1 / 60, 0, 0)
    expect(act.mock.calls.map(([input]) => input)).toEqual([
      { type: 'MOVE', dx: 1, dz: 0 }, { type: 'MOVE', dx: -1, dz: 0 },
      { type: 'MOVE', dx: 0, dz: 1 }, { type: 'MOVE', dx: 0, dz: 0 },
    ])
  })
  it('늦은 서버 좌표를 받으며 전진해도 화면 위치가 주기적으로 뒤로 튀지 않는다', () => {
    const { client, driver, hall } = fixture()
    const start = { ...hall.position }
    let previous = start.x
    for (let frame = 0; frame < 120; frame++) {
      if (frame % 6 === 0) {
        hall.position = { x: start.x + Math.max(0, frame - 18) / 60 * 4.8, z: start.z }
        client.snapshot.publicState.elapsed = frame / 60
        client.snapshot.version++
      }
      driver.step(1 / 60, 1, 0)
      expect(driver.view().position.x).toBeGreaterThanOrEqual(previous)
      previous = driver.view().position.x
    }
  })
  it('MOVE 확인 응답이 추가되어도 서버 시각으로 위치를 일정하게 재생한다', () => {
    const { client, driver, hall } = fixture()
    const start = { ...hall.position }, steps: number[] = []
    let previous = start.x, sample = 0
    for (let frame = 0; frame <= 120; frame++) {
      const next = sample + 1
      const time = next * .06, delay = next % 2 ? .032 : .008
      if (frame === Math.ceil((time + delay) * 60)) {
        sample = next; hall.position = { x: start.x + time * 6, z: start.z }
        client.snapshot.publicState.elapsed = time; client.snapshot.version++
      }
      if (frame % 4 === 0) client.snapshot.version++
      driver.step(1 / 60, 1, 0)
      const x = driver.view().position.x
      if (frame > 30) steps.push(x - previous)
      previous = x
    }
    expect(Math.min(...steps)).toBeGreaterThan(.09)
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(.000001)
  })
  it('느린 렌더 프레임에서도 실제 경과 시간만큼 재생해 이동 지연이 누적되지 않는다', () => {
    const { client, driver, hall } = fixture()
    const start = hall.position.x
    driver.step(0)
    for (const elapsed of [.2, .4, .6]) {
      hall.position = { x: start + elapsed * 6, z: hall.position.z }
      client.snapshot.publicState.elapsed = elapsed; client.snapshot.version++
      driver.step(.2, 1, 0)
      expect(driver.view().position.x).toBeCloseTo(start + (elapsed - .11) * 6, 6)
    }
  })
  it.each([0, .6])('화면 복귀·긴 프레임 공백 dt=%s 뒤 서버 시각을 다시 맞춘다', dt => {
    const { client, driver, hall } = fixture()
    driver.step(1 / 60)
    hall.position = { x: hall.position.x + 1, z: hall.position.z }
    client.snapshot.publicState.elapsed = 10; client.snapshot.version++
    driver.step(dt)
    expect(driver.view().position).toEqual(hall.position)
    client.snapshot.publicState.elapsed = 10.1
    hall.position = { x: hall.position.x + .58, z: hall.position.z }; client.snapshot.version++
    for (let i = 0; i < 12; i++) driver.step(1 / 60)
    expect(driver.view().position.x).toBeGreaterThan(hall.position.x - .58)
    expect(driver.view().position.x).toBeLessThanOrEqual(hall.position.x)
  })
  it('이전 방향 응답만 지연돼도 새 방향의 이동 유지 요청은 계속 전송한다', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
    const { driver, act } = fixture()
    let acknowledge!: () => void
    act.mockImplementationOnce(() => new Promise<void>(resolve => { acknowledge = resolve }))
    try {
      driver.step(1 / 60, 1, 0)
      clock.mockReturnValue(16); driver.step(1 / 60, 0, 1)
      await Promise.resolve()
      clock.mockReturnValue(200); driver.step(1 / 60, 0, 1)
      expect(act.mock.calls.map(([input]) => input)).toEqual([
        { type: 'MOVE', dx: 1, dz: 0 }, { type: 'MOVE', dx: 0, dz: 1 }, { type: 'MOVE', dx: 0, dz: 1 },
      ])
    } finally { acknowledge(); clock.mockRestore() }
  })
  it('서버가 가구 앞에서 멈추면 화면만 가구 안으로 예측 이동하지 않는다', () => {
    const { driver, hall } = fixture()
    hall.position = { x: -1.4, z: -1.55 }
    for (let frame = 0; frame < 90; frame++) driver.step(1 / 60, 1, 0)
    expect(driver.view().position).toEqual(hall.position)
  })
  it('요리사 화면은 서버가 갱신한 동료 위치를 그대로 전달한다', () => {
    const { client } = fixture(), source = client as unknown as CoopClient
    source.snapshot!.privateState = { role: 'chef', chef: { ...new ChefPreview().view(), hallSight: { position: { x: 1, z: 2 }, carrying: false, cleaning: false, tables: [] } } }
    Object.assign(source, { store: { getState: () => ({ result: null, connected: true, error: '' }) } })
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
    Object.assign(source, { store: { getState: () => ({ result: null, connected: true, error: '' }) } })
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
  it('세척 중 빈 칸에 넣을 수량을 안내하고 서버에 투입 요청만 보낸다', () => {
    const { driver, hall, act } = fixture()
    hall.position = { ...STATIONS.washer }
    hall.washer = { load: [{ id: 1, table: 1, settings: 1 }], remaining: 4, completed: 0 }
    hall.dirtyDishes = [{ id: 2, table: 2, settings: 2 }, { id: 3, table: 3, settings: 1 }]

    expect(driver.actionLabel()).toBe('식기 1테이블분 넣기')
    expect(driver.blockedReason()).toBeNull()
    driver.press()

    expect(act.mock.calls.map(([input]) => input.type)).toEqual(['MOVE', 'INTERACT'])
    expect(hall.washer.load).toHaveLength(1)
    expect(hall.dirtyDishes).toHaveLength(2)
  })
  it('세척기가 가득 차면 추가 투입을 보내지 않는다', () => {
    const { driver, hall, act } = fixture()
    hall.position = { ...STATIONS.washer }
    hall.washer = { load: [{ id: 1, table: 1, settings: 1 }, { id: 2, table: 2, settings: 2 }], remaining: 4, completed: 0 }
    hall.dirtyDishes = [{ id: 3, table: 3, settings: 1 }]

    driver.press()

    expect(driver.blockedReason()).toContain('세척기 가득 참')
    expect(act).not.toHaveBeenCalled()
  })
  it('잘못된 게임 코드와 미전달 원본 주문이 섞인 요리사 상태 구조를 거절한다', () => {
    const { client } = fixture()
    expect(parseCoop(client.snapshot)).not.toBeNull()
    expect(parseCoop({ ...client.snapshot, publicState: { ...client.snapshot.publicState, gameCode: 'OMOK' } })).toBeNull()
    expect(parseCoop({ ...client.snapshot, privateState: { role: 'chef', chef: { visible: [{}, {}, {}], skewer: [] } } })).toBeNull()
  })
})
