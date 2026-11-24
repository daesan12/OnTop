import { useSyncExternalStore } from 'react'

const snapshot = () => typeof document === 'undefined' || !document.hidden
const subscribe = (changed: () => void) => {
  if (typeof document === 'undefined') return () => {}
  const page = document
  page.addEventListener('visibilitychange', changed)
  return () => page.removeEventListener('visibilitychange', changed)
}

// React checks the snapshot again after subscribing. Restoring a tab between
// render and commit must not leave the canvas permanently in frameloop="never".
export function usePageVisible() {
  return useSyncExternalStore(subscribe, snapshot, () => true)
}
