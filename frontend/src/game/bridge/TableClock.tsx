import { useEffect, useState } from 'react'
export function useTableNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer) }, [])
  return now
}
export function TableClock({ deadline, now, resolving }: { deadline: string | null; now: number; resolving: boolean }) {
  const remaining = deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : null
  return remaining === null ? null : <small aria-label={`남은 시간 ${remaining}초`}>{resolving ? '판정 연출' : '현재 단계'} 남은 시간 약 {remaining}초</small>
}
