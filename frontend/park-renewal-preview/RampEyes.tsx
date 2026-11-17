import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { CircleGeometry, Euler, Matrix4, Quaternion, SphereGeometry, Vector3, type Group, type InstancedMesh, type Object3D } from 'three'
import { effectsOutput } from '../src/audio/bgm'
import { playEyes } from './horrorAudio'
import { lumpGeometry } from './encounterSculpt'
import { encounterFinishes } from './interiorEncounterMaterials'
import { irisTexture, scleraTexture } from './encounterTextures'
import { horrorGround } from './horrorPlan'
import { interiorVisit } from './interiorEvents'
import { rampEyeLayout, RAMP } from './rampEyesPlan'

// The climb to the gallery (S15P31B105-450) is lined with eyes: both walls of the ramp, shut as you come to it,
// opening in a wave around you as you climb and every one of them turning to follow you. They blink out of step;
// near the top they all snap shut at once, and the silence is worse. One instanced mesh per part, so ~140 eyes cost
// seven draw calls.

const sclera = new SphereGeometry(.5, 20, 12)
const iris = new CircleGeometry(.5, 20)
const glint = new SphereGeometry(.016, 6, 4)
const slit = new SphereGeometry(.5, 16, 10)

/** One part of an eye, in the eye's own frame (looking out along +z); `lid` parts close with the eyelid. */
type Part = { key: string; at: [number, number, number]; scale: [number, number, number]; lid: boolean; pupil: boolean }
const PARTS: Part[] = [
  { key: 'socket', at: [0, 0, 0], scale: [.56, .33, .13], lid: false, pupil: false },
  { key: 'slit', at: [0, 0, .05], scale: [.78, .36, .06], lid: false, pupil: false },
  { key: 'sclera', at: [0, 0, .055], scale: [.72, .32, .16], lid: true, pupil: false },
  { key: 'iris', at: [0, 0, .137], scale: [.24, .24, 1], lid: true, pupil: true },
  { key: 'glint', at: [-.04, .04, .142], scale: [1, 1, 1], lid: true, pupil: true },
  { key: 'lid-up', at: [0, .14, .085], scale: [.42, .09, .085], lid: false, pupil: false },
  { key: 'lid-low', at: [0, -.135, .08], scale: [.4, .065, .07], lid: false, pupil: false },
]

