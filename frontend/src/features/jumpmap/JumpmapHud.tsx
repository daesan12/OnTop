import { useCallback, useEffect, useState } from 'react'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { avatars, sampleAvatar, useSession } from '../../network/worldClient'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import { START } from './course'
import { useJumpmap } from './state'
import { JumpmapOverlay } from './JumpmapOverlay'
import { JumpmapGuide } from './JumpmapGuide'

/** 반복 도전 HUD와 선택형 출발 안내. 안내를 읽어야 도전할 수 있는 조건은 두지 않는다. */
export function JumpmapHud() {
  const runtime = useParkRuntime()
  const loadRankings = useCallback((signal: AbortSignal) => runtime.requestJSON('/api/v1/minigames/jumpmap/rankings', { signal }), [runtime])
  const state = useJumpmap()
  const [frame, setFrame] = useState({ now: performance.now(), near: false })
  useEffect(() => {
    if (!GENERATED_PARK_ENABLED) return
    const timer = setInterval(() => {
      if (document.hidden) return
      const now = performance.now(), own = avatars.get(useSession.getState().sessionId)
      const pose = own && sampleAvatar(own, now, { ...own.current })
      setFrame({ now, near: !!pose && Math.hypot(pose.x - START.x, pose.z - START.z) < 4 && Math.abs(pose.y - .8 - START.y) < 2 })
    }, 100)
    return () => clearInterval(timer)
  }, [])
  return GENERATED_PARK_ENABLED ? <><JumpmapGuide /><JumpmapOverlay state={state} now={frame.now} nearStart={frame.near} loadRankings={loadRankings} /></> : null
}
