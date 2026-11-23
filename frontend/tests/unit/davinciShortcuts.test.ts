import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { inputState } from '../../src/world/inputOwnership'
import { installDrawShortcut } from '../../src/game/davinci/shortcuts'

let focus: unknown = null, dialog = false, menu = false
class TextControl { closest() { return this } }
const press = (extra = {}) => window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code: 'KeyR', ...extra }))
beforeEach(() => {
  focus = null; dialog = false; menu = false
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('HTMLElement', TextControl)
  vi.stubGlobal('document', { get activeElement() { return focus }, querySelector: (selector: string) => selector.includes('game-hud-menu') ? menu : dialog })
  for (const key of Object.keys(inputState)) inputState[key as keyof typeof inputState] = false
})
afterEach(() => vi.unstubAllGlobals())

it('내 뽑기 차례에만 R을 처리하고 반복·조합키·IME 입력과 해제 후 입력은 무시한다', () => {
  let allowed = false; const draw = vi.fn(), stop = installDrawShortcut(() => allowed, draw)
  press(); expect(draw).not.toHaveBeenCalled()
  allowed = true; press(); expect(draw).toHaveBeenCalledTimes(1)
  for (const extra of [{ repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229 }]) press(extra)
  expect(draw).toHaveBeenCalledTimes(1)
  stop(); press(); expect(draw).toHaveBeenCalledTimes(1)
})

it('채팅·설명서·팝업·열린 게임 메뉴와 텍스트 입력에 R을 빼앗지 않는다', () => {
  const draw = vi.fn(), stop = installDrawShortcut(() => true, draw)
  inputState.chatOpen = true; press(); inputState.chatOpen = false
  inputState.manualOpen = true; press(); inputState.manualOpen = false
  dialog = true; press(); dialog = false; menu = true; press(); menu = false
  focus = new TextControl(); press(); focus = null
  expect(draw).not.toHaveBeenCalled()
  press(); expect(draw).toHaveBeenCalledTimes(1); stop()
})
