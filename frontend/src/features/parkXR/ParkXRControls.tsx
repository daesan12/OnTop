import { useEffect, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { parkXRActions, useParkXR } from './state'
import './parkXR.css'

export function ParkXRControls() {
  const [supported, setSupported] = useState(false)
  const ready = useParkXR(s => s.ready)
  const phase = useParkXR(s => s.phase)
  const error = useParkXR(s => s.error)
  const notice = useParkXR(s => s.notice)
  const connected = useSession(s => s.status === 'connected' && s.mapCompatible && !!s.roomId
    && !s.tableId && !s.benchId && !s.fitnessId && !s.telescopeId)
  useEffect(() => {
    let alive = true
    const check = () => {
      if (window.isSecureContext && navigator.xr)
        void navigator.xr.isSessionSupported('immersive-vr').then(value => { if (alive) setSupported(value) }).catch(() => { if (alive) setSupported(false) })
    }
    check(); navigator.xr?.addEventListener('devicechange', check)
    return () => { alive = false; navigator.xr?.removeEventListener('devicechange', check) }
  }, [])
  if (!supported && !error) return null
  const busy = phase === 'requesting' || phase === 'ending'
  return <aside className="park-xr-controls" aria-label="공원 VR 조작" tabIndex={0}>
    <button type="button" disabled={busy || !ready || !connected} onClick={event => {
      event.currentTarget.blur()
      if (phase === 'active') void parkXRActions.end?.()
      else void parkXRActions.start?.()
    }}>{phase === 'active' ? '공원 VR 종료' : busy ? 'VR 연결 중…' : '공원 VR 시작'}</button>
    <p>공원과 돌탑을 내 시점으로 플레이해요.<br />왼쪽 스틱 이동 · A 점프 · 왼손 그립 달리기<br />오른쪽 스틱 회전 · X 놀이 방법 · B 종료</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </aside>
}
