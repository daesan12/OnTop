import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { armUnlock, effectsOutput } from '../../audio/bgm'
import { playSfx } from '../../audio/sfx'
import { avatars, useSession } from '../../network/worldClient'
import { renewalGroundHeight } from '../../park/renewalMap'
import { SANTA } from './plan'
import { winterSceneryVisible } from './presentation'

export function SantaBell() {
  const gate = useRef({ scope: '', inside: false, playedAt: -Infinity })
  useEffect(armUnlock, [])
  useFrame(() => {
    const session = useSession.getState(), own = avatars.get(session.sessionId), state = gate.current
    const scope = `${session.sessionId}:${session.roomId}`
    if (scope !== state.scope) Object.assign(state, { scope, inside: false, playedAt: -Infinity })
    if (!own || !winterSceneryVisible() || session.status !== 'connected') return
    const distance = Math.hypot(own.current.x - SANTA.x, own.current.z - SANTA.z)
    if (distance > 11) state.inside = false
    if (distance >= 8 || state.inside || performance.now() - state.playedAt < 12000 || !effectsOutput()) return
    playSfx('halli-bell', { x: SANTA.x, y: renewalGroundHeight(SANTA.x, SANTA.z) + 1.5, z: SANTA.z }, .65)
    state.inside = true; state.playedAt = performance.now()
  })
  return null
}
