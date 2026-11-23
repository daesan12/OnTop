import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { acquireRuntime, parkRuntime } from './runtime'
import type { ParkRuntimePort } from './contracts'

const Context = createContext<ParkRuntimePort | null>(null)
/** 소켓을 시작하지 않는 게임 단위 프리뷰도 기존 UI와 같은 런타임 계약을 사용한다. */
export function ParkRuntimeView({ runtime, children }: { runtime: ParkRuntimePort; children: ReactNode }) {
  return <Context.Provider value={runtime}>{children}</Context.Provider>
}
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
