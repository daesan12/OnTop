import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { acquireRuntime, parkRuntime } from './runtime'
import type { ParkRuntimePort } from './contracts'

const Context = createContext<ParkRuntimePort | null>(null)
export function ParkRuntimeProvider({
  children,
  onAuthEnded,
}: {
  children: ReactNode
  onAuthEnded: () => void
}) {
  useEffect(() => acquireRuntime(onAuthEnded), [onAuthEnded])
  return <Context.Provider value={parkRuntime}>{children}</Context.Provider>
}
export function useParkRuntime() {
  const runtime = useContext(Context)
  if (!runtime) throw new Error('ParkRuntimeProvider가 필요합니다.')
  return runtime
}