export function RampEyes({ zone }: { zone: RefObject<Group | null> }) {
  const eyes = useMemo(() => rampEyeLayout(), [])
  const meshes = useRef<(InstancedMesh | null)[]>([])
  const state = useRef({ inside: false, since: 0, shutAt: -1, shut: false, nextSound: 0, opened: 0 })
  const open = useMemo(() => new Float32Array(eyes.length), [eyes])
  const blinkAt = useMemo(() => Float32Array.from(eyes, () => 2 + Math.random() * 8), [eyes])
  const tmp = useMemo(() => ({ eye: new Matrix4(), part: new Matrix4(), out: new Matrix4(), q: new Quaternion(), e: new Euler(), v: new Vector3(), s: new Vector3(), local: new Vector3() }), [])
  // Where each eye sits in the world, once.
  const frames = useMemo(() => eyes.map(e => {
    const q = new Quaternion().setFromEuler(new Euler(0, Math.atan2(e.nx, 0), e.roll))
    return { m: new Matrix4().compose(new Vector3(e.x, horrorGround(e.x, e.z) + e.h, e.z), q, new Vector3(e.size, e.size, e.size)), inv: q.clone().invert() }
  }), [eyes])

  useEffect(() => () => { state.current.inside = false }, [])
  useFrame(({ camera, clock }, dt) => {
    let shown = !!zone.current
    for (let n: Object3D | null = zone.current; n; n = n.parent) if (!n.visible) shown = false
    const now = clock.elapsedTime, st = state.current, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z
    const onRamp = shown && cx > RAMP.x0 && cx < RAMP.x1 && cz < RAMP.z0 && cz > RAMP.z1 - 4
    if (onRamp && !st.inside) Object.assign(st, { inside: true, since: now, shut: false, shutAt: -1, opened: 0 })
    if (!onRamp && st.inside) st.inside = false
    // Nearly at the top they all shut at once; walk back down and they open again.
    if (st.inside && !st.shut && cz < RAMP.top) { st.shut = true; st.shutAt = now; sound('shut') }
    if (st.inside && st.shut && cz > RAMP.top + 3) { st.shut = false; st.since = now; st.opened = 0 }
    let opening = 0
    for (let i = 0; i < eyes.length; i++) {
      const e = eyes[i]!, d = Math.hypot(e.x - cx, e.z - cz)
      let want = st.inside && !st.shut && d < 11 && now - st.since > e.delay + d * .05 ? 1 : 0
      if (want && now > blinkAt[i]! && now < blinkAt[i]! + .16) want = .05
      if (now > blinkAt[i]! + .16) blinkAt[i] = now + 3 + Math.random() * 9
      const was = open[i]!
      open[i] = st.shut ? Math.max(0, was - dt * 14) : was + (want - was) * Math.min(1, dt * (want > was ? 7 : 12))
      if (was < .3 && open[i]! >= .3) opening++
    }
    if (opening && now > st.nextSound) { sound('open', Math.min(6, opening)); st.nextSound = now + .35 }
    if (st.inside && !st.shut && now > st.nextSound + 2.5 && Math.random() < dt * .4) { sound('murmur'); st.nextSound = now + 1 }
    // Lids and pupils: each part's instance = eye placement × (lid opening) × (pupil turned to you) × part.
    for (let k = 0; k < PARTS.length; k++) {
      const mesh = meshes.current[k], part = PARTS[k]!
      if (!mesh) continue
      if (!part.lid && mesh.userData.placed) continue
      for (let i = 0; i < eyes.length; i++) {
        const f = frames[i]!
        let px = part.at[0], py = part.at[1]
        if (part.pupil) {
          tmp.local.set(cx, cy, cz).sub(tmp.v.setFromMatrixPosition(f.m)).applyQuaternion(f.inv).normalize()
          px += Math.max(-.078, Math.min(.078, tmp.local.x * .11)); py += Math.max(-.033, Math.min(.033, tmp.local.y * .08))
        }
        const lid = part.lid ? .04 + .96 * open[i]! : 1
        tmp.part.compose(tmp.v.set(px, py * lid, part.at[2]), tmp.q.identity(), tmp.s.set(part.scale[0], part.scale[1] * lid, part.scale[2]))
        mesh.setMatrixAt(i, tmp.out.multiplyMatrices(f.m, tmp.part))
      }
      mesh.instanceMatrix.needsUpdate = true
      mesh.userData.placed = true
    }
  })
  const flesh = encounterFinishes.flesh
  return <group name="ramp-eyes" userData={{ keepOpaque: true }}>
    {PARTS.map((part, k) => {
      const geometry = part.key === 'sclera' ? sclera : part.key === 'iris' ? iris : part.key === 'glint' ? glint
        : part.key === 'slit' ? slit : lumpGeometry(part.key === 'socket' ? 'socket' : part.key, 0, 0, .4)
      return <instancedMesh key={part.key} ref={m => { meshes.current[k] = m }} args={[geometry, undefined, eyes.length]} frustumCulled={false}>
        {part.key === 'sclera' ? <meshStandardMaterial map={scleraTexture()} roughness={.12} emissive="#ffffff" emissiveIntensity={.12} />
          : part.key === 'iris' ? <meshStandardMaterial map={irisTexture('#8a6422')} roughness={.08} emissive="#ffffff" emissiveIntensity={.1} />
          : part.key === 'glint' ? <meshBasicMaterial color="#fffaf0" toneMapped={false} />
          : part.key === 'slit' ? <meshStandardMaterial color="#140707" roughness={.4} />
          : <meshStandardMaterial color={part.key === 'socket' ? '#4a2724' : '#5c302c'} map={flesh.texture} bumpMap={flesh.texture} bumpScale={flesh.bumpScale} roughness={flesh.roughness} />}
      </instancedMesh>
    })}
  </group>
}

function sound(kind: 'open' | 'shut' | 'murmur', count = 1) {
  if (interiorVisit.active) return
  const out = effectsOutput()
  if (out) playEyes(out.context, out.bus, kind, count)
}
