import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedBufferAttribute, MeshBasicMaterial, MeshStandardMaterial, Object3D, Vector3, type InstancedMesh, type BufferGeometry } from 'three'
import { jumpArt, jumpStartArt, jumpFinishArt, jumpParticleGeometry } from '../../layout-preview/jumpGeometry'
import type { JumpTheme } from '../../layout-preview/jumpCourse'
import { avatars, sampleAvatar } from '../../network/worldClient'
import { COURSE, START, targetFade, type CourseBlock } from './course'
import { hits, onStep, standing, useJumpmap } from './state'
import { applyLandingMotion, landingGeometry } from './landingMotion'

const groups = [...new Set(COURSE.map(b => b.theme))].map(theme => ({ theme, pads: COURSE.filter(b => b.theme === theme) }))
const clock = { value: 0 }
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
  material.customProgramCacheKey = () => `service-jump-${theme}-${finish}-tactile-2`
  return material
}
function Batch({ theme, pads, art, enabled = true }: { theme: JumpTheme; pads: readonly CourseBlock[]; art?: Record<string, BufferGeometry>; enabled?: boolean }) {
  const meshes = useRef<InstancedMesh[]>([])
  const pose = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0 }), [])
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)'), [])
  const batches = useMemo(() => Object.entries(art ?? jumpArt[theme]).map(([finish, source]) => {
    const geometry = landingGeometry(source, theme)
    geometry.setAttribute('aFade', new InstancedBufferAttribute(new Float32Array(pads.length).fill(1), 1))
    geometry.setAttribute('aHit', new InstancedBufferAttribute(new Float32Array(pads.length).fill(-1e6), 1))
    geometry.setAttribute('aPower', new InstancedBufferAttribute(new Float32Array(pads.length).fill(0), 1))
    return { finish, geometry, material: materialFor(theme, finish) }
  }), [theme, pads, art])
  useLayoutEffect(() => {
    const object = new Object3D(), color = new Color()
    for (const mesh of meshes.current) {
      pads.forEach((p, i) => {
        object.position.set(p.x, p.top, p.z); object.rotation.set(0, p.yaw, 0); object.updateMatrix(); mesh.setMatrixAt(i, object.matrix)
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
      attribute.array.fill(value); attribute.needsUpdate = true
    }
  }, [batches, enabled])
  useFrame(({ camera }, dt) => {
    if (!enabled) return
    const now = performance.now(); clock.value = now / 1000
    const s = useJumpmap.getState(), own = avatars.get(s.owner)
    if (own) sampleAvatar(own, now, pose)
    const occupied = new Set(standing.values())
    const dx = camera.position.x - pose.x, dy = camera.position.y - (pose.y + .4), dz = camera.position.z - pose.z, lengthSq = dx * dx + dy * dy + dz * dz
    for (const batch of batches) {
      const fade = batch.geometry.getAttribute('aFade') as InstancedBufferAttribute, hit = batch.geometry.getAttribute('aHit') as InstancedBufferAttribute, power = batch.geometry.getAttribute('aPower') as InstancedBufferAttribute
      pads.forEach((p, i) => {
        const along = lengthSq ? ((p.x - pose.x) * dx + (p.top - pose.y - .4) * dy + (p.z - pose.z) * dz) / lengthSq : 0
        const occluded = along > .03 && along < .97 && Math.hypot(p.x - pose.x - dx * along, p.top - pose.y - .4 - dy * along, p.z - pose.z - dz * along) < Math.max(p.halfX, p.halfZ) + .5
        const target = art === jumpStartArt ? 1 : art ? s.run ? .8 : .4 : targetFade(p.top, pose.y - .8, !!s.run, occupied.has(p.block), occluded)
        fade.setX(i, target + (fade.getX(i) - target) * Math.exp(-Math.min(dt, .1) * 6))
        const h = hits.get(p.block)
        if (!art && h && (h.power === 1 || Math.hypot(p.x - pose.x, p.top - pose.y + .8, p.z - pose.z) <= 25)) {
          hit.setX(i, h.at / 1000); power.setX(i, reduced.matches ? 0 : h.power)
        }
      })
      fade.needsUpdate = hit.needsUpdate = power.needsUpdate = true
    }
  })
  return <group name={art ? art === jumpStartArt ? 'service-jump-start' : 'service-jump-finish' : `service-jump-${theme}`} userData={{ keepOpaque: true }}>{batches.map((b, i) => <instancedMesh key={b.finish} visible={enabled} receiveShadow={art === jumpStartArt} userData={{ prepareWhenHidden: true }} ref={m => { if (m) meshes.current[i] = m }} args={[b.geometry, b.material, pads.length]} dispose={null} />)}</group>
}
function LandingEffects({ enabled }: { enabled: boolean }) {
  const mesh = useRef<InstancedMesh>(null)
  const particles = useMemo(() => Array.from({ length: 96 }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, color: '#fff' })), [])
  const cursor = useRef(0), object = useMemo(() => new Object3D(), []), color = useMemo(() => new Color(), [])
  const material = useMemo(() => new MeshBasicMaterial(), [])
  useLayoutEffect(() => {
    const current = mesh.current!
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
    if (!enabled || !mesh.current) return
    const dt = Math.min(delta, .05)
    particles.forEach((p, i) => {
      p.life -= dt; p.vy -= dt * 12; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt
      object.position.set(p.x, p.y, p.z); object.scale.setScalar(p.life > 0 ? Math.min(1, p.life * 4) : 0); object.updateMatrix()
      mesh.current!.setMatrixAt(i, object.matrix); mesh.current!.setColorAt(i, color.set(p.color))
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
  })
  return <instancedMesh name="service-jump-effects" visible={enabled} userData={{ prepareWhenHidden: true }} ref={mesh} args={[jumpParticleGeometry, material, particles.length]} dispose={null} frustumCulled={false} />
}
const marker = [{ ...COURSE[0]!, block: -1, x: START.x, z: START.z, top: .11, yaw: 0 }]
const finish = [{ ...marker[0]!, x: 0, z: 0, top: 0 }]
export function ServiceJumpCourse() {
  const available = useJumpmap(s => s.available)
  return <group name="service-jump-course" userData={{ cameraCollision: false }}>
    <Batch theme="gate" pads={marker} art={jumpStartArt} />
    {/* Prepare GPU resources before the status request completes. Visibility and
        hit targets still follow server availability; physics uses its own contract. */}
    {groups.map(g => <Batch key={g.theme} {...g} enabled={available} />)}
    <Batch theme="gate" pads={finish} art={jumpFinishArt} enabled={available} />
    <LandingEffects enabled={available} />
  </group>
}
