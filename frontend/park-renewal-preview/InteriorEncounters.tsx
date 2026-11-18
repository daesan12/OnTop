import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Raycaster, Vector3, type Group, type Light, type Mesh, type Object3D, type PointLight } from 'three'
import { effectsOutput } from '../src/audio/bgm'
import { playCageDrop, playRopeDrop, playWallCrack, playBehind, playEncounterLunge, playEncounterStaging, playFakeout, playJumpScare, playPounceCrouch, playSprint, playStalkStart, playStalkStep, playStoneStep } from './horrorAudio'
import { AMBUSHERS, diamond, interiorVisit, type Encounter } from './interiorEvents'
import { FALL, FAR_MIN, SIDE, encounterDistance, encounterScale, farStart, flashlight, lungeStop, offGaze, placeInView, stagePlan, standDistance, styleFrame } from './encounterStaging'
import { strike } from './horrorStrike'
import { clearRoamingInput, inputState } from '../src/world/inputOwnership'
import { viewControls } from '../src/world/cameraPerspective'
import { horrorWalkable } from './horrorPlan'
import { encounterModels, Shape } from './InteriorEncounterModels'
import { useEncounterWarmup } from './encounterWarmup'

const types = Array.from({ length: 12 }, (_, i) => i + 1)
const beatsByScene = [
  [0,.19], [0,.24,.50], [.02,.42], [0,.12,.31], [.05,.28], [.17,.5],
  [0,.11,.21,.31,.47], [.04,.54], [0,.34,.55], [0,.14,.26,.38],
  [0,.24,.46,.62], [.05,.14,.25,.36,.49,.64],
]
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => { const n = clamp(x); return n * n * (3 - 2*n) }

function sound(play: (ctx: AudioContext, bus: AudioNode) => void) {
  const output = effectsOutput()
  if (output) play(output.context, output.bus)
}

function cue(id: number, duration: number) {
  const output = effectsOutput()
  if (output) playEncounterStaging(output.context, output.bus, id, duration, beatsByScene[id-1] ?? [])
}

