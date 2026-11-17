import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedBufferAttribute, MeshBasicMaterial, MeshStandardMaterial, Object3D, Vector3, type InstancedMesh, type BufferGeometry } from 'three'
import { buildServiceJumpPadArt, jumpArt, jumpStartArt, jumpFinishArt, jumpParticleGeometry } from '../../layout-preview/jumpGeometry'
import type { JumpTheme } from '../../../park-renewal-preview/jump10Plan'
import { creatureJumpArt } from '../../../park-renewal-preview/creatureJumpArt'
import { renewalPadAt, renewalPadPose, renewalPadShown, syncRenewalMotion, updateRenewalContact } from './renewalMotion'
import { avatars, sampleAvatar, type Pose } from '../../network/worldClient'
import { COURSE, FINISH, START, renewalCourse, targetFade, type CourseBlock } from './activeCourse'
import { hits, onStep, standing, useJumpmap } from './state'
import { applyLandingMotion, landingGeometry } from './landingMotion'
import { cameraWorldPosition, parkXRView } from '../../world/xrView'

const groups = [...new Set(COURSE.map(b => b.theme))].map(theme => ({ theme, pads: COURSE.filter(b => b.theme === theme) }))
const artByTheme = { ...jumpArt, ...(renewalCourse ? buildServiceJumpPadArt() : {}), ...creatureJumpArt }
const clock = { value: 0 }
type CourseFrame = { pose: Pose; running: boolean; motionTime: number; occupied: Set<number> }

function scaleFor(pad: CourseBlock): [number, number] {
  if (!renewalCourse) return [1, 1]
  if (pad.theme === 'stone') return [pad.halfX / .9, pad.halfZ / .9]
  if (pad.theme === 'duck') return [pad.halfX / .68, pad.halfZ / .9]
  const size = pad.theme === 'mole' ? pad.radius! / .68 : pad.theme === 'pigeon' ? pad.radius! / .72
    : pad.theme === 'lily' && pad.stage === 7 ? pad.radius! : 1
  return [size, size]
}
function materialFor(theme: JumpTheme, finish: string) {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: theme === 'gomoku' ? .26 : theme === 'lily' ? .45 : .85, metalness: finish === 'gold' ? .75 : 0 })
  material.onBeforeCompile = shader => {
    shader.vertexShader = `attribute float aFade; varying float vFade;\n${shader.vertexShader}`
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vFade=aFade;
    `)
    shader.fragmentShader = `varying float vFade;\n${shader.fragmentShader}`
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 px=mod(floor(gl_FragCoord.xy),4.);
      float b2=mod(2.*mod(px.x,2.)+3.*mod(px.y,2.),4.);
      float b4=mod(2.*floor(px.x/2.)+3.*floor(px.y/2.),4.);
      if(vFade<.995 && vFade<=(4.*b2+b4+.5)/16.)discard;
    `)
    if (finish === 'glow') shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight+=diffuseColor.rgb*.45;\n#include <opaque_fragment>')
  }
  applyLandingMotion(material, theme, clock)
  material.customProgramCacheKey = () => `service-jump-${theme}-${finish}-tactile-3`
  return material
}
function idlePadFade(block: number, playable: boolean) {
  if (!renewalCourse) return 1
  if (block >= renewalCourse.visibleAtStart) return 0
  return playable && block < renewalCourse.opaqueAtStart ? 1 : .32
}

