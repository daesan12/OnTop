import { useEffect } from 'react'
import { useSession } from '../../network/worldClient'
import { OnDemandContent } from '../../park/OnDemandContent'
import wardrobeIcon from '../parkMenus/icons/dock-wardrobe.svg'
import { closeWardrobe, openWardrobe, resetWardrobe, useWardrobe, refreshWardrobe } from './state'
import { useGameplayMenusLocked } from '../parkMenus/gameplayLock'

const loadScreen = () => import('./WardrobeScreen').then(module => ({ default: module.WardrobeScreen }))

export function WardrobeLauncher() {
  const gameplayLocked = useGameplayMenusLocked()
  const disabled = useSession(s => s.status !== 'connected' || !s.roomId
    || !!(s.tableId || s.benchId || s.fitnessId || s.telescopeId || s.watchedTableId))
  return <button className="park-shop-launcher" type="button" aria-label="옷장"
    disabled={disabled || gameplayLocked} title={gameplayLocked ? '게임 중에는 옷장을 사용할 수 없어요.' : undefined} onClick={openWardrobe}>
    <img src={wardrobeIcon} alt="" /><span>옷장</span>
  </button>
}

export function WardrobeHost() {
  const open = useWardrobe(state => state.open)
  const gameplayLocked = useGameplayMenusLocked()
  useEffect(() => { if (gameplayLocked) closeWardrobe() }, [gameplayLocked])
  useEffect(() => {
    const inventoryChanged = () => { void refreshWardrobe() }
    window.addEventListener('ontop-gacha-committed', inventoryChanged)
    const unsubscribe = useSession.subscribe((next, old) => {
      const { owner } = useWardrobe.getState()
      if (next.sessionId && owner && next.sessionId !== owner) resetWardrobe()
      else if (next.status !== 'connected' || next.roomId !== old.roomId
        || next.tableId || next.benchId || next.fitnessId || next.telescopeId || next.watchedTableId) closeWardrobe()
    })
    const escape = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || !useWardrobe.getState().open || event.isComposing) return
      event.preventDefault(); event.stopImmediatePropagation(); closeWardrobe()
    }
    window.addEventListener('ontop-manual-open', closeWardrobe)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('ontop-gacha-committed', inventoryChanged)
      unsubscribe(); window.removeEventListener('ontop-manual-open', closeWardrobe)
      window.removeEventListener('keydown', escape, true); resetWardrobe()
    }
  }, [])
  return <OnDemandContent active={open} load={loadScreen} label="옷장" onClose={closeWardrobe} />
}