function animate(id: number, scene: Object3D, t: number, viewer: Vector3) {
  switch (id) {
    case 1:
      scene.position.x = -.30 + .32 * ease(t * 2)
      scene.rotation.z = .18 * (1 - ease(t*2))
      break
    case 2: {
      const steps = ease(t*5) + ease((t-.23)*5) + ease((t-.54)*5)
      scene.position.z = steps * .13
      scene.rotation.z = Math.sin(steps * Math.PI) * .033
      break
    }
    case 3:
      scene.position.y = 1.8 * (1-ease(t*1.65)) + .85
      scene.rotation.z = Math.sin(t*7) * .12
      break
    case 4: {
      const door = scene.getObjectByName('door-leaf')!
      const beast = scene.getObjectByName('door-beast')!
      door.rotation.y = -1.04 * ease(t*2.1)
      beast.scale.setScalar(.76 + .24 * ease(t*4))
      beast.position.z = -.36 + .72 * ease((t-.19)*1.8)
      beast.position.x = .22 * ease(t*1.5)
      break
    }
    case 5: {
      const hand = scene.getObjectByName('reaching-hand')!
      hand.position.x = -.48 + .57 * Math.sin(t*Math.PI)
      hand.rotation.z = -.15 * Math.sin(t*12)
      break
    }
    case 6: {
      const shadow = scene.getObjectByName('wall-shadow')!
      shadow.scale.set(1,1 + .53 * Math.sin(t*Math.PI),1)
      shadow.rotation.z = -.3 * Math.sin(t*Math.PI)
      break
    }
    case 7:
      scene.children.slice(0,-1).forEach((step,i) => { step.visible = t > i*.09 && t < .65+i*.065 })
      scene.children.at(-1)!.position.set(.65 - t*1.6,0,-1.46 + ease((t-.33)*1.65)*.9)
      scene.children.at(-1)!.visible = t > .32
      break
    case 8:
      scene.getObjectByName('lift-passenger')!.position.y = -.88 + .88 * ease(t*2.4)
      scene.getObjectByName('lift-passenger')!.rotation.y = .65 - 1.2 * ease((t-.32)*2)
      break
    case 9:
      scene.position.z = .4 * ease((t-.3)*1.6)
      scene.scale.setScalar(.88 + .15 * ease(t))
      break
    case 10: {
      const approach = ease(t*1.4)
      scene.position.set(-.31*(1-approach),Math.sin(t*Math.PI)*.026,.37*approach)
      scene.rotation.y = .24*(1-approach)
      scene.rotation.z = Math.sin(t*Math.PI*2)*.024
      break
    }
    case 11: {
      const water = scene.getObjectByName('pool-ripples')!
      const figure = scene.getObjectByName('pool-figure')!
      const surge = ease((t-.22)*1.65)
      water.scale.setScalar(.43 + .63 * ease(t*2))
      water.rotation.z = t*.23
      figure.visible = t > .24
      figure.position.set(0,-.19+.19*surge,.04*surge)
      figure.scale.set(1,Math.max(.04,.85*surge),1)
      figure.rotation.x = .29 * (1-surge)
      break
    }
    case 12: {
      const wall = scene.getObjectByName('watcher-wall')!
      wall.children.forEach((eye,i) => {
        const lid = eye.getObjectByName('watcher-lid')!
        const pupil = eye.getObjectByName('watcher-pupil')!
        const delay = i === 0 ? .08 : .21 + Math.abs(eye.position.x)*.13 + (i%4)*.04
        lid.scale.y = .04 + .96 * ease((t-delay)*3.8)
        pupil.position.x = Math.max(-.078, Math.min(.078, (viewer.x-eye.position.x)*.038))
        pupil.position.y = Math.max(-.033, Math.min(.033, (viewer.y-eye.position.y)*.032))
      })
      break
    }
  }
}

function diamondCue() {
  const output = effectsOutput()
  if (!output) return
  const {context,bus} = output
  for (const [index, delay] of [.025,.37].entries()) {
    const at = context.currentTime + delay
    const osc = context.createOscillator(), gain = context.createGain()
    const pan = context.createStereoPanner()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(172, at)
    osc.frequency.exponentialRampToValueAtTime(53, at + .19)
    gain.gain.setValueAtTime(.075, at)
    gain.gain.exponentialRampToValueAtTime(.001, at + .22)
    pan.pan.value = index ? .8 : -.8
    osc.connect(gain).connect(pan).connect(bus)
    osc.start(at)
    osc.stop(at + .23)
    osc.onended = () => { osc.disconnect(); gain.disconnect(); pan.disconnect() }
  }
}

