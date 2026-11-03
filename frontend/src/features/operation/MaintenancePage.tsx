import { useEffect, useMemo, useState } from 'react'
import type { ServiceOperationStatus } from './serviceOperation'
import './maintenancePage.css'

function remaining(expectedOpenAt: string | null, now: number) {
  if (!expectedOpenAt) return null
  const duration = Math.max(0, Date.parse(expectedOpenAt) - now)
  const minutes = Math.floor(duration / 60_000)
  const seconds = Math.floor((duration % 60_000) / 1_000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function expectedTime(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

export function MaintenancePage({ status, onRetry }: {
  status: ServiceOperationStatus
  onRetry: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const serverOffset = useMemo(() => Date.parse(status.serverTime) - Date.now(), [status.serverTime])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  const countdown = remaining(status.expectedOpenAt, now + serverOffset)
  const schedule = useMemo(() => expectedTime(status.expectedOpenAt), [status.expectedOpenAt])

  return <main className="maintenance-page">
    <div className="maintenance-page__veil" aria-hidden="true" />
    <section className="maintenance-card" aria-labelledby="maintenance-title">
      <p className="maintenance-card__eyebrow">ONTOP NOTICE</p>
      <h1 id="maintenance-title">공원을 정돈하고 있어요</h1>
      <p className="maintenance-card__notice">{status.notice}</p>
      {countdown && <div className="maintenance-card__countdown" aria-live="polite">
        <span>예상 재개까지</span><strong>{countdown}</strong>
      </div>}
      {schedule && <p className="maintenance-card__schedule">예상 재개 시각 · {schedule}</p>}
      <p className="maintenance-card__hint">진행 중이던 경기는 안전하게 마무리한 뒤 서버를 다시 열어요.</p>
      <button type="button" onClick={onRetry}>지금 다시 확인</button>
    </section>
  </main>
}
