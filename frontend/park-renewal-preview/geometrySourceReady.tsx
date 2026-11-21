import { useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import type { Object3D } from 'three'

const readiness = new WeakMap<Object3D, ReturnType<typeof createReadiness>>()

function createReadiness() {
  let version = 0
  const listeners = new Set<() => void>()
  return {
    snapshot: () => version,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    ready() {
      version += 1
      for (const listener of listeners) listener()
    },
  }
}

function sourceReadiness(scene: Object3D) {
  let state = readiness.get(scene)
  if (!state) {
    state = createReadiness()
    readiness.set(scene, state)
  }
  return state
}

/** Retry rejected preflights when a streamed source actually commits, without
 * polling or scanning the scene on every frame. Keep this inside Suspense. */
export function GeometrySourceReady({ children, revision }: { children: ReactNode; revision?: unknown }) {
  const scene = useThree(state => state.scene)
  useLayoutEffect(() => { sourceReadiness(scene).ready() }, [scene, revision])
  return <>{children}</>
}

export function useGeometrySourceVersion(scene: Object3D) {
  const state = sourceReadiness(scene)
  return useSyncExternalStore(state.subscribe, state.snapshot, state.snapshot)
}
