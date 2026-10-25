/** Shared ownership flags; future manual/map/wheel/minigame panels use the same gate. */
export const inputState = {
  blocked: false, chatOpen: false, manualOpen: false, mapOpen: false,
  emoteWheelOpen: false, minigameOpen: false, feedbackOpen: false, notesOpen: false,
  shopOpen: false, advertisementOpen: false, followMenuOpen: false,
}
export const roamingInput = { ready: false }
export function clearRoamingInput() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function')
    window.dispatchEvent(new Event('ontop-clear-input'))
}
export const panelOwnsKeys = () => Object.values(inputState).some(Boolean)
  || (typeof document !== 'undefined' && !!document.querySelector('dialog[open], [role="dialog"]'))
export function textInputOwnsKeys(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest(
    'input,textarea,select,button,a,[contenteditable="true"],[role="dialog"],dialog[open]',
  )
}
export function setChatInputOpen(open: boolean) {
  inputState.chatOpen = open
  if (open) clearRoamingInput()
}
