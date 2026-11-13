import { useEffect } from 'react'
import { useSession } from '../../network/worldClient'
import { inboxRequest } from '../notifications/api'
import { replaceSkinCatalog, useSkinCatalog } from '../../world/art/skinCatalog'

/** 관리자 공개는 파일 목록에 반영한다. 접속/재접속·분당 갱신이며 매 프레임 요청하지 않는다. */
export function SkinCatalogLifecycle() {
  const owner = useSession(s => s.sessionId), connected = useSession(s => s.status === 'connected')
  useEffect(() => {
    if (!owner || !connected) return
    let pending = false
    const control = new AbortController()
    const load = async () => {
      if (pending) return
      pending = true
      try {
        const assets = await inboxRequest('/api/v1/skins/assets', AbortSignal.any([control.signal, AbortSignal.timeout(8000)]))
        if (!control.signal.aborted) replaceSkinCatalog(assets)
      } catch { /* 연결 장애는 마지막 공개 목록을 유지하고 다음 주기에 다시 확인한다. */ }
      finally {
        pending = false
        if (!control.signal.aborted) useSkinCatalog.setState({ checked: true })
      }
    }
    void load(); const timer = window.setInterval(() => void load(), 60_000)
    return () => { control.abort(); window.clearInterval(timer) }
  }, [owner, connected])
  return null
}
