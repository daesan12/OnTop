import { useEffect } from 'react'
import { useSession } from '../../../network/worldClient'
import { RENEWAL_PARK_ENABLED } from '../../../park/mapSelection'
import { refreshWinterCommunity } from './api'
import { closeWinterCommunity } from './panelState'
import { clearSnowRollInput, endSnowPress } from './rollInput'
import { resetWinterCommunity } from './state'

export function WinterCommunityBridge() {
  const room = useSession(s => s.roomId), own = useSession(s => s.sessionId)
  const connected = useSession(s => s.status === 'connected' && s.mapCompatible)
  useEffect(() => {
    clearSnowRollInput(); closeWinterCommunity(); resetWinterCommunity()
    if (!RENEWAL_PARK_ENABLED || !connected || !room || !own) return
    const abort = new AbortController()
    void refreshWinterCommunity(abort.signal)
    let last = performance.now()
    const visible = () => {
      if (document.hidden) { endSnowPress(true); return }
      if (performance.now() - last > 5000) { last = performance.now(); void refreshWinterCommunity(abort.signal) }
    }
    const clear = () => endSnowPress(true)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('blur', clear)
    window.addEventListener('ontop-clear-input', clear)
    return () => {
      abort.abort(); clearSnowRollInput(); closeWinterCommunity()
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('blur', clear)
      window.removeEventListener('ontop-clear-input', clear)
    }
  }, [room, own, connected])
  return null
}
