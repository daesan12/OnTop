import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group, type Object3D } from 'three'
import { effectsOutput } from '../src/audio/bgm'
import { inputState } from '../src/world/inputOwnership'
import { playApproachStep, playPassBy, playPresence, type PresenceSound } from './horrorAudio'
import { approachPlan, type Approach, type ApproachStep } from './approachPlan'
import { ScreamerPlan } from './horrorScreamer'
import { HORROR_LAMPS } from './horrorGeometry'
import { horrorGround, horrorWalkable } from './horrorPlan'
import { lampOverride } from './horrorDressingPlan'
import { AMBUSHERS, POPPERS, interiorVisit } from './interiorEvents'
import { offGaze } from './encounterStaging'
import { hoodGeometry, tatteredGeometry } from './encounterSculpt'
import { GRACE, LOOK_BACK, LOOK_SIDE, REST, RULE_OF, Stillness, TRAP_NOTE_AT, pickHappening, ruleRecord, turnedBy, type Happening } from './horrorRules'
import { brokenMark, closeNote, noteOpen, openNote, redLight, rulesButton } from './horrorRulesView'

// Between the scares the hall keeps telling you something is there (S15P31B105-450), and tests you on the rules of
// the note you were given at the way in (horrorRules):
//   1  steps far behind you, slow, then nearer, then a run straight at your back: stand still and do not look round,
//      and it runs on past you; look, or keep walking, and it has you
//   2  the light goes red: do not move until it comes back (something walks across the hall in front of you)
//   3  a tall figure against a far lamp: once you have met its eyes, do not look away until it is gone
//   4  a whisper at one ear: do not turn to it
// and at the top a second note says rule 1 has changed (it has not: rule 5), and then the steps come. Between these
// only the hall: steps that stop, lamps going out behind you, a crash far off. Never during a scare, never two at
// once. At some spots a creature also jumps out at you (horrorScreamer's spots, InteriorVisit.ambush).

type Kind = Happening
let forced: Kind | 'trap' | undefined
/** Make this happen next, straight away (the local preview's test keys). */
export function forcePresence(kind: Kind | 'trap') { forced = kind }

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
/** Nothing solid between the eye and (x, z), for feet at `y`. */
function clearLine(ex: number, ez: number, x: number, z: number, y: number) {
  const d = Math.hypot(x - ex, z - ez)
  for (let s = .5; s < d - .5; s += .4) if (!horrorWalkable(ex + (x - ex) * s / d, ez + (z - ez) * s / d, .1, y)) return false
  return true
}
/** How far you can see straight along (fx, fz) from the eye, up to `max` metres. */
function sightLine(ex: number, ez: number, fx: number, fz: number, y: number, max: number) {
  for (let s = .5; s < max; s += .4) if (!horrorWalkable(ex + fx * s, ez + fz * s, .3, y)) return s - .4
  return max
}
const pickFrom = (ids: readonly number[]) => ids[Math.floor(Math.random() * ids.length)]!

