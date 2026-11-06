import { useEffect, useState } from 'react'
import { closingTime } from './closingTime'
import './closingNotice.css'

export function ClosingNotice({ seconds }: { seconds: number }) {
  const { phase, message } = closingTime(seconds)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    setVisible(phase !== 'normal')
    if (phase === 'normal') return
    const timer = window.setTimeout(() => setVisible(false), 4000)
    return () => window.clearTimeout(timer)
  }, [phase])
  return <div className={`closing-notice is-${phase}`} role="status" aria-live="polite" aria-atomic="true">{visible ? <span key={phase}>◷ {message}</span> : null}</div>
}
