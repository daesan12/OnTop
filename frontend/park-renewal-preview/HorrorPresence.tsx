import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group, type Object3D } from 'three'
import { effectsOutput } from '../src/audio/bgm'
import { playPresence, type PresenceSound } from './horrorAudio'
import { HORROR_LAMPS } from './horrorGeometry'
import { horrorGround, horrorWalkable } from './horrorPlan'
import { lampOverride } from './horrorDressingPlan'
import { interiorVisit } from './interiorEvents'
import { offGaze } from './encounterStaging'
import { hoodGeometry, tatteredGeometry } from './encounterSculpt'

// Between the scares the hall keeps telling you something is there (S15P31B105-450): steps coming up behind you, a
// tall figure standing against a far lamp that is gone when you look straight at it, the lamps behind you going out
// one by one, a whisper at one ear, a crash somewhere far off. Never during a scare, and never two at once.

type Kind = 'footsteps' | 'figure' | 'lampsOut' | 'whisper' | 'bang'
const KINDS: readonly [Kind, number][] = [['footsteps', .26], ['figure', .26], ['lampsOut', .2], ['whisper', .16], ['bang', .12]]
function pick(): Kind { let r = Math.random(); for (const [k, w] of KINDS) { if ((r -= w) < 0) return k } return 'whisper' }

function sound(kind: PresenceSound, pan = 0) {
  const out = effectsOutput()
  if (out) playPresence(out.context, out.bus, kind, pan)
}
type Viewer = Object3D & { getWorldDirection: (v: Vector3) => Vector3 }
/** -1 left .. 1 right, for a point relative to where you look. */
function panOf(camera: Viewer, x: number, z: number, f: Vector3) {
  camera.getWorldDirection(f)
  const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz) || 1
  return Math.max(-1, Math.min(1, (dx * -f.z + dz * f.x) / d))
}
/** Nothing solid between the eye and (x, z). */
function clearLine(ex: number, ez: number, x: number, z: number) {
  const d = Math.hypot(x - ex, z - ez)
  for (let s = .5; s < d - .5; s += .4) if (!horrorWalkable(ex + (x - ex) * s / d, ez + (z - ez) * s / d, .1)) return false
  return true
}

export function HorrorPresence({ zone }: { zone: RefObject<Group | null> }) {
  const figure = useRef<Group>(null)
  const state = useRef({ next: 0, kind: undefined as Kind | undefined, until: 0, lamp: -1, stare: 0, out: [] as number[], back: 0 })
  const f = useMemo(() => new Vector3(), [])
  const cloth = useMemo(() => tatteredGeometry('presence', .4), [])
  const hood = useMemo(() => hoodGeometry(), [])
  useEffect(() => () => { lampOverride.fill(1) }, [])
  useFrame(({ camera, clock }, dt) => {
    const now = clock.elapsedTime, st = state.current, fig = figure.current
    let shown = !!zone.current
    for (let n: Object3D | null = zone.current; n; n = n.parent) if (!n.visible) shown = false
    const end = () => { st.kind = undefined; if (fig) fig.visible = false; if (st.lamp >= 0) { lampOverride[st.lamp] = 1; st.lamp = -1 } }
    if (!shown) { end(); lampOverride.fill(1); st.out = []; st.next = now + 6; return }
    // Lamps put out behind you come back after a while, stuttering.
    if (st.out.length && now > st.back) { for (const i of st.out) lampOverride[i] = 1; sound('lampsBack'); st.out = [] }
    if (interiorVisit.active) { end(); st.next = Math.max(st.next, now + 6); return }

    if (st.kind === 'figure' && fig) {
      // It is gone if you stare at it, walk up to it, or wait too long; its lamp blinks as it goes.
      camera.getWorldDirection(f)
      const off = offGaze([camera.position.x, camera.position.z], [f.x, f.z], [fig.position.x, fig.position.z])
      const dist = Math.hypot(fig.position.x - camera.position.x, fig.position.z - camera.position.z)
      st.stare = off < .12 ? st.stare + dt : 0
      fig.rotation.y = Math.atan2(camera.position.x - fig.position.x, camera.position.z - fig.position.z)
      // It lingers a moment even if you look right at it, then it is simply not there any more.
      if ((st.stare > .9 && now > st.until - 3.3) || dist < 7 || now > st.until) {
        sound('vanish', panOf(camera, fig.position.x, fig.position.z, f))
        if (st.lamp >= 0) { const l = st.lamp; lampOverride[l] = 0; setTimeout(() => { lampOverride[l] = 1 }, 450); st.lamp = -1 }
        end()
      }
      return
    }
    if (st.kind && now > st.until) end()
    if (st.kind || now < st.next) return

    const kind = pick()
    st.next = now + 9 + Math.random() * 9
    camera.getWorldDirection(f)
    const cx = camera.position.x, cz = camera.position.z, fx = f.x, fz = f.z
    if (kind === 'figure' && fig) {
      // Stand it against a lamp ahead, 11–25 m away, in plain view: a backlit silhouette.
      const lamps = HORROR_LAMPS.map(([x, z], i) => ({ x, z, i, d: Math.hypot(x - cx, z - cz) }))
        .filter(l => l.d > 11 && l.d < 25 && offGaze([cx, cz], [fx, fz], [l.x, l.z]) < .5 && clearLine(cx, cz, l.x, l.z))
      const lamp = lamps[Math.floor(Math.random() * lamps.length)]
      if (lamp) {
        const k = (lamp.d - 1.4) / lamp.d, x = cx + (lamp.x - cx) * k, z = cz + (lamp.z - cz) * k
        fig.position.set(x, horrorGround(x, z), z)
        fig.visible = true
        Object.assign(st, { kind, until: now + 4.5, lamp: lamp.i, stare: 0 })
        return
      }
    }
    if (kind === 'lampsOut') {
      const behind = HORROR_LAMPS.map(([x, z], i) => ({ i, x, z, d: Math.hypot(x - cx, z - cz) }))
        .filter(l => l.d < 34 && ((l.x - cx) * fx + (l.z - cz) * fz) / (l.d || 1) < -.2).sort((a, b) => b.d - a.d)
      st.out = behind.map(l => l.i); st.back = now + 7 + Math.random() * 3
      behind.forEach((l, k) => setTimeout(() => {
        if (!state.current.out.includes(l.i)) return
        lampOverride[l.i] = 0
        sound('lampOut', panOf(camera as Viewer, l.x, l.z, new Vector3()))
      }, 350 * k))
      if (behind.length) return
    }
    if (kind === 'footsteps') { sound('footsteps', Math.random() < .5 ? -.45 : .45); return }
    if (kind === 'bang') { sound('bang', Math.random() * 1.6 - .8); return }
    sound('whisper', Math.random() < .5 ? -.9 : .9)
  })
  return <group ref={figure} name="horror-presence-figure" visible={false} userData={{ keepOpaque: true }}>
    <mesh geometry={cloth} position={[0, 1.15, 0]} scale={[.62, 2.3, .62]}><meshBasicMaterial color="#030303" /></mesh>
    <mesh geometry={hood} position={[0, 2.42, .02]} scale={[.24, .3, .25]}><meshBasicMaterial color="#030303" /></mesh>
    {[-1, 1].map(s => <mesh key={s} position={[s * .065, 2.4, .2]}><sphereGeometry args={[.016, 8, 6]} /><meshBasicMaterial color="#ff6a3a" toneMapped={false} /></mesh>)}
  </group>
}
