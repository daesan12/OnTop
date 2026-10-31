import { useEffect } from 'react'
import { useStore } from 'zustand'
import { useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { parkVrZone } from './parkBridge'
import { VrZoneHost } from './VrZoneHost'

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
  return <VrZoneHost controller={parkVrZone} />
}
