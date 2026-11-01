import { useEffect, useState } from 'react'
import { estimatedServerTime } from '../../network/worldClient'
import { flipTimer, timerText } from './timer'
import type { HalliGalli } from './protocol'

/** Numberless bar from the server deadline. It only displays time; the server flips when it runs out. */
export function FlipTimerBar({ halli, emphasis = false }: { halli: HalliGalli; emphasis?: boolean }) {
  const [now, setNow] = useState(estimatedServerTime)
  useEffect(() => { const timer = setInterval(() => setNow(estimatedServerTime()), 100); return () => clearInterval(timer) }, [])
  const t = flipTimer(halli, now)
  if (t.phase === 'idle') return null
  return <div className="hg-timer" data-phase={t.phase} data-emphasis={emphasis || undefined} role="timer" aria-label={`카드 공개 시간 · ${timerText(t)}`}>
    <span style={{ transform: `scaleX(${t.fraction})` }} />
  </div>
}
