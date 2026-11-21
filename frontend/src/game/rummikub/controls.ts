import { useGame } from '../store'
import { panelOwnsKeys, scenePointerOwners } from '../../world/inputOwnership'
import { useRummikubDraft } from './draft'

export function arrangeRummikubRack(sort: 'color' | 'number') {
  if ([...scenePointerOwners.values()].includes('supae-tile')) return
  useRummikubDraft.setState({sort})
}

/** Presentation only. Never consume typing, chat, dialog, or an active tile drag. */
export function installRummikubShortcuts(gameId: string, toggleDock: () => void) {
  const typing = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest(
    'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.park-chat',
  )
  const down = (event: KeyboardEvent) => {
    const game = useGame.getState().game
    if (!game?.rummikub || game.gameId !== gameId || document.hidden || panelOwnsKeys()
      || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
      || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
      || typing(event.target) || typing(document.activeElement)
      || [...scenePointerOwners.values()].includes('supae-tile')) return
    if (event.code === 'KeyH') {
      event.preventDefault(); event.stopPropagation(); toggleDock()
    } else if (game.role === 'PLAYER' && game.rummikubHand?.tiles.length && ['KeyC', 'KeyN'].includes(event.code)) {
      event.preventDefault(); event.stopPropagation()
      arrangeRummikubRack(event.code === 'KeyC' ? 'color' : 'number')
    }
  }
  window.addEventListener('keydown', down, true)
  return () => window.removeEventListener('keydown', down, true)
}