export function InteriorEncounters() {
  const objects = useRef<(Group | null)[]>([])
  const gem = useRef<Mesh>(null)
  const previous = useRef<Encounter | undefined>(undefined)
  const hadDiamond = useRef(false)
  const lighting = useRef<{ lights: Light[]; intensity: number[] } | undefined>(undefined)
  const stage = useRef<Group>(null)
  const viewer = useRef(new Vector3())
  const accent = useRef<PointLight>(null)
  // Where the creature stands, which way it rushes (towards the viewer) and how far away it started.
  const placed = useRef({ x: 0, y: 0, z: 0, dx: 0, dz: 0, start: 3, seed: 0, shown: false, rushed: false, away: 0, step: 0, held: false, pan: 0, far: 9, ox: 0, oz: 0,
    extra: 0, lookAway: 0, struck: false, struck2: false, wall: false, yaw: 0, tx: 0, tz: 0, nx: 0, nz: 0, bx: 0, bz: 0 })
  const look = useRef(new Vector3())
  const ray = useRef(new Raycaster()), rayFrom = useRef(new Vector3()), rayDir = useRef(new Vector3())
  type Viewer = { position: Vector3; getWorldDirection: (v: Vector3) => Vector3 }
  /** Stand the creature `distance` m along the viewer's line of sight (or straight behind them), facing them. */
  const place = (group: Group, at: readonly number[], camera: Viewer, distance: number, behind = false, turn = 0) => {
    camera.getWorldDirection(look.current)
    const s = behind ? -1 : 1, c = Math.cos(turn), sn = Math.sin(turn)
    const lx = look.current.x * c - look.current.z * sn, lz = look.current.x * sn + look.current.z * c
    const [x, z] = placeInView([camera.position.x, camera.position.z], [lx * s, lz * s],
      distance, (px, pz) => horrorWalkable(px, pz, .45), [at[0]!, at[2]!])
    const start = Math.hypot(camera.position.x - x, camera.position.z - z) || 1
    Object.assign(placed.current, { x, z, dx: (camera.position.x - x) / start, dz: (camera.position.z - z) / start, start, away: 0 })
    group.rotation.set(0, Math.atan2(camera.position.x - x, camera.position.z - z), 0)
  }
  /**
   * The shadow (6) goes flat on a real wall beside your line of sight, where a shadow belongs, instead of on a board
   * standing in the hall. Rays against what is actually drawn (the walk map misses some walls, such as the ramp's), at
   * chest height; false when no upright, opaque surface faces you 1.4–4.5 m off (it then has its own slab of wall).
   */
  const placeOnWall = (group: Group, camera: Viewer, scene: Object3D, mode: 'ahead' | 'side' | 'near' = 'side') => {
    camera.getWorldDirection(look.current)
    const cx = camera.position.x, cz = camera.position.z, fl = Math.hypot(look.current.x, look.current.z) || 1
    const fx = look.current.x / fl, fz = look.current.z / fl
    const own = stage.current, eyeY = camera.position.y - .3
    /** The first drawn, opaque surface along a ray from the eye (never the creatures themselves). */
    const cast = (dx: number, dz: number, far: number) => {
      ray.current.set(rayFrom.current.set(cx, eyeY, cz), rayDir.current.set(dx, 0, dz).normalize())
      ray.current.near = .3; ray.current.far = far
      return ray.current.intersectObject(scene, true).find(h => {
        const mesh = h.object as Mesh
        if (!mesh.isMesh || !h.face) return false
        for (let n: Object3D | null = mesh; n; n = n.parent) if (n === own || !n.visible) return false
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        return materials.every(m => !m.transparent)
      })
    }
    const angles = mode === 'ahead' ? [0, .15, -.15, .3, -.3, .45, -.45] : mode === 'near' ? [.6, -.6, .85, -.85, .4, -.4, 1.1, -1.1] : [.45, -.45, .7, -.7, .25, -.25, .95, -.95, 0]
    const near = mode === 'near' ? 1.1 : 1.4, reach = mode === 'near' ? 3 : 4.5
    for (const a of angles) {
      const c = Math.cos(a), sn = Math.sin(a), dx = fx * c - fz * sn, dz = fx * sn + fz * c
      const hit = cast(dx, dz, reach)
      if (!hit?.face || hit.distance < near) continue
      const n = rayDir.current.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
      if (Math.abs(n.y) > .35) continue
      const nl = Math.hypot(n.x, n.z), nx = n.x / nl, nz = n.z / nl
      if (-(dx * nx + dz * nz) < .3) continue
      // The whole figure must show: both of its edges on the same open stretch of wall, nothing in between.
      const half = mode === 'near' ? .35 : .65
      const clear = [-half, half].every(k => {
        const ex = hit.point.x - nz * k - cx, ez = hit.point.z + nx * k - cz, want = Math.hypot(ex, ez)
        const edge = cast(ex, ez, want + .5)
        return !!edge && Math.abs(edge.distance - want) < .2
      })
      if (!clear) continue
      // p.x, p.z is the wall surface itself; the frame stands the planes just off it (their offset grows with scale).
      const x = hit.point.x, z = hit.point.z, start = Math.hypot(cx - x, cz - z)
      // Along the wall, pointing away from you: it slides in towards you from there.
      let tx = -nz, tz = nx
      if ((x - cx) * tx + (z - cz) * tz < 0) { tx = -tx; tz = -tz }
      Object.assign(placed.current, { x, z, dx: (cx - x) / start, dz: (cz - z) / start, start, away: 0, wall: true, yaw: Math.atan2(nx, nz), tx, tz, nx, nz })
      group.rotation.set(0, placed.current.yaw, 0)
      return true
    }
    return false
  }
  const put = (group: Group, active: Encounter, camera: Viewer, distance: number, behind = false) => {
    const scene = stage.current?.parent
    const wallMode = active.plan.style === 'shadow' ? 'ahead' : active.plan.style === 'grab' ? 'near' : 'side'
    if ((active.id === 6 || active.id === 5) && !behind && scene && placeOnWall(group, camera, scene, wallMode)) return
    placed.current.wall = false
    place(group, active.at, camera, distance, behind, SIDE[active.plan.style] !== undefined ? SIDE[active.plan.style]! * (Math.random() < .5 ? -1 : 1) : 0)
  }
  const gazeOff = (camera: Viewer, x: number, z: number) => {
    camera.getWorldDirection(look.current)
    return offGaze([camera.position.x, camera.position.z], [look.current.x, look.current.z], [x, z])
  }
  useEncounterWarmup(stage)
  // Never leave the player held if the underground unmounts mid-scare.
  useEffect(() => () => { inputState.encounterHeld = false; flashlight.factor = 1 }, [])
  useFrame(({camera}, dt) => {
    const active = interiorVisit.active
    if (active !== previous.current) {
      if (previous.current) {
        const old = objects.current[previous.current.id]
        if (old) { old.visible = false; old.scale.setScalar(1); old.rotation.x = 0 }
      }
      if (lighting.current) {
        lighting.current.lights.forEach((light, i) => { light.intensity = lighting.current!.intensity[i]! })
        lighting.current = undefined
      }
      if (accent.current) accent.current.intensity = 0
      inputState.encounterHeld = false
      flashlight.factor = 1
      const group = active && objects.current[active.id]
      if (active && group) {
        const style = active.plan.style, far = farStart(style, 99)
        Object.assign(placed.current, { y: active.at[1] - .78, seed: Math.random() * 10, shown: false, rushed: false, step: 0, held: false, far, extra: 0, lookAway: 0, struck: false, struck2: false })
        group.rotation.order = 'YXZ'
        // In the viewer's line of sight (first person underground), not wherever the anchor happened to be.
        put(group, active, camera, standDistance(active.plan, active.id, 0, far), style === 'behind' || style === 'ambush')
        const min = FAR_MIN[style]
        if (min !== undefined) {
          // No long hall in view to creep down or run along: it simply pops.
          if (placed.current.start < min) {
            active.plan = stagePlan('pop', active.duration)
            active.duration = active.plan.duration
            put(group, active, camera, standDistance(active.plan, active.id, 0))
          } else placed.current.far = farStart(style, placed.current.start)
        }
        // Behind you it keeps the same spot relative to you as you walk, but not as you turn.
        Object.assign(placed.current, { ox: placed.current.x - camera.position.x, oz: placed.current.z - camera.position.z })
        // The spot right behind you that the shadow belongs to (kept relative to you as you walk).
        camera.getWorldDirection(look.current)
        { const fl = Math.hypot(look.current.x, look.current.z) || 1; Object.assign(placed.current, { bx: -look.current.x / fl * 1.1, bz: -look.current.z / fl * 1.1 }) }
        const plan = active.plan
        group.position.set(placed.current.x, placed.current.y, placed.current.z)
        group.scale.setScalar(encounterScale(active.id) * (plan.style === 'pop' || plan.style === 'fakeout' ? 1.1 : 1))
        group.visible = false
        const lights: Light[] = []
        stage.current?.parent?.traverse(object => {
          const light = object as Light
          if (light.isLight && light !== accent.current && light.position.distanceTo(group.position) < 16) lights.push(light)
        })
        lighting.current = { lights, intensity: lights.map(light => light.intensity) }
        active.presentedAt = performance.now()
        // Where the breathing comes from: the side of your back it stands on.
        placed.current.pan = Math.random() < .5 ? -.35 : .35
        switch (plan.style) {
          case 'reveal': cue(active.id, active.duration); break
          case 'fakeout': sound((c, b) => playFakeout(c, b, plan.calm)); break
          case 'stalk': sound(playStalkStart); break
          case 'behind': sound((c, b) => playBehind(c, b, plan.rush, placed.current.pan)); break
          case 'pounce': sound((c, b) => playPounceCrouch(c, b, plan.rush)); break
          case 'sprint': sound((c, b) => playSprint(c, b, plan.rush, plan.dark - plan.rush)); break
          case 'statue': sound((c, b) => playStoneStep(c, b, 0)); break
          case 'shadow': sound((c, b) => playBehind(c, b, plan.rush, placed.current.pan)); break
          case 'grab': sound(playWallCrack); break
          case 'drop': sound(playRopeDrop); break
          case 'cage': sound((c, b) => playCageDrop(c, b, plan.rush - FALL.cage)); break
        }
      }
      previous.current = active
    }
    if (gem.current) {
      if (interiorVisit.added && !hadDiamond.current) diamondCue()
      hadDiamond.current = interiorVisit.added
      gem.current.visible = !interiorVisit.added
      gem.current.rotation.y += dt
    }
    if (!active || active.presentedAt === undefined) return
    const group = objects.current[active.id]
    if (!group) return
    const plan = active.plan, d = plan.duration / 1000
    let t = Math.min(d, (performance.now() - active.presentedAt) / 1000)
    const child = group.children[0]
    if (!child) return
    const p = placed.current
    const skipTo = (at: number) => { active.presentedAt = performance.now() - at * 1000; t = at }
    if (t >= plan.show && !p.shown) {
      p.shown = true
      if (plan.style !== 'behind' && plan.style !== 'ambush') put(group, active, camera, standDistance(plan, active.id, t, p.far, p.extra))
    }
    // The stalker and the statue are closer every time the lamps blink, always in front of you.
    const step = plan.jumps.filter(j => t >= j).length
    if (step > p.step) {
      p.step = step
      put(group, active, camera, standDistance(plan, active.id, t, p.far, p.extra))
      const near = 1 - Math.min(1, (p.start - 2) / 5)
      sound((c, b) => plan.style === 'statue' ? playStoneStep(c, b, near) : playStalkStep(c, b, step))
    }
    if (plan.style === 'statue' && p.shown && t < plan.rush) {
      // Look away and it moves: straight towards you, with a grind of stone you hear but do not see.
      p.lookAway = gazeOff(camera, p.x, p.z) > .75 ? p.lookAway + dt : 0
      if (p.lookAway > .45 && p.extra < 3) {
        p.lookAway = 0
        const want = standDistance(plan, active.id, t, p.far, p.extra + 1)
        const dx = p.x - camera.position.x, dz = p.z - camera.position.z, dist = Math.hypot(dx, dz) || 1
        const x = camera.position.x + dx / dist * want, z = camera.position.z + dz / dist * want
        if (want < dist && horrorWalkable(x, z, .45)) {
          p.extra++
          Object.assign(p, { x, z, start: want, dx: -dx / dist, dz: -dz / dist })
          sound((c, b) => playStoneStep(c, b, 1 - Math.min(1, (want - 2) / 5)))
        }
      }
    }
    if (plan.style === 'shadow' && t > .5 && t < plan.rush - .6
      && gazeOff(camera, camera.position.x + p.bx, camera.position.z + p.bz) < 1.2) skipTo(plan.rush) // you turned round
    // What casts the shadow is right behind you: as you are turned round, it is there, and it comes at you.
    if (plan.style === 'shadow' && t >= plan.rush - .6) { interiorVisit.ambush(AMBUSHERS[Math.floor(Math.random() * AMBUSHERS.length)]!, 'ambush', active.at, true); return }
    if (plan.style === 'behind' && t < plan.rush) {
      // It follows a step behind as you walk; turn round and it is on you at once.
      if (t > .8 && gazeOff(camera, p.x, p.z) < .55) skipTo(plan.rush)
      else if (t < plan.rush - .6) {
        const x = camera.position.x + p.ox, z = camera.position.z + p.oz
        if (horrorWalkable(x, z, .45)) { p.x = x; p.z = z }
      }
    }
    // Walk up to it and it does not wait: it lunges now.
    if ((plan.style === 'reveal' || plan.style === 'stalk' || plan.style === 'statue' || plan.style === 'pounce') && p.shown && !p.rushed && t < plan.rush) {
      const near = Math.hypot(camera.position.x - p.x, camera.position.z - p.z)
      if (near < 1.9 && gazeOff(camera, p.x, p.z) < 1) { skipTo(plan.rush); p.start = Math.max(1, near) }
    }
    if (t >= plan.rush && !p.rushed) {
      p.rushed = true
      if (plan.style === 'behind') place(group, active.at, camera, 1.5)
      else if (plan.style === 'stalk') { if (p.away > 0) place(group, active.at, camera, 2) }
      else if (plan.style === 'pounce') sound((c, b) => playJumpScare(c, b, 'roar'))
      else if (plan.style === 'reveal') {
        if (p.away > 0) place(group, active.at, camera, encounterDistance(active.id))
        sound((c, b) => playEncounterLunge(c, b, active.duration))
      }
    }
    if (p.shown && t < plan.rush && (plan.style === 'pop' || plan.style === 'fakeout' || plan.style === 'reveal')) {
      // Looked away while it was there: it is in front of you again a moment later.
      p.away = gazeOff(camera, group.position.x, group.position.z) > .6 ? p.away + dt : 0
      if (p.away > .2) put(group, active, camera, standDistance(plan, active.id, t))
    }
    // The strike: the moment it gets you (horrorStrike), with a different sound each time and the aftermath. The
    // runner and the long look bring their own sound; the beast roars. Always the creature itself, never a picture.
    const strikeAt = plan.style === 'pop' || plan.style === 'fakeout' ? plan.show : plan.style === 'sprint' ? plan.dark - .05 : plan.style === 'grab' ? plan.dark - .12
      : plan.style === 'drop' || plan.style === 'cage' ? FALL[plan.style] : plan.rush
    if (t >= strikeAt && !p.struck) {
      p.struck = true
      strike({ silent: plan.style === 'sprint' || plan.style === 'reveal' || plan.style === 'pounce',
        flavor: plan.style === 'pounce' || plan.style === 'cage' ? 'boom' : plan.style === 'grab' ? 'scream' : undefined })
    }
    // The cage's second blow: the thing comes through the bars at your face.
    if (plan.style === 'cage' && t >= plan.rush + .2 && !p.struck2) { p.struck2 = true; strike({ flavor: 'scream' }) }
    const frame = styleFrame(plan, active.id, t, p.start, p.seed)
    flashlight.factor = Math.min(1.4, frame.light)
    if (frame.held && !p.held) clearRoamingInput()
    p.held = frame.held
    inputState.encounterHeld = frame.held
    if (frame.drag > 0) {
      // The gaze is dragged to it (first person underground: forward = -sin(yaw), -sin(pitch), -cos(yaw)).
      // The shadow drags you round to face whatever stands behind you, not the wall.
      const dx = plan.style === 'shadow' ? p.bx : p.x - camera.position.x, dz = plan.style === 'shadow' ? p.bz : p.z - camera.position.z
      const want = Math.atan2(-dx, -dz), turn = Math.atan2(Math.sin(want - viewControls.yaw), Math.cos(want - viewControls.yaw))
      const k = 1 - Math.exp(-dt * frame.drag)
      viewControls.yaw += turn * k
      viewControls.pitch += (0 - viewControls.pitch) * k
    }
    group.visible = frame.visible
    if (p.wall) {
      // Flat on its wall: it slides along it towards you while it is there, and swells over you as it strikes.
      // The long look slides it in along the wall; the shadow of what is behind you just grows, as it comes closer.
      const u = plan.style === 'reveal' && plan.rush > plan.show ? 1 - Math.max(0, Math.min(1, (t - plan.show) / (plan.rush - plan.show))) : 0
      const grow = plan.style === 'shadow' ? 1.1 + .35 * Math.min(1, t / plan.rush) : 1
      const hand = active.id === 5
      const slide = 1.1 * u * u, scale = encounterScale(active.id) * grow * (hand ? 1 : 1 + .7 * frame.lunge), off = hand ? .02 : .07 * scale + .012
      // Its cocked head (1.58 up the plane) at your eye line, however large it grows; the legs end at the floor
      // like a cast shadow.
      // The crack (1.02 up) is at your eye line too.
      group.position.set(p.x + p.tx * slide + p.nx * off, p.y + 1.45 - (hand ? 1.02 : 1.58) * scale, p.z + p.tz * slide + p.nz * off)
      group.rotation.set(0, p.yaw, 0)
      group.scale.setScalar(scale)
    } else if (frame.lunge > 0) {
      // The rush ends a step in front of your eyes wherever you are now, so walking on cannot leave it behind.
      camera.getWorldDirection(look.current)
      const stop = lungeStop(active.id), f = Math.hypot(look.current.x, look.current.z) || 1, reach = frame.advance / Math.max(.01, p.start - stop)
      const tx = camera.position.x + look.current.x / f * stop, tz = camera.position.z + look.current.z / f * stop
      const k = Math.min(1, reach), x = p.x + (tx - p.x) * k, z = p.z + (tz - p.z) * k
      group.position.set(x - p.dz * frame.shake, p.y + frame.rise, z + p.dx * frame.shake)
      group.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z)
    } else {
      group.position.set(p.x - p.dz * frame.shake, p.y + frame.rise, p.z + p.dx * frame.shake)
      group.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z)
    }
    if (!p.wall) group.rotation.x = frame.tilt
    viewer.current.copy(camera.position)
    if (active.id === 12) group.worldToLocal(viewer.current)
    animate(active.id, child, frame.reveal, viewer.current)
    if (active.id === 7) {
      // The runner crosses the hall side-on in the long look; anywhere else it comes straight at you.
      const runner = child.children.at(-1)!
      if (plan.style !== 'reveal') { runner.position.set(0, 0, 0); runner.rotation.y = 1.25 } else runner.rotation.y = 0
    }
    if (active.id === 3 && plan.style === 'drop') child.rotation.y = .35 * Math.sin(t * 2.6) // twisting on the rope
    if (active.id === 8) {
      const rider = child.getObjectByName('lift-passenger')
      if (rider && plan.style === 'cage') {
        // Facing you, throwing itself at the bars, then through them at you.
        rider.rotation.set(0, 0, t > FALL.cage && t < plan.rush ? Math.sin(t * 47) * .08 : 0)
        rider.position.set(t > FALL.cage && t < plan.rush ? Math.sin(t * 53) * .05 : 0, 0, -.12 + 1.5 * frame.lunge * frame.lunge)
      }
    }
    if (active.id === 7 && plan.style === 'sprint') {
      // Never in the same place twice: each flash it is off to the other side, mirrored mid-stride.
      const k = Math.floor((t - .05) / .3), side = (k % 2 ? 1 : -1) * 1.1 * (1 - frame.lunge)
      group.position.x += -p.dz * side; group.position.z += p.dx * side
      const runner = child.children.at(-1)
      if (runner) runner.scale.x = k % 2 ? -1 : 1
    }
    if (active.id === 4) {
      // The door is the long look's prop; the pouncing beast comes alone, full size, out of the dark.
      const door = child.getObjectByName('door-leaf'), beast = child.getObjectByName('door-beast')
      if (door) door.visible = plan.style === 'reveal'
      if (beast && plan.style !== 'reveal') { beast.position.set(0, 0, 0); beast.scale.setScalar(1) }
    }
    if (active.id === 6) {
      const board = child.getObjectByName('shadow-board')
      if (board) board.visible = !p.wall
    }
    if (active.id === 5) {
      // On a real wall it needs no slab of its own; the arm bursts out of the crack, then stretches to your face.
      const slab = child.getObjectByName('crack-wall'), arm = child.getObjectByName('reaching-hand')
      if (slab) slab.visible = !p.wall
      if (arm && plan.style === 'grab') {
        // Out of the crack straight at your face, then stretching all the way to it.
        arm.position.x = 0
        arm.lookAt(camera.position)
        const burst = Math.min(1, Math.max(0, (t - .25) / .2)), reach = Math.max(1, (p.start - .35) / (.4 * encounterScale(5)))
        arm.scale.set(1, 1, .05 + .95 * burst * burst + (reach - 1) * frame.lunge * frame.lunge)
      } else if (arm) arm.scale.set(1, 1, 1)
    }
    const dimmed = lighting.current
    if (dimmed) dimmed.lights.forEach((light,i) => { light.intensity = dimmed.intensity[i]! * frame.light })
    if (accent.current) {
      // A cold side light that picks the creature out of the dark while it is there (stronger on the far ones); the
      // beast (dimly, a dark shape with glinting teeth) and the statue are lit from below instead.
      const s = encounterScale(active.id), facing = group.rotation.y
      const low = plan.style === 'pounce' || plan.style === 'statue', far = plan.style === 'stalk' || plan.style === 'sprint' || plan.style === 'statue'
      accent.current.position.set(group.position.x + (low ? 1.1 : .8)*s*Math.sin(facing) + (low ? 0 : .9*s*Math.cos(facing)), p.y + (low ? .25 : 1.6*s),
        group.position.z + (low ? 1.1 : .8)*s*Math.cos(facing) - (low ? 0 : .9*s*Math.sin(facing)))
      accent.current.color.set(plan.style === 'pounce' ? '#a8705a' : plan.style === 'statue' ? '#a9bccf' : active.id === 11 ? '#a0bdad' : '#e5bc93')
      accent.current.distance = (far ? 7 : 4.5) * s
      accent.current.intensity = frame.visible && !frame.behind ? (active.id === 9 ? 4 : 9) * (frame.lunge > 0 ? 1.4 : far ? 2.2 : plan.style === 'pounce' ? .45 : 1) : 0
    }
  }, .65)
  const [x,y,z] = diamond
  return <group ref={stage}>
    <pointLight ref={accent} intensity={0} distance={5} decay={2} />
    <Shape at={[x,y-.62,z]} size={[.64,1.04,.64]} color="#5a5750" />
    <mesh position={[x,y,z]} ref={gem} rotation={[0,0,.14]}>
      <octahedronGeometry args={[.31,0]} /><meshBasicMaterial color="#99f6ef" />
    </mesh>
    {types.map(id => <group name={'interior-event-' + id} key={id} ref={node => {objects.current[id]=node}} visible={false}>
      <group>{encounterModels[id]}</group>
    </group>)}
  </group>
}
