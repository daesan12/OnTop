import { describe, expect, it, vi } from 'vitest'
import { ParkXRMovement } from '../../src/features/parkXR/movement'
import { emptyInput, readXRInput, SNAP_ANGLE } from '../../src/world/xrInput'

const create = () => {
  const port = { move: vi.fn(), stopMovement: vi.fn() }
  return { port, driver: new ParkXRMovement(port) }
}
const forward = { ...emptyInput(), forward: 1 }
describe('공원 XR 이동 계약', () => {
  it('검증한 Quest 표준 매핑을 공원 방향과 60ms 간격으로 전달한다', () => {
    const { port, driver } = create()
    driver.update(emptyInput(), 0, 0, true)
    const input = readXRInput([{ handedness: 'left', gamepad: {
      mapping: 'xr-standard', axes: [0, 0, 0, -1], buttons: [],
    } as unknown as Gamepad }])
    driver.update(input, Math.PI / 2, 10, true)
    driver.update(input, Math.PI / 2, 69, true)
    expect(port.move).toHaveBeenCalledTimes(1)
    expect(port.move.mock.calls[0]![0]).toBeCloseTo(-1)
    expect(port.move.mock.calls[0]![1]).toBeCloseTo(0)
    expect(port.move.mock.calls[0]!.slice(2)).toEqual([false, false])
    driver.update(input, Math.PI / 2, 70, true)
    expect(port.move).toHaveBeenCalledTimes(2)
    driver.update(emptyInput(), 0, 71, true)
    expect(port.move.mock.lastCall![0]).toBeCloseTo(0)
    expect(port.move.mock.lastCall![1]).toBeCloseTo(0)
    expect(port.move.mock.lastCall!.slice(2)).toEqual([false, false])
  })
  it('A 버튼은 전송 간격 전에도 즉시 큐에 넣고 누르는 동안 한 번만 전달한다', () => {
    const { port, driver } = create()
    driver.update(emptyInput(), 0, 0, true)
    driver.update(forward, 0, 1, true)
    driver.update({ ...forward, jump: true }, 0, 2, true)
    driver.update({ ...forward, jump: true }, 0, 90, true)
    expect(port.move.mock.calls.filter(call => call[3])).toHaveLength(1)
    driver.update(forward, 0, 91, true)
    driver.update({ ...forward, jump: true }, 0, 92, true)
    expect(port.move.mock.calls.filter(call => call[3])).toHaveLength(2)
  })
  it('처음 누른 채 진입한 스틱·A는 중앙 복귀·버튼 해제 후부터 작동한다', () => {
    const { port, driver } = create()
    driver.reset()
    driver.update({ ...forward, jump: true }, 0, 0, true)
    driver.update({ ...forward, jump: true }, 0, 100, true)
    expect(port.move).not.toHaveBeenCalled()
    driver.update(emptyInput(), 0, 101, true)
    driver.update({ ...forward, jump: true }, 0, 102, true)
    expect(port.move).toHaveBeenCalledTimes(1)
    expect(port.move).toHaveBeenLastCalledWith(0, -1, false, true)
  })
  it('메뉴·추적 중단은 정지시키고 복귀 시 잡고 있던 입력을 재사용하지 않는다', () => {
    const { port, driver } = create()
    driver.update(emptyInput(), 0, 0, true)
    driver.update(forward, 0, 1, true)
    driver.update({ ...forward, jump: true }, 0, 2, false)
    expect(port.stopMovement).toHaveBeenCalledTimes(1)
    driver.update({ ...forward, jump: true }, 0, 100, true)
    expect(port.move).toHaveBeenCalledTimes(1)
    driver.update(emptyInput(), 0, 101, true)
    driver.update(forward, 0, 102, true)
    expect(port.move).toHaveBeenCalledTimes(2)
  })
  it('스냅 회전은 한 번 적용하고 새 방향으로 이동한다', () => {
    const { port, driver } = create()
    driver.update(emptyInput(), 0, 0, true)
    const turn = driver.update({ ...forward, turn: 1 }, 0, 1, true)
    expect(turn).toBe(-SNAP_ANGLE)
    expect(port.move.mock.calls[0]![0]).toBeCloseTo(.5)
    expect(port.move.mock.calls[0]![1]).toBeCloseTo(-Math.sqrt(3) / 2)
    expect(driver.update({ ...forward, turn: 1 }, turn, 70, true)).toBe(0)
  })
  it('클라이언트 위치 모드에서는 정지 상태도 같은 주기로 유지한다', () => {
    const { port, driver } = create()
    for (const time of [0, 59, 60, 119, 120]) driver.update(emptyInput(), 0, time, true, true)
    expect(port.move).toHaveBeenCalledTimes(3)
    for (const call of port.move.mock.calls) {
      expect(call[0]).toBeCloseTo(0); expect(call[1]).toBeCloseTo(0)
      expect(call.slice(2)).toEqual([false, false])
    }
  })
  it('잘못된 시각·방향 값은 이동을 중단한다', () => {
    const { port, driver } = create()
    driver.update(emptyInput(), 0, 0, true)
    driver.update(forward, 0, 1, true)
    driver.update(forward, NaN, 2, true)
    driver.update(forward, 0, Infinity, true)
    expect(port.stopMovement).toHaveBeenCalledTimes(1)
    expect(port.move).toHaveBeenCalledTimes(1)
  })
  it('왼손 그립 달리기를 기존 run 계약으로 전달하고 해제 즉시 걷기로 전환한다', () => {
    const { port, driver } = create()
    driver.update(emptyInput(), 0, 0, true)
    const input = readXRInput([{ handedness: 'left', gamepad: { mapping: 'xr-standard', axes: [0, 0, 0, -1],
      buttons: [{ pressed: false }, { pressed: true }],
    } as unknown as Gamepad }])
    driver.update(input, 0, 1, true)
    expect(port.move).toHaveBeenLastCalledWith(0, -1, true, false)
    driver.update({ ...input, run: false }, 0, 2, true)
    expect(port.move).toHaveBeenLastCalledWith(0, -1, false, false)
  })
})
