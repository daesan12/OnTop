import { useEffect, useRef, useState } from 'react'
import type { YutThrow } from './contracts'
import { THROW_DURATION } from './throwMotion'

export function useThrowAnimation(gameId: string, result?: YutThrow | null) {
  const seen = useRef({ gameId, id: result?.id })
  const [active, setActive] = useState<{ id: number; rolling: boolean } | null>(null)
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (seen.current.gameId !== gameId) {
      seen.current = { gameId, id: result?.id }; setActive(null); return
    }
    if (seen.current.id !== result?.id) {
      seen.current.id = result?.id
      setActive(result && !reducedMotion && document.visibilityState === 'visible' ? { id: result.id, rolling: true } : null)
    }
  }, [gameId, result?.id, reducedMotion])
  useEffect(() => {
    if (active === null) return
    if (reducedMotion) { setActive(null); return }
    const id = active.id
    const reveal = setTimeout(() => setActive(value => value?.id === id ? { ...value, rolling: false } : value), THROW_DURATION * 1000)
    const fold = setTimeout(() => setActive(value => value?.id === id ? null : value), THROW_DURATION * 1000 + 850)
    return () => { clearTimeout(reveal); clearTimeout(fold) }
  }, [active?.id, reducedMotion])
  const expanded = active !== null && active.id === result?.id
  return { expanded, rolling: expanded && active.rolling, reducedMotion }
}
