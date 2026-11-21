import { useSyncExternalStore } from 'react'

const snapshot = () => !document.hidden
const subscribe = (changed: () => void) => {
  document.addEventListener('visibilitychange', changed)
  return () => document.removeEventListener('visibilitychange', changed)
}

// React checks the snapshot again after subscribing. Restoring a tab between
// render and commit must not leave the canvas permanently in frameloop="never".
export function usePageVisible() {
  return useSyncExternalStore(subscribe, snapshot, () => true)
}
