/** Shared ownership flags; future manual/map/wheel/minigame panels use the same gate. */
export const inputState = {
  blocked: false, chatOpen: false, manualOpen: false, mapOpen: false,
  emoteWheelOpen: false, minigameOpen: false, feedbackOpen: false, notesOpen: false,
  shopOpen: false, wardrobeOpen: false, advertisementOpen: false, followMenuOpen: false,
  welcomeFlight: false, fortuneOpen: false, localBalloon: false,
  /** An underground scare has hold of the player: no walking for its few seconds (InteriorEncounters). */
  encounterHeld: false,
}
export const roamingInput = { ready: false, draggingCamera: false }
/** A physical scene control can own one pointer without locking keyboard/chat or other games. */
export const scenePointerOwners = new Map<number, string>()
export function clearRoamingInput() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function')
    window.dispatchEvent(new Event('ontop-clear-input'))
}
const dialogOpen = () => typeof document !== 'undefined' && !!document.querySelector('dialog[open], [role="dialog"]')
export const panelOwnsKeys = (except?: 'localBalloon') =>
  (except ? Object.entries(inputState).some(([panel, open]) => panel !== except && open) : Object.values(inputState).some(Boolean)) || dialogOpen()
/** Chat preserves an existing carry, while idle chat users and other panels stay protected. */
export const panelBlocksCarry = (carryActive: boolean) =>
  Object.entries(inputState).some(([panel, open]) => open && (panel !== 'chatOpen' || !carryActive)) || dialogOpen()
/** Return keyboard ownership only when no other panel is using it. */
export function focusParkCanvas(except?: 'localBalloon') {
  if (!panelOwnsKeys(except) && typeof document !== 'undefined')
    document.querySelector<HTMLCanvasElement>('canvas')?.focus({ preventScroll: true })
}
/** The wardrobe keeps other shortcuts closed but lets the avatar walk and the view turn behind it. */
export const panelOwnsMovement = () =>
  Object.entries(inputState).some(([panel, open]) => open && panel !== 'wardrobeOpen') || dialogOpen()
/** Chat keeps keyboard shortcuts but leaves mouse clicks on game controls to the game. */
export const panelOwnsGameClicks = () => Object.entries(inputState).some(([panel, open]) => open && panel !== 'chatOpen')
export function textInputOwnsKeys(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest(
    'input,textarea,select,button,a,[contenteditable="true"],[role="dialog"],dialog[open]',
  )
}
export function setChatInputOpen(open: boolean) {
  inputState.chatOpen = open
  if (open) clearRoamingInput()
}
