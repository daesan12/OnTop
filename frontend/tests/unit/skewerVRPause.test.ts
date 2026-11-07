import { describe, expect, it } from 'vitest'
import { VRPauseButton } from '../../src/features/skewer/chef/vrPause'
import { touchBindings } from '../../src/features/vrGuide/touchControllerGuide'

function source(pressed = false) {
  return { gamepad: { buttons: Array.from({ length: 6 }, (_, index) => ({ pressed: index === 5 && pressed })) } } as unknown as XRInputSource
}
describe('요리사 VR 일시정지 입력', () => {
  it('B를 누르는 순간 한 번만 작동하고 놓았다가 다시 누르면 작동한다', () => {
    const input = new VRPauseButton(), right = source()
    expect(input.update(right, true)).toBe(false)
    Object.assign(right.gamepad!.buttons[5], { pressed: true })
    expect(input.update(right, true)).toBe(true)
    expect(input.update(right, true)).toBe(false)
    Object.assign(right.gamepad!.buttons[5], { pressed: false }); input.update(right, true)
    Object.assign(right.gamepad!.buttons[5], { pressed: true })
    expect(input.update(right, true)).toBe(true)
  })
  it('진입·추적 복구·컨트롤러 교체 중 누른 채인 B로 메뉴가 잘못 열리지 않는다', () => {
    const input = new VRPauseButton(), right = source(true)
    expect(input.update(right, true)).toBe(false)
    Object.assign(right.gamepad!.buttons[5], { pressed: false }); input.update(right, true)
    input.update(right, false); Object.assign(right.gamepad!.buttons[5], { pressed: true })
    expect(input.update(right, true)).toBe(false)
    expect(input.update(source(true), true)).toBe(false)
    input.reset()
    expect(input.update(right, true)).toBe(false)
  })
  it('A 버튼이나 입력 소스 없음으로는 일시정지가 실행되지 않는다', () => {
    const input = new VRPauseButton(), right = source()
    expect(input.update(null, true)).toBe(false)
    input.update(right, true); Object.assign(right.gamepad!.buttons[4], { pressed: true })
    expect(input.update(right, true)).toBe(false)
  })
  it('협동 요리사만 B 일시정지를 안내하고 단독·연습 조작은 유지한다', () => {
    expect(touchBindings('chef')).toContainEqual(['일시정지·계속하기', '오른손 B 버튼'])
    expect(touchBindings('chef-practice')).toHaveLength(2)
    expect(touchBindings('solo')).toContainEqual(['꼬치 잡기·서빙', '양손 옆면 그립'])
  })
})
