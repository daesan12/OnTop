import { useEffect, useState } from 'react'
import { estimatedServerTime, useSession } from '../../../network/worldClient'
import { parkRuntime } from '../../../park/runtime/runtime'
import { useFacilityState } from '../../facilities/state'
import { SLEIGH_LAP_MS } from './route'
import './sleigh.css'

export function SleighHud() {
  const user = useSession(s => s.sessionId), lease = useFacilityState(s => s.occupancies[user])
  const [now, setNow] = useState(estimatedServerTime)
  useEffect(() => {
    if (lease?.kind !== 'SLEIGH') return
    const timer = window.setInterval(() => setNow(estimatedServerTime()), 200)
    return () => clearInterval(timer)
  }, [lease])
  if (lease?.kind !== 'SLEIGH') return null
  const elapsed = Math.max(0, now - Date.parse(lease.startedAt)), remaining = Math.max(0, Math.ceil((SLEIGH_LAP_MS - elapsed) / 1000))
  return <aside className="winter-sleigh-hud" aria-label="루돌프 썰매 비행">
    <strong>루돌프 썰매 · 무료</strong>
    <p>공원 하늘 한 바퀴 · 자동 비행</p>
    <progress value={Math.min(elapsed, SLEIGH_LAP_MS)} max={SLEIGH_LAP_MS} aria-label="비행 진행" />
    <p role="status">{remaining ? `도착까지 ${remaining}초 · 조종 없이 풍경을 즐기세요` : '착륙 중 · 잠시 후 자동으로 내려요'}</p>
    <button onClick={() => void parkRuntime.releaseFacility(lease.leaseId, new AbortController().signal).catch(() => {})}>탑승장으로 돌아가기</button>
  </aside>
}