export function HorrorPresence({ zone }: { zone: RefObject<Group | null> }) {
  const figure = useRef<Group>(null)
  const state = useRef({
    next: 0, kind: undefined as Kind | undefined, until: 0, lamp: -1, stare: 0, out: [] as number[], back: 0,
    // The steps (rule 1): the plan, when it began, how many steps are out, which side, running past, the lie's.
    approach: undefined as Approach | undefined, started: 0, played: 0, side: 1, passing: false, trap: false,
    heading: undefined as [number, number] | undefined, stillFrom: false,
    // Rule 3: you have met its eyes. Rule 4: where you looked when it whispered. Rule 2: when you must be still by.
    noticed: false, from: [0, 1] as [number, number], grace: 0, nextStep: 0, wx: 0, wz: 0, wdx: 0, wdz: 0,
    seen: new Set<Kind>(), rest: {} as Partial<Record<Kind, number>>, trapRead: false, trapPending: false, introPending: false, held: false,
  })
  const f = useMemo(() => new Vector3(), [])
  const still = useMemo(() => new Stillness(), [])
  const cloth = useMemo(() => tatteredGeometry('presence', .4), [])
  const hood = useMemo(() => hoodGeometry(), [])
  const screamers = useMemo(() => new ScreamerPlan(), [])
  const inside = useRef(false)
  useEffect(() => () => {
    lampOverride.fill(1); redLight(false); rulesButton(false); closeNote()
    if (state.current.held) inputState.encounterHeld = false
  }, [])
  /** Set a creature on you: the eye is 1.5 m over your feet, and a scare's spot is .8 m over them. */
  const ambush = (id: number, style: 'ambush' | 'pop', camera: Viewer) =>
    interiorVisit.ambush(id, style, [camera.position.x, camera.position.y - .7, camera.position.z])
  useFrame(({ camera, clock }, dt) => {
    const now = clock.elapsedTime, st = state.current, fig = figure.current
    let shown = !!zone.current
    for (let n: Object3D | null = zone.current; n; n = n.parent) if (!n.visible) shown = false
    const end = () => {
      if (st.kind === 'redLight') redLight(false)
      st.kind = undefined; st.approach = undefined; st.passing = false; st.trap = false
      if (fig) fig.visible = false
      if (st.lamp >= 0) { lampOverride[st.lamp] = 1; st.lamp = -1 }
    }
    /** Done with a rule's test: it rests a while, and the next thing comes a little later. */
    const finish = (kept: boolean) => {
      const kind = st.kind, rule = kind && RULE_OF[kind]
      if (kept && rule) { ruleRecord.keep(rule); if (st.trap) ruleRecord.keep(5) }
      if (kind && REST[kind]) st.rest[kind] = now + REST[kind]!
      end(); st.next = Math.max(st.next, now + 8 + Math.random() * 6)
    }
    /** You broke it: it is on you. */
    const broke = (id: number, style: 'ambush' | 'pop') => {
      const rule = st.kind && RULE_OF[st.kind]
      if (!rule) return
      ruleRecord.break(rule)
      if (st.trap) ruleRecord.break(5)
      brokenMark(st.trap ? 5 : rule)
      finish(false)
      ambush(id, style, camera)
    }
    if (!shown) {
      if (inside.current) { rulesButton(false); closeNote() }
      end(); lampOverride.fill(1); st.out = []; st.next = now + 6; inside.current = false
      if (st.held) { st.held = false; inputState.encounterHeld = false }
      return
    }
    if (!inside.current) {
      // A new visit: a new record, every rule untested, and the note to read before anything else.
      inside.current = true; screamers.reset(); ruleRecord.reset()
      Object.assign(st, { seen: new Set<Kind>(), rest: {}, trapRead: false, trapPending: false })
      openNote('rules', () => { state.current.introPending = true })
      rulesButton(true, () => openNote('rules'))
    }
    // Reading holds you still, and nothing happens while you read.
    const reading = noteOpen()
    if (reading || st.held) { inputState.encounterHeld = reading; st.held = reading }
    if (reading) { st.next = Math.max(st.next, now + 1.5); return }
    if (st.introPending) { st.introPending = false; st.next = now + 7 }

    camera.getWorldDirection(f)
    const cx = camera.position.x, cz = camera.position.z, feet = camera.position.y - 1.5
    const fl = Math.hypot(f.x, f.z) || 1, fx = f.x / fl, fz = f.z / fl
    // A creature jumping out as you pass certain spots (not during another scare or a test).
    const scream = screamers.update({ x: cx, y: feet, z: cz }, now, !!interiorVisit.active || (!!st.kind && !!RULE_OF[st.kind]))
    if (scream) {
      ambush(pickFrom(Math.random() < .5 ? POPPERS : AMBUSHERS), Math.random() < .5 ? 'pop' : 'ambush', camera)
      end(); st.next = Math.max(st.next, now + 8)
    }
    // Lamps put out behind you come back after a while, stuttering.
    if (st.out.length && now > st.back) { for (const i of st.out) lampOverride[i] = 1; sound('lampsBack'); st.out = [] }
    if (interiorVisit.active) { end(); st.next = Math.max(st.next, now + 6); return }

    // The second note, on the floor at the top: it says rule 1 has changed. Then the steps come.
    if (!st.trapRead && !st.kind && Math.hypot(cx - TRAP_NOTE_AT[0], cz - TRAP_NOTE_AT[2]) < 1.3 && Math.abs(feet - TRAP_NOTE_AT[1]) < .9) {
      st.trapRead = true
      openNote('trap', () => { state.current.trapPending = true })
      return
    }

    if (st.kind === 'figure' && fig) {
      // Rule 3. Meet its eyes and you must hold them until it goes; look away first and it is in front of you.
      const off = offGaze([cx, cz], [fx, fz], [fig.position.x, fig.position.z])
      const dist = Math.hypot(fig.position.x - cx, fig.position.z - cz)
      if (off < .15) st.noticed = true
      st.stare = off < .2 ? st.stare + dt : 0
      fig.rotation.y = Math.atan2(cx - fig.position.x, cz - fig.position.z)
      if (st.noticed && off > .8) { broke(9, 'pop'); return }
      if ((st.noticed && st.stare > 1.6) || dist < 7 || now > st.until + (st.noticed ? 8 : 0)) {
        // Simply not there any more; its lamp blinks as it goes.
        sound('vanish', panOf(camera, fig.position.x, fig.position.z, f))
        if (st.lamp >= 0) { const l = st.lamp; lampOverride[l] = 0; setTimeout(() => { lampOverride[l] = 1 }, 450); st.lamp = -1 }
        if (st.noticed) finish(true)
        else { end(); st.next = now + 6 }
      }
      return
    }
    if (st.kind === 'approach' && st.approach) {
      // Rule 1. Steps are handed to the audio clock a little ahead, so the run keeps its rhythm whatever the frame rate.
      const t = now - st.started, out = effectsOutput(), a = st.approach
      const steps: ApproachStep[] = st.passing ? a.passBy : a.steps
      while (st.played < steps.length && steps[st.played]!.t < t + .12) {
        const s = steps[st.played]!, k = st.played / (steps.length - 1)
        const pan = st.passing ? -st.side * (.15 + .75 * k) : st.side * (.85 - .75 * s.near)
        if (out) playApproachStep(out.context, out.bus, s.near, pan, s.t - t, s.burst, !st.passing && s.burst && !steps[st.played - 1]?.burst)
        st.played++
      }
      if (st.passing) { if (t > a.passBy.at(-1)!.t + .6) finish(true); return }
      // Once it is coming again you may not look round; once it runs you must be standing still.
      if (t >= a.steps[a.resume]!.t - .05 && !st.heading) st.heading = [fx, fz]
      if (st.heading && Math.abs(turnedBy(st.heading, [fx, fz])) > LOOK_BACK) { broke(pickFrom(AMBUSHERS), 'ambush'); return }
      const run = a.steps.find(s => s.burst)!.t
      if (t >= run + GRACE.approach) {
        if (!st.stillFrom) { still.start(cx, cz); st.stillFrom = true }
        else if (still.update(cx, cz)) { broke(pickFrom(AMBUSHERS), 'ambush'); return }
      }
      if (t >= a.strikeAt) {
        // You kept it: it runs on past you, and away.
        st.passing = true; st.played = 0
        if (out) playPassBy(out.context, out.bus, st.side)
      }
      return
    }
    if (st.kind === 'redLight') {
      // Rule 2. Something crosses the hall in front of you while it is red; move and it comes for you instead.
      if (now > st.grace) {
        if (!st.stillFrom) { still.start(cx, cz); st.stillFrom = true }
        else if (still.update(cx, cz)) { broke(9, 'pop'); return }
      }
      if (fig?.visible) {
        const x = st.wx + st.wdx * dt, z = st.wz + st.wdz * dt
        if (horrorWalkable(x, z, .3, feet)) { st.wx = x; st.wz = z }
        fig.position.set(st.wx, horrorGround(st.wx, st.wz), st.wz)
        if (now > st.nextStep && (st.wdx || st.wdz)) {
          const out = effectsOutput(), d = Math.hypot(st.wx - cx, st.wz - cz)
          if (out) playApproachStep(out.context, out.bus, Math.max(.2, .62 - d * .04), panOf(camera, st.wx, st.wz, f))
          st.nextStep = now + .72
        }
      }
      if (now > st.until) { sound('redOff'); finish(true) }
      return
    }
    if (st.kind === 'whisper') {
      // Rule 4. Turn towards it and there is a face there.
      if (Math.sign(st.side) * turnedBy(st.from, [fx, fz]) > LOOK_SIDE) { broke(1, 'pop'); return }
      if (now > st.until) finish(true)
      return
    }
    if (st.kind && now > st.until) end()
    if (st.trapPending) { st.trapPending = false; forced = 'approach'; st.trap = true }
    if (forced === 'trap') { forced = undefined; st.trapRead = true; openNote('trap', () => { state.current.trapPending = true }); return }
    if (forced) st.next = 0
    if (st.kind || now < st.next) return

    const trap = st.trap
    let kind: Kind = forced ?? pickHappening(st.seen, h => now < (st.rest[h] ?? 0))
    forced = undefined
    Object.assign(st, { noticed: false, stillFrom: false, heading: undefined, passing: false, trap: false, stare: 0 })
    if (kind === 'approach') {
      const approach = approachPlan()
      Object.assign(st, { kind, approach, started: now, played: 0, side: Math.random() < .5 ? -1 : 1, until: now + 60, trap })
      st.seen.add(kind)
      return
    }
    st.next = now + 9 + Math.random() * 9
    if (kind === 'redLight') {
      const side = Math.random() < .5 ? -1 : 1, rx = -fz * side, rz = fx * side
      Object.assign(st, { kind, until: now + 4.6 + Math.random() * 2, grace: now + GRACE.redLight, side })
      redLight(true); sound('redOn')
      // The walker: ahead of you down the corridor, crossing it if it is a crossing, else walking slowly away.
      const ahead = Math.min(6.5, sightLine(cx, cz, fx, fz, feet, 9) - .8), px = cx + fx * ahead, pz = cz + fz * ahead
      if (fig && ahead > 2.5) {
        const sx = px - rx * 2.4, sz = pz - rz * 2.4, from = horrorWalkable(sx, sz, .3, feet) && clearLine(px, pz, sx, sz, feet) && horrorWalkable(px + rx * 2.4, pz + rz * 2.4, .3, feet)
        Object.assign(st, { wx: from ? sx : px, wz: from ? sz : pz, wdx: from ? rx * 1.05 : fx * .8, wdz: from ? rz * 1.05 : fz * .8, nextStep: now + .3 })
        fig.position.set(st.wx, horrorGround(st.wx, st.wz), st.wz)
        fig.rotation.y = from ? Math.atan2(rx, rz) : Math.atan2(fx, fz)
        fig.visible = true
      }
      st.seen.add(kind)
      return
    }
    if (kind === 'figure') {
      // Stand it against a lamp ahead, 11–25 m away, in plain view: a backlit silhouette.
      const lamps = HORROR_LAMPS.map(([x, z], i) => ({ x, z, i, d: Math.hypot(x - cx, z - cz) }))
        .filter(l => l.d > 11 && l.d < 25 && offGaze([cx, cz], [fx, fz], [l.x, l.z]) < .5 && clearLine(cx, cz, l.x, l.z, feet))
      const lamp = lamps[Math.floor(Math.random() * lamps.length)]
      // In the labyrinth there is seldom a lamp in view that far: then it stands at the far end of the corridor.
      const far = lamp ? 0 : sightLine(cx, cz, fx, fz, feet, 25) - 1
      if (fig && (lamp || far >= 8)) {
        const k = lamp ? (lamp.d - 1.4) / lamp.d : 0, x = lamp ? cx + (lamp.x - cx) * k : cx + fx * far, z = lamp ? cz + (lamp.z - cz) * k : cz + fz * far
        fig.position.set(x, horrorGround(x, z), z)
        fig.visible = true
        Object.assign(st, { kind, until: now + 4.5, lamp: lamp ? lamp.i : -1 })
        st.seen.add(kind)
        return
      }
      kind = 'lampsOut'
    }
    if (kind === 'whisper') {
      const side = Math.random() < .5 ? -1 : 1
      Object.assign(st, { kind, side, from: [fx, fz], until: now + 3.4 })
      sound('whisper', side * .9)
      st.seen.add(kind)
      return
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
    sound('bang', Math.random() * 1.6 - .8)
  })
  const [nx, ny, nz] = TRAP_NOTE_AT
  return <>
    <group ref={figure} name="horror-presence-figure" visible={false} userData={{ keepOpaque: true }}>
      <mesh geometry={cloth} position={[0, 1.15, 0]} scale={[.62, 2.3, .62]}><meshBasicMaterial color="#030303" /></mesh>
      <mesh geometry={hood} position={[0, 2.42, .02]} scale={[.24, .3, .25]}><meshBasicMaterial color="#030303" /></mesh>
      {[-1, 1].map(s => <mesh key={s} position={[s * .065, 2.4, .2]}><sphereGeometry args={[.016, 8, 6]} /><meshBasicMaterial color="#ff6a3a" toneMapped={false} /></mesh>)}
    </group>
    {/* The lying notice: a clean sheet on the floor at the top, pale enough to catch the eye in the dark. */}
    <mesh name="horror-trap-note" position={[nx, ny + .015, nz]} rotation={[-Math.PI / 2, 0, .35]}>
      <planeGeometry args={[.3, .42]} />
      <meshBasicMaterial color="#8f8a7c" />
    </mesh>
  </>
}
