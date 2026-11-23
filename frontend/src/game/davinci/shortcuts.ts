import { panelOwnsKeys, textInputOwnsKeys } from '../../world/inputOwnership'

/** R 키는 채팅·메뉴·팝업·IME가 입력을 소유할 때 게임 행동으로 해석하지 않는다. */
export function canUseDrawShortcut(event: KeyboardEvent) {
  return event.code === 'KeyR' && !event.defaultPrevented && !event.repeat && !event.isComposing && event.keyCode !== 229
    && !event.ctrlKey && !event.altKey && !event.metaKey && !panelOwnsKeys()
    && !textInputOwnsKeys(event.target) && !textInputOwnsKeys(document.activeElement)
    && !document.querySelector('.game-hud-menu details[open]')
}

export function installDrawShortcut(canDraw: () => boolean, draw: () => void) {
  const listener = (event: KeyboardEvent) => {
    if (!canUseDrawShortcut(event) || !canDraw()) return
    event.preventDefault()
    draw()
  }
  window.addEventListener('keydown', listener)
  return () => window.removeEventListener('keydown', listener)
}
