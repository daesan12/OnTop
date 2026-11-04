import { useEffect, useLayoutEffect, useState } from 'react'
import { introLeft, useHalliIntro } from './intro'

/** Older than this when the card could first be drawn (a slow first scene), it is skipped rather than shown late. */
const LATE_MS = 3000

/**
 * The start rule card: about two seconds over the table, never taking the pointer or the keyboard. The two seconds
 * count from the card's first commit, not from the state's arrival, so a heavy first frame does not eat into them.
 */
export function HalliIntro({ gameId }: { gameId: string }) {
  const intro = useHalliIntro()
  const [shown, setShown] = useState({ gameId: '', at: 0 })
  const [, setTick] = useState(0)
  const due = intro.gameId === gameId && intro.gameId !== '' && shown.gameId !== gameId
  useLayoutEffect(() => {
    if (due && performance.now() - intro.at < LATE_MS) setShown({ gameId, at: performance.now() })
  }, [due, intro.at, gameId])
  const left = introLeft(shown, gameId, performance.now()), showing = left > 0
  // One timer to take it down; cleared on unmount and whenever another game or intro replaces it.
  useEffect(() => {
    if (!showing) return
    const timer = setTimeout(() => setTick(t => t + 1), left)
    return () => clearTimeout(timer)
  }, [shown.at, gameId, showing])
  return showing ? <IntroCard /> : null
}

/** The card itself; its CSS animation runs once from mount, so re-renders never move it along. */
export function IntroCard() {
  return <div className="hg-intro" role="status">
    <p>
      <svg className="hg-intro-bell" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round"><path d="M4 17h16M6 17v-2a6 6 0 0 1 12 0v2M12 9V7m-2 0h4M3 20h18" /></svg>
      {/* Two phrases that wrap as wholes on narrow screens. */}
      <span><span>과일 합이 <b>5개</b>가 되면</span> <span>종을 치세요!</span></span>
    </p>
  </div>
}
