import { useEffect } from 'react'
import { useSession } from '../../../network/worldClient'
import { RENEWAL_PARK_ENABLED } from '../../../park/mapSelection'
import { refreshWinterCommunity } from './api'
import { closeWinterCommunity } from './panelState'
import { resetWinterCommunity } from './state'

export function WinterCommunityBridge() {
  const room = useSession(s => s.roomId), own = useSession(s => s.sessionId)
  const connected = useSession(s => s.status === 'connected' && s.mapCompatible)
  useEffect(() => {
    closeWinterCommunity(); resetWinterCommunity()
    if (!RENEWAL_PARK_ENABLED || !connected || !room || !own) return
    const abort = new AbortController()
    void refreshWinterCommunity(abort.signal)
    let last = performance.now()
    const visible = () => {
      if (document.hidden) return
      if (performance.now() - last > 5000) { last = performance.now(); void refreshWinterCommunity(abort.signal) }
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      abort.abort(); closeWinterCommunity()
      document.removeEventListener('visibilitychange', visible)
    }
  }, [room, own, connected])
  return null
}
