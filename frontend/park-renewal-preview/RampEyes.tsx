import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Euler, InstancedBufferAttribute, Matrix4, PlaneGeometry, Quaternion, ShaderMaterial, SRGBColorSpace, TextureLoader, Vector3, type Group, type InstancedMesh, type Object3D } from 'three'
import { effectsOutput } from '../src/audio/bgm'
import { playEyes } from './horrorAudio'
import { flashlight } from './encounterStaging'
import { horrorGround } from './horrorPlan'
import { interiorVisit } from './interiorEvents'
import { rampEyeLayout, RAMP } from './rampEyesPlan'

// The climb to the gallery (S15P31B105-450) is lined with eyes. Real ones: photographs (Gemini) of two human eyes,
// open and shut, set flat into the stone and fading into it at the edges, as if the wall had grown them. A
// photograph looking straight out of a wall looks at you from wherever you stand, so every eye follows you. They are
// shut as you come to the ramp, open in a wave around you as you climb, blink out of step, widen when you are close,
// and near the top all snap shut at once. One instanced plane and one 1536×768 texture for all of them; they are lit
// only by your torch (and a little of the dark), so out of its beam they are pale smudges, and in it they are eyes.

const ATLAS = new URL('./textures/ramp-eyes.webp', import.meta.url).href
const plane = new PlaneGeometry(1, .5)

const vertex = /* glsl */`
attribute float aOpen;
attribute float aVariant;
varying vec2 vUv;
varying float vOpen;
varying float vVariant;
varying vec3 vWorld;
void main() {
  vUv = uv; vOpen = aOpen; vVariant = aVariant;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`
const fragment = /* glsl */`
uniform sampler2D atlas;
uniform vec3 eye;
uniform vec3 look;
uniform float torch;
varying vec2 vUv;
varying float vOpen;
varying float vVariant;
varying vec3 vWorld;
vec3 tile(float column) {
  vec2 uv = vec2(vUv.x * .5 + column * .5, vUv.y * .5 + (1. - vVariant) * .5);
  return texture2D(atlas, uv).rgb;
}
void main() {
  // The open eye and the shut one, cut by the lid: the shut picture wins from above and below the eye inwards.
  vec3 open = tile(0.), shut = tile(1.);
  float lid = smoothstep(vOpen - .15, vOpen + .15, abs(vUv.y - .5) * 2.4);
  vec3 color = mix(open, shut, max(lid, 1. - smoothstep(.05, .35, vOpen)));
  // Grown out of the stone: an oval that fades into the wall.
  vec2 p = (vUv - .5) * 2.;
  float edge = 1. - smoothstep(.62, 1., length(p));
  // Torchlight only: a cone from your eyes, falling off with distance; the dark leaves a faint shape.
  vec3 to = vWorld - eye;
  float d = length(to);
  float cone = smoothstep(.9, .975, dot(to / d, look)) * torch; // the torch: .46 rad, soft edge (HorrorZone)
  float light = .035 + 1.9 * cone / (1. + .05 * d * d);
  // The wet whites catch what little light there is.
  float shine = smoothstep(.5, .8, dot(color, vec3(.33))) * .22 * vOpen;
  gl_FragColor = vec4(color * light + color * shine, edge);
  #include <colorspace_fragment>
}`

