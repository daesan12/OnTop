import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { refreshNearbyNotes } from '../../features/notes/controller'
import { resetNotesState, useNotesState } from '../../features/notes/state'
import { canReachNotes } from '../../features/notes/validation'
import { authoritativePose, useSession } from '../../network/worldClient'
import { panelOwnsKeys } from '../inputOwnership'

export function useNearbyNotes() {
  const visit = useRef({ key: '', attempted: false, near: false, nextCheck: 0 })
  useEffect(()=>()=>{const state=useNotesState.getState();if(!state.open&&state.loading)resetNotesState(true)},[])
  useFrame(({ clock }) => {
    const v = visit.current
    if (clock.elapsedTime < v.nextCheck) return
    v.nextCheck = clock.elapsedTime + .2
    const session = useSession.getState(), key = session.sessionId + ':' + session.roomId
    const near = session.status === 'connected' && session.mapCompatible && !!session.roomId && canReachNotes(authoritativePose(session.sessionId))
    if (v.key !== key) { v.key = key; v.attempted = false }
    const state = useNotesState.getState()
    if (!near) {
      if (v.near && !state.open && state.loading) resetNotesState(true)
      v.near = false; v.attempted = false; return
    }
    v.near = true
    if (state.open) { v.attempted = true; return }
    if (v.attempted || state.loading || state.pending || Date.now() < state.nextReadAt || panelOwnsKeys()) return
    v.attempted = true
    void refreshNearbyNotes()
  })
}
