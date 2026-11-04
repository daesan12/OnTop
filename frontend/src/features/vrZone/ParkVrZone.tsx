import { lazy, Suspense, useEffect } from 'react'
import { useStore } from 'zustand'
import { useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { parkVrZone } from './parkBridge'
import { VrZoneHost } from './VrZoneHost'
import { parkRuntime } from '../../park/runtime/runtime'
import { SKEWER_COOP_ENABLED } from '../skewer/coop/availability'

const CoopHost = lazy(() => import('../skewer/coop/CoopHost'))

export function ParkVrZone() {
  const phase = useStore(parkVrZone.store, state => state.phase)
  const owner = useSession(state => `${state.status}:${state.sessionId}:${state.roomId}`)
  useEffect(() => { parkVrZone.endVisit() }, [owner])
  useEffect(() => {
    inputState.minigameOpen = phase !== 'closed'
    if (phase !== 'closed') clearRoamingInput()
    return () => { inputState.minigameOpen = false; clearRoamingInput() }
  }, [phase])
  useEffect(() => () => { parkVrZone.endVisit(); inputState.minigameOpen = false }, [])
  if (SKEWER_COOP_ENABLED && phase !== 'closed' && parkRuntime.cooperativeGame)
    return <Suspense fallback={<p role="status">협동 가게를 준비하고 있어요…</p>}><CoopHost transport={parkRuntime.cooperativeGame} onClose={() => { parkVrZone.close(); void parkRuntime.checkRecovery() }} /></Suspense>
  return <VrZoneHost controller={parkVrZone} />
}
