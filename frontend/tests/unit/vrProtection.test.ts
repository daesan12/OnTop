import { expect, it, vi } from 'vitest'
import { acquireVRProtection, vrCarryProtection } from '../../src/features/vrSession/protection'
import { COURSE, START } from '../../src/features/jumpmap/course'
import { inJumpmapXRRegion, nearJumpmapStart } from '../../src/features/jumpmap/xrEntry'

it('서버 확인 전부터 보호 의도를 유지하고 마지막 VR 사용자가 종료할 때 해제한다', async () => {
  let confirm!: (value: boolean) => void
  const port = { setInteractionBusy: vi.fn(() => new Promise<boolean>(resolve => { confirm = resolve })) }
  const pending = acquireVRProtection(port)
  expect(port.setInteractionBusy).toHaveBeenCalledWith(false, true)
  expect(vrCarryProtection.active).toBe(true)
  confirm(true)
  const release = await pending
  port.setInteractionBusy.mockImplementation(async () => true)
  const another = await acquireVRProtection(port)
  release(); release()
  expect(vrCarryProtection.active).toBe(true)
  another()
  expect(vrCarryProtection.active).toBe(false)
  expect(port.setInteractionBusy).toHaveBeenLastCalledWith(false)
})

it('보호 거절과 통신 실패는 VR 시작을 거절하고 임시 보호를 정리한다', async () => {
  await expect(acquireVRProtection({ setInteractionBusy: async () => false })).rejects.toThrow('보호')
  expect(vrCarryProtection.active).toBe(false)
  await expect(acquireVRProtection({ setInteractionBusy: async (_busy, confirm) => {
    if (confirm) throw Error('offline')
    return true
  } })).rejects.toThrow('offline')
  expect(vrCarryProtection.active).toBe(false)
})

it('점프맵 출발과 모든 발판을 허용하고 공원 자유이동과 낙하 구역은 벗어남으로 판단한다', () => {
  expect(nearJumpmapStart({ ...START, y: START.y + .8 })).toBe(true)
  expect(COURSE.every(p => inJumpmapXRRegion({ x: p.x, y: p.top + .8, z: p.z }))).toBe(true)
  expect(inJumpmapXRRegion({ x: -150, y: .8, z: -150 })).toBe(false)
  expect(inJumpmapXRRegion({ ...START, y: .1 })).toBe(false)
  expect(inJumpmapXRRegion({ ...START, y: NaN })).toBe(false)
})
