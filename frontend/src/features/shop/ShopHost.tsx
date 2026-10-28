import { useEffect } from 'react'
import { useSession } from '../../network/worldClient'
import { OnDemandContent } from '../../park/OnDemandContent'
import { closeShop, resetShop, useShop } from './controller'

const loadPanel = () => import('./ShopPanel').then(module => ({ default: module.ShopPanel }))

export function ShopHost() {
  const open = useShop(state => state.open)
  useEffect(() => {
    const unsubscribe = useSession.subscribe((next, old) => {
      if (next.sessionId && useShop.getState().owner && next.sessionId !== useShop.getState().owner) resetShop()
      else if (next.status !== 'connected' || next.roomId !== old.roomId) closeShop()
    })
    const escape = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || !useShop.getState().open || event.isComposing) return
      event.preventDefault(); event.stopImmediatePropagation(); closeShop()
    }
    window.addEventListener('ontop-manual-open', closeShop)
    window.addEventListener('keydown', escape, true)
    return () => {
      unsubscribe(); window.removeEventListener('ontop-manual-open', closeShop)
      window.removeEventListener('keydown', escape, true); resetShop()
    }
  }, [])
  return <OnDemandContent active={open} load={loadPanel} label="상점" onClose={closeShop} />
}
