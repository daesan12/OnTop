import { useSyncExternalStore } from 'react'
const query = '(prefers-reduced-motion: reduce)'
export const reducedMotionRequested = () => typeof window !== 'undefined' && window.matchMedia(query).matches
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
export const useReducedMotion = () => useSyncExternalStore(subscribe, reducedMotionRequested, () => false)
