/** G is not a button activation key. Closed HUD buttons may retain accessible focus. */
export function emoteKeyboardBlocked(target: EventTarget | null) {
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest(
    'input,textarea,select,[role="textbox"],[role="combobox"],[role="dialog"],dialog[open],[role="menu"],[role="listbox"]',
  ))) return true
  // An open dropdown still owns G, even if its focus has temporarily moved elsewhere.
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menu"],[role="listbox"]'))
    .some(menu => menu.getClientRects().length > 0 && getComputedStyle(menu).visibility !== 'hidden')
}
