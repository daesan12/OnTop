import { lazy, Suspense, useEffect } from 'react'
import { useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { parkRuntime } from '../../park/runtime/runtime'
import { useYut } from './state'

const Host = lazy(() => import('./YutHost'))
export function ParkYut() {
  const open = useYut(state => state.open)
  const owner = useSession(state => `${state.sessionId}:${state.roomId}`)
  useEffect(() => { useYut.setState({ open: false }) }, [owner])
  useEffect(() => {
    if (!open) return
    inputState.minigameOpen = true
    clearRoamingInput()
    return () => { inputState.minigameOpen = false; clearRoamingInput() }
  }, [open])
  if (!open) return null
  return <Suspense fallback={<p role="status">윷판을 펼치고 있어요…</p>}>
    {parkRuntime.cooperativeGame ? <Host transport={parkRuntime.cooperativeGame} onClose={() => useYut.setState({ open: false })} />
      : <div role="dialog" aria-label="윷놀이 연결 안내"><p>공원 서버 연결을 확인해주세요.</p><button onClick={() => useYut.setState({ open: false })}>닫기</button></div>}
  </Suspense>
}
