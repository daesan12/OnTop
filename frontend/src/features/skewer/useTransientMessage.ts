import { useEffect, useState } from 'react'

export function useTransientMessage(message: string, lifetime = 3500) {
  const [visible, setVisible] = useState('')
  useEffect(() => {
    setVisible(message)
    if (!message) return
    const timer = window.setTimeout(() => setVisible(''), lifetime)
    return () => window.clearTimeout(timer)
  }, [message, lifetime])
  return visible
}
