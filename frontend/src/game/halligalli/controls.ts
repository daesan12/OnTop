import { useGame } from '../store'
import { useSession } from '../../network/worldClient'
import { inputState } from '../../world/inputOwnership'
import { parkRuntime } from '../../park/runtime/runtime'
import { canRingHalli } from './actions'

/** Rings for the window currently shown. The press is captured here and never re-targeted later. */
export function ringShownBell() {
  const g = useGame.getState().game
  if (!g?.halli || g.halli.bellWindowId === null || useSession.getState().status !== 'connected') return false
  void parkRuntime.ringHalli(g.halli.bellWindowId, g.version); return true
}

/** The 3D table bell: the same ring path, only while this player may ring the shown window (spectators never). */
export function ringAllowedBell() {
  const id = useGame.getState().game?.halli?.bellWindowId
  return id !== null && id !== undefined && canRingHalli(useSession.getState().sessionId, id) && ringShownBell()
}

const ownsTarget =(target: EventTarget | null) => target instanceof HTMLElement
  && !!target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')

/** Space rings the bell for players. Repeats, IME composition, text inputs and open panels are ignored. */
export function installHalliControls() {
  const space = (e: KeyboardEvent) => e.code === 'Space' && !!useGame.getState().game?.halli && !e.ctrlKey && !e.altKey
    && !e.metaKey && !document.hidden && !ownsTarget(e.target) && !Object.values(inputState).some(Boolean)
  const down = (e: KeyboardEvent) => {
    if (!space(e)) return
    // A focused button would also click on keyup; the bell is the only Space action here.
    e.preventDefault()
    if (!e.repeat && !e.isComposing) ringShownBell()
  }
  const up = (e: KeyboardEvent) => { if (space(e)) e.preventDefault() }
  window.addEventListener('keydown', down, true)
  window.addEventListener('keyup', up, true)
  return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true) }
}