function Batch({ theme, pads, art, enabled = true, frame }: {
  theme: JumpTheme; pads: readonly CourseBlock[]; art?: Record<string, BufferGeometry>; enabled?: boolean; frame: CourseFrame
}) {
  const movingPad = theme === 'lily' || theme === 'mole' || theme === 'pigeon'
  const meshes = useRef<InstancedMesh[]>([])
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)'), [])
  const batches = useMemo(() => Object.entries(art ?? artByTheme[theme]).map(([finish, source]) => {
    const geometry = landingGeometry(source, theme)
    geometry.setAttribute('aFade', new InstancedBufferAttribute(Float32Array.from(pads, pad => idlePadFade(pad.block, false)), 1))
    geometry.setAttribute('aHit', new InstancedBufferAttribute(new Float32Array(pads.length).fill(-1e6), 1))
    geometry.setAttribute('aPower', new InstancedBufferAttribute(new Float32Array(pads.length).fill(0), 1))
    return { finish, geometry, material: materialFor(theme, finish) }
  }), [theme, pads, art])
  useLayoutEffect(() => {
    const object = new Object3D(), color = new Color()
    for (const mesh of meshes.current) {
      pads.forEach((p, i) => {
        const [sx, sz] = scaleFor(p)
        object.position.set(p.x, p.top, p.z); object.rotation.set(0, p.yaw, 0)
        object.scale.set(sx, 1, sz); object.updateMatrix(); mesh.setMatrixAt(i, object.matrix)
        mesh.setColorAt(i, color.set(theme === 'gomoku' && p.ordinal % 2 ? '#171a1c' : '#ffffff'))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    return () => { meshes.current.forEach(m => m.dispose()); batches.forEach(b => { b.geometry.dispose(); b.material.dispose() }) }
  }, [batches, pads, theme])
  useLayoutEffect(() => {
    if (enabled) return
    for (const batch of batches) for (const [name, value] of [['aFade', 1], ['aHit', -1e6], ['aPower', 0]] as const) {
      const attribute = batch.geometry.getAttribute(name) as InstancedBufferAttribute
      if (name === 'aFade') pads.forEach((pad, index) => attribute.setX(index, idlePadFade(pad.block, false)))
      else attribute.array.fill(value)
      attribute.needsUpdate = true
    }
  }, [batches, enabled, pads])
  useFrame(({ camera }, dt) => {
    if (!enabled) return
    const { pose, running, motionTime, occupied } = frame
    const dynamic = !!renewalCourse && !art
    const eye = dynamic ? pose : cameraWorldPosition(camera)
    const dx = eye.x - pose.x, dy = eye.y - (pose.y + .4), dz = eye.z - pose.z, lengthSq = dx * dx + dy * dy + dz * dz
    const fadeWeight = Math.exp(-Math.min(dt, .1) * 6)
    for (const [batchIndex, batch] of batches.entries()) {
      const mesh = meshes.current[batchIndex]
      const fade = batch.geometry.getAttribute('aFade') as InstancedBufferAttribute, hit = batch.geometry.getAttribute('aHit') as InstancedBufferAttribute, power = batch.geometry.getAttribute('aPower') as InstancedBufferAttribute
      let fadeChanged = false, hitChanged = false, powerChanged = false, matrixChanged = false
      pads.forEach((p, i) => {
        let alpha: number
        if (dynamic) {
          const motion = movingPad ? renewalPadPose(p, motionTime) : undefined
          const shown = renewalPadShown(p.block) && motion?.visible !== false
          alpha = shown ? (running ? 1 : idlePadFade(p.block, true)) : 0
          if (mesh && motion) {
            const height = Math.fround(p.top + motion.offset)
            const index = i * 16 + 13
            if (mesh.instanceMatrix.array[index] !== height) {
              mesh.instanceMatrix.array[index] = height
              matrixChanged = true
            }
          }
        } else {
          const along = lengthSq ? ((p.x - pose.x) * dx + (p.top - pose.y - .4) * dy + (p.z - pose.z) * dz) / lengthSq : 0
          const occluded = along > .03 && along < .97 && Math.hypot(p.x - pose.x - dx * along, p.top - pose.y - .4 - dy * along, p.z - pose.z - dz * along) < Math.max(p.halfX, p.halfZ) + .5
          const target = art === jumpStartArt ? 1 : art ? running ? .8 : .4 : targetFade(p.top, pose.y - .8, running, occupied.has(p.block), occluded)
          alpha = parkXRView.active ? 1 : target + (fade.getX(i) - target) * fadeWeight
        }
        if (fade.getX(i) !== Math.fround(alpha)) {
          fade.setX(i, alpha)
          fadeChanged = true
        }
        const h = hits.get(p.block)
        if (!art && h && (h.power === 1 || Math.hypot(p.x - pose.x, p.top - pose.y + .8, p.z - pose.z) <= 25)) {
          const time = Math.fround(h.at / 1000), force = Math.fround(reduced.matches || parkXRView.active ? 0 : h.power)
          if (hit.getX(i) !== time) { hit.setX(i, time); hitChanged = true }
          if (power.getX(i) !== force) { power.setX(i, force); powerChanged = true }
        }
      })
      if (mesh && matrixChanged) mesh.instanceMatrix.needsUpdate = true
      if (fadeChanged) fade.needsUpdate = true
      if (hitChanged) hit.needsUpdate = true
      if (powerChanged) power.needsUpdate = true
    }
  })
  return <group name={art ? art === jumpStartArt ? 'service-jump-start' : 'service-jump-finish' : `service-jump-${theme}`} userData={{ keepOpaque: true }}>{batches.map((b, i) => <instancedMesh key={b.finish} visible={enabled || !!renewalCourse} receiveShadow={art === jumpStartArt} userData={{ prepareWhenHidden: true }} ref={m => { if (m) meshes.current[i] = m }} args={[b.geometry, b.material, pads.length]} dispose={null} />)}</group>
}
function LandingEffects({ enabled }: { enabled: boolean }) {
  const mesh = useRef<InstancedMesh>(null)
  const particles = useMemo(() => Array.from({ length: 96 }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, color: '#fff' })), [])
  const cursor = useRef(0), object = useMemo(() => new Object3D(), []), color = useMemo(() => new Color(), [])
  const material = useMemo(() => new MeshBasicMaterial(), [])
  useLayoutEffect(() => {
    const current = mesh.current!
    current.count = 0
    object.scale.setScalar(0); object.updateMatrix(); color.set('#fff')
    for (let i = 0; i < particles.length; i++) { current.setMatrixAt(i, object.matrix); current.setColorAt(i, color) }
    current.instanceMatrix.needsUpdate = true
    if (current.instanceColor) current.instanceColor.needsUpdate = true
    return () => { current.dispose(); material.dispose() }
  }, [material, particles, object, color])
  useLayoutEffect(() => { if (!enabled) particles.forEach(p => { p.life = 0 }) }, [enabled, particles])
  useLayoutEffect(() => onStep((block, player, power) => {
    const p = COURSE[block], s = useJumpmap.getState(), own = avatars.get(s.owner)
    if (!s.available || document.hidden || !p || !own || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (player !== s.owner && new Vector3(p.x, p.top, p.z).distanceTo(new Vector3(own.current.x, own.current.y - .8, own.current.z)) > 25) return
    for (let i = 0; i < (player === s.owner ? 10 : 5); i++) {
      const a = i * 2.39996
      Object.assign(particles[cursor.current++ % particles.length]!, { life: .5, x: p.x, y: p.top + .06, z: p.z, vx: Math.cos(a) * power * 1.5, vy: 1.4 + i % 3 * .3, vz: Math.sin(a) * power * 1.5, color: p.theme === 'lily' ? '#bfe6ff' : p.theme === 'lantern' || p.gate ? '#ffdc81' : p.theme === 'fish' ? '#692a21' : '#d8d0bc' })
    }
  }), [particles])
  useFrame((_, delta) => {
    const current = mesh.current
    if (!current) return
    if (!enabled) { current.count = 0; return }
    const dt = Math.min(delta, .05)
    let count = 0
    for (const p of particles) {
      if (p.life <= dt) { p.life = 0; continue }
      p.life -= dt; p.vy -= dt * 12; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt
      object.position.set(p.x, p.y, p.z); object.scale.setScalar(Math.min(1, p.life * 4)); object.updateMatrix()
      current.setMatrixAt(count, object.matrix); current.setColorAt(count++, color.set(p.color))
    }
    current.count = count
    if (!count) return
    current.instanceMatrix.needsUpdate = true
    if (current.instanceColor) current.instanceColor.needsUpdate = true
  })
  return <instancedMesh name="service-jump-effects" visible={enabled} userData={{ prepareWhenHidden: true }} ref={mesh} args={[jumpParticleGeometry, material, particles.length]} dispose={null} frustumCulled={false} />
}
const marker = [{ ...COURSE[0]!, block: -1, x: START.x, z: START.z, top: .11, yaw: 0 }]
const finish = [{ ...marker[0]!, x: 0, z: 0, top: 0 }]
export function ServiceJumpCourse() {
  const available = useJumpmap(s => s.available)
  const finishing = useJumpmap(s => s.run?.finalReached === true)
  const [frame, feet] = useMemo((): [CourseFrame, { x: number; y: number; z: number }] => [
    { pose: { x: 0, y: 0, z: 0, yaw: 0 }, running: false, motionTime: 0, occupied: new Set() },
    { x: 0, y: 0, z: 0 },
  ], [])
  useFrame(() => {
    const now = performance.now()
    clock.value = now / 1000
    const state = useJumpmap.getState()
    const own = avatars.get(state.owner)
    // Every pad batch reads the same frame. Sampling the predicted avatar in
    // each batch used to re-enter the movement simulator once per theme.
    if (own) sampleAvatar(own, now, frame.pose)
    frame.running = !!state.run
    if (renewalCourse) {
      frame.motionTime = syncRenewalMotion()
      feet.x = frame.pose.x; feet.y = frame.pose.y - .8; feet.z = frame.pose.z
      updateRenewalContact(own && renewalPadAt(feet, frame.motionTime), frame.motionTime)
    } else {
      frame.occupied.clear()
      for (const block of standing.values()) frame.occupied.add(block)
    }
  }, -2)
  return <group name="service-jump-course" userData={{ cameraCollision: false }}>
    {!renewalCourse && <Batch theme="gate" pads={marker} art={jumpStartArt} frame={frame} />}
    {/* Prepare GPU resources before the status request completes. Visibility and
        hit targets still follow server availability; physics uses its own contract. */}
    {groups.map(g => <Batch key={g.theme} {...g} enabled={available} frame={frame} />)}
    {renewalCourse ? finishing && <mesh name="jump-course-finish" position={[FINISH.x, FINISH.y, FINISH.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.75, 2, 48]} />
      <meshBasicMaterial color="#d2ad55" side={2} />
    </mesh> : <Batch theme="gate" pads={finish} art={jumpFinishArt} enabled={available} frame={frame} />}
    <LandingEffects enabled={available} />
  </group>
}
