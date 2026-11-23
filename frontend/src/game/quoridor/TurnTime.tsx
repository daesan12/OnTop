import { useEffect, useState } from 'react'
import { estimatedServerTime } from '../../network/serverEventClock'

export function remainingSeconds(deadline: string | null, now: number) {
  return deadline === null ? null : Math.max(0, Math.min(30, Math.ceil((Date.parse(deadline) - now) / 1000)))
}
export function TurnTime({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(estimatedServerTime)
  useEffect(() => {
    setNow(estimatedServerTime())
    if (!deadline) return
    const timer = window.setInterval(() => setNow(estimatedServerTime()), 100)
    return () => window.clearInterval(timer)
  }, [deadline])
  const seconds = remainingSeconds(deadline, now)
  return <div className="qr-turn-time" role="timer" aria-label="이번 차례 남은 시간" data-urgent={seconds !== null && seconds <= 10}>
    <b>{seconds === null ? '—' : `${seconds}초`}</b><span>{seconds === null ? '마감 시간 없음' : seconds === 0 ? '서버 자동 이동 확인 중' : '만료 시 자동 이동'}</span>
  </div>
}
