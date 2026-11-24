import { useEffect, useState } from 'react'
import { estimatedServerTime, useSession } from '../../../network/worldClient'
import { parkRuntime } from '../../../park/runtime/runtime'
import { useFacilityState } from '../../facilities/state'
import { SLEIGH_LAP_MS } from './route'
import { LocationChip } from '../../parkMenus/LocationChip'
import bellOrnament from '../community/ui-art/bell-photo.webp'
import './sleigh.css'

export function SleighHud() {
  const user = useSession(s => s.sessionId), lease = useFacilityState(s => s.occupancies[user])
  const leaseId = lease?.kind === 'SLEIGH' ? lease.leaseId : ''
  const [now, setNow] = useState(estimatedServerTime)
  useEffect(() => {
    if (!leaseId) return
    setNow(estimatedServerTime())
    const timer = window.setInterval(() => setNow(estimatedServerTime()), 200)
    return () => clearInterval(timer)
  }, [leaseId])
  if (lease?.kind !== 'SLEIGH') return null
  const elapsed = Math.max(0, now - Date.parse(lease.startedAt)), remaining = Math.max(0, Math.ceil((SLEIGH_LAP_MS - elapsed) / 1000))
  return <aside className="winter-sleigh-hud" aria-label="루돌프 썰매 비행">
    <div className="winter-sleigh-hud__heading"><div className="winter-sleigh-hud__title">
      <img src={bellOrnament} alt="" aria-hidden="true" width="30" height="34" />
      <strong>루돌프 썰매 <span className="winter-sleigh-hud__free">무료</span></strong></div>
      <p role="status">{remaining ? `도착까지 ${remaining}초` : '착륙 중 · 잠시 기다려주세요'}</p></div>
    <div className="winter-sleigh-hud__clock"><LocationChip /></div>
    <progress value={Math.min(elapsed, SLEIGH_LAP_MS)} max={SLEIGH_LAP_MS} aria-label="비행 진행" />
    <div className="winter-sleigh-hud__actions"><span>자동 비행 · 조종 불가</span>
      <button onClick={() => void parkRuntime.releaseFacility(lease.leaseId, new AbortController().signal).catch(() => {})}>탑승장으로 돌아가기</button></div>
  </aside>
}