export function RampEyes({ zone }: { zone: RefObject<Group | null> }) {
  const eyes = useMemo(() => rampEyeLayout(), [])
  const texture = useLoader(TextureLoader, ATLAS)
  const mesh = useRef<InstancedMesh>(null)
  const state = useRef({ inside: false, since: 0, shut: false, nextSound: 0 })
  const open = useMemo(() => new Float32Array(eyes.length), [eyes])
  const blinkAt = useMemo(() => Float32Array.from(eyes, () => 2 + Math.random() * 8), [eyes])
  const openAttr = useMemo(() => new InstancedBufferAttribute(new Float32Array(eyes.length), 1), [eyes])
  const variantAttr = useMemo(() => new InstancedBufferAttribute(Float32Array.from(eyes, e => e.variant), 1), [eyes])
  const geometry = useMemo(() => {
    const g = plane.clone()
    g.setAttribute('aOpen', openAttr)
    g.setAttribute('aVariant', variantAttr)
    return g
  }, [openAttr, variantAttr])
  const material = useMemo(() => {
    texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4
    return new ShaderMaterial({
      uniforms: { atlas: { value: texture }, eye: { value: new Vector3() }, look: { value: new Vector3(0, 0, -1) }, torch: { value: 1 } },
      vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    })
  }, [texture])
  const tmp = useMemo(() => ({ m: new Matrix4(), v: new Vector3(), s: new Vector3() }), [])
  const placed = useMemo(() => eyes.map(e => ({
    q: new Quaternion().setFromEuler(new Euler(0, Math.atan2(e.nx, 0), e.roll)),
    at: new Vector3(e.x + e.nx * .012, horrorGround(e.x, e.z) + e.h, e.z),
  })), [eyes])

  useEffect(() => () => { state.current.inside = false; material.dispose(); geometry.dispose() }, [material, geometry])

  useFrame(({ camera, clock }, dt) => {
    const m = mesh.current
    if (!m) return
    let shown = !!zone.current
    for (let n: Object3D | null = zone.current; n; n = n.parent) if (!n.visible) shown = false
    const now = clock.elapsedTime, st = state.current, cx = camera.position.x, cz = camera.position.z
    const onRamp = shown && cx > RAMP.x0 && cx < RAMP.x1 && cz < RAMP.z0 && cz > RAMP.z1 - 4
    if (onRamp && !st.inside) Object.assign(st, { inside: true, since: now, shut: false })
    if (!onRamp && st.inside) st.inside = false
    // Nearly at the top they all shut at once; walk back down and they open again.
    if (st.inside && !st.shut && cz < RAMP.top) { st.shut = true; sound('shut') }
    if (st.inside && st.shut && cz > RAMP.top + 3) { st.shut = false; st.since = now }
    let opening = 0
    const opens = openAttr.array as Float32Array
    for (let i = 0; i < eyes.length; i++) {
      const e = eyes[i]!, d = Math.hypot(e.x - cx, e.z - cz)
      let want = st.inside && !st.shut && d < 12 && now - st.since > e.delay + d * .05 ? 1 : 0
      if (want && now > blinkAt[i]! && now < blinkAt[i]! + .14) want = 0
      if (now > blinkAt[i]! + .14) blinkAt[i] = now + 3 + Math.random() * 9
      const was = open[i]!
      open[i] = st.shut ? Math.max(0, was - dt * 16) : was + (want - was) * Math.min(1, dt * (want > was ? 6 : 16))
      if (was < .3 && open[i]! >= .3) opening++
      // Close up, the eye widens on you.
      const widen = 1 + .12 * open[i]! * Math.max(0, 1 - d / 3)
      const p = placed[i]!
      m.setMatrixAt(i, tmp.m.compose(p.at, p.q, tmp.s.set(e.size * e.flip, e.size * widen, 1)))
      opens[i] = open[i]!
    }
    m.instanceMatrix.needsUpdate = true
    openAttr.needsUpdate = true
    camera.getWorldDirection(tmp.v)
    material.uniforms.eye!.value.copy(camera.position)
    material.uniforms.look!.value.copy(tmp.v)
    material.uniforms.torch!.value = flashlight.factor
    m.visible = shown
    if (opening && now > st.nextSound) { sound('open', Math.min(6, opening)); st.nextSound = now + .35 }
    if (st.inside && !st.shut && now > st.nextSound + 2.5 && Math.random() < dt * .4) { sound('murmur'); st.nextSound = now + 1 }
  })
  return <instancedMesh ref={mesh} name="ramp-eyes" args={[geometry, material, eyes.length]} frustumCulled={false} userData={{ keepOpaque: true }} />
}

function sound(kind: 'open' | 'shut' | 'murmur', count = 1) {
  if (interiorVisit.active) return
  const out = effectsOutput()
  if (out) playEyes(out.context, out.bus, kind, count)
}
