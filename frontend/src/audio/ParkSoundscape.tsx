import { cameraWorldPosition } from '../world/xrView'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { FOUNTAIN, groundHeight, lakeRadiusAt } from '../park/mapConfig'
import { LAKE,isOnParkWalkway } from '../park/mapConfig'
import { avatars, useSession } from '../network/worldClient'
import { renewalMap } from '../park/renewalMap'
import { setFountainAudioFocus, useSfxSettings } from './bgm'
import { playSfx, setSfxListener, setSfxLoop } from './sfx'
import { emoteSfx, moverSfx, type MoverState } from './sfxEvents'
import { jumpmapXRFeedback } from '../features/jumpmap/xrFeedback'

const forward = new Vector3()
const movers = new Map<string, MoverState>()
const emotes = new Map<string, number>()

/** Places the camera as the listener and turns avatar motion and park water into placed sounds. */
export function ParkSoundscape() {
  const last = useRef(0)
  const fountainSource = useRef<{ x: number; y: number; z: number } | undefined>(undefined)
  useEffect(() => () => {
    setSfxLoop('amb-fountain', 0)
    setSfxLoop('amb-pond', 0)
    setFountainAudioFocus(0)
  }, [])
  useFrame(({ camera }) => {
    const now = performance.now()
    if (now - last.current < 50) return
    last.current = now
    const ear = cameraWorldPosition(camera)
    camera.getWorldDirection(forward)
    setSfxListener(ear, forward)

    const pool = fountainSource.current ??= (() => {
      const { x, z } = renewalMap?.data.physics.fountainPolicy ?? FOUNTAIN
      return { x, z, y: renewalMap ? groundHeight(x, z) + 1 : 1 }
    })()
    const dx = ear.x - pool.x, dz = ear.z - pool.z
    const player = avatars.get(useSession.getState().sessionId)?.current ?? ear
    // Place the emitter toward the listening side of the large 220m basin.
    const rPool = renewalMap ? Math.min(1, 9 / Math.max(.1, Math.hypot(dx, dz))) : 0
    const at = { x: pool.x + dx * rPool, y: pool.y, z: pool.z + dz * rPool }
    const distance = Math.max(0, Math.hypot(player.x - pool.x, player.z - pool.z) - rPool * Math.hypot(dx, dz))
    const sfx = useSfxSettings.getState()
    setFountainAudioFocus(sfx.muted || sfx.volume === 0 ? 0 : Math.max(0, Math.min(1, (13 - Math.hypot(distance, player.y - pool.y)) / 9)))
    setSfxLoop('amb-fountain', renewalMap ? .26 : 1, at)
    // The lake is an ellipse; its water is heard from the nearest point of the shore.
    const r = lakeRadiusAt(ear.x, ear.z)
    setSfxLoop('amb-pond', 1, r <= 1 ? { x: ear.x, y: 0.2, z: ear.z }
      : { x: LAKE.x + (ear.x - LAKE.x) / r, y: 0.2, z: LAKE.z + (ear.z - LAKE.z) / r })

    const { profiles, sessionId } = useSession.getState()
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
        paved: isOnParkWalkway(p.x, p.z),
      })
      movers.set(id, state)
      for (const cue of cues) {
        if (id === sessionId && jumpmapXRFeedback.active && (cue === 'move-jump' || cue === 'move-land')) continue
        playSfx(cue, at)
      }
    }
  })
  return null
}
