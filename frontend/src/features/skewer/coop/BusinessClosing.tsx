import { useEffect, useRef, useState } from 'react'
import './businessClosing.css'

export function useBusinessClosing(key: string, phase: string | undefined, reason: string | null | undefined) {
  const played = useRef('')
  const [revealed, setRevealed] = useState('')
  useEffect(() => { if (phase === 'PLAYING') played.current = key }, [phase, key])
  const closing = phase === 'FINISHED' && reason === 'SKEWER_TIME_UP' && played.current === key && revealed !== key
  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => setRevealed(key), 1800)
    return () => window.clearTimeout(timer)
  }, [closing, key])
  return closing
}

export function BusinessClosing() {
  return <section className="coop-business-closing" role="status" aria-label="영업 종료 안내"><strong>영업 종료!</strong><span>오늘도 수고하셨어요</span></section>
}
