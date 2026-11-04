import { useEffect, useState } from 'react'
import { GameHudClock } from '../GameHud'
export function useTableNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer) }, [])
  return now
}
export function TableClock({ deadline, now, resolving, label, myTurn }: { deadline: string | null; now: number; resolving: boolean; label: string; myTurn: boolean }) {
  return <GameHudClock game="거짓말 다리" label={label} remainingMs={deadline?Date.parse(deadline)-now:null} myTurn={myTurn} phase={resolving?'판정 중':undefined}/>
}
