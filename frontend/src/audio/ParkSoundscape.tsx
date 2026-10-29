import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { FOUNTAIN, lakeRadiusAt } from '../config'
import { LAKE } from '../config/parkLandforms'
import { avatars, useSession } from '../network/worldClient'
import { pavingHeight } from '../world/art/characterMotion'
import { playSfx, setSfxListener, setSfxLoop } from './sfx'
import { emoteSfx, moverSfx, type MoverState } from './sfxEvents'

const forward = new Vector3()
const movers = new Map<string, MoverState>()
const emotes = new Map<string, number>()

/** Places the camera as the listener and turns avatar motion and park water into placed sounds. */
export function ParkSoundscape() {
  const last = useRef(0)
  useFrame(({ camera }) => {
    const now = performance.now()
    if (now - last.current < 50) return
    last.current = now
    const ear = camera.position
    camera.getWorldDirection(forward)
    setSfxListener(ear, forward)

    setSfxLoop('amb-fountain', 1, { x: FOUNTAIN.x, y: 1, z: FOUNTAIN.z })
    // The lake is an ellipse; its water is heard from the nearest point of the shore.
    const r = lakeRadiusAt(ear.x, ear.z)
    setSfxLoop('amb-pond', 1, r <= 1 ? { x: ear.x, y: 0.2, z: ear.z }
      : { x: LAKE.x + (ear.x - LAKE.x) / r, y: 0.2, z: LAKE.z + (ear.z - LAKE.z) / r })

    const profiles = useSession.getState().profiles
    for (const id of movers.keys()) if (!avatars.has(id)) { movers.delete(id); emotes.delete(id) }
    for (const [id, a] of avatars) {
      if (!a.connected) continue
      const p = a.current, at = { x: p.x, y: p.y, z: p.z }
      // An emote already running when the avatar first appears is not replayed.
      const seen = emotes.get(id)
      emotes.set(id, a.emoteAt)
      if (seen !== undefined && seen !== a.emoteAt && a.emote) {
        const cue = emoteSfx(a.emote, a.character ?? profiles[id]?.character)
        if (cue) playSfx(cue, at)
      }
      const [state, cues] = moverSfx(movers.get(id), {
        ...at, at: a.at, moving: a.moving, running: a.running, swimming: a.swimming,
        free: a.seatIndex < 0 && !a.benchId && !a.fitnessId && !a.telescopeId,
        paved: pavingHeight(p.x, p.z) > 0,
      })
      movers.set(id, state)
      for (const cue of cues) playSfx(cue, at)
    }
  })
  return null
}
