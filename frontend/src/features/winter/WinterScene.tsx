import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Object3D, ShaderMaterial, type Points } from 'three'
import { groundSurfaceHeight } from '../../../park-renewal-preview/groundSurface'
import { estimatedServerTime, useSession, avatars, sampleAvatar } from '../../network/worldClient'
import { SleighScene } from './sleigh/SleighScene'
import { RoofSnow } from './roofSnow'
import { WINTER_DECOR, SNOW_PILES } from './plan'
import { useWinter, winterFrozen, type WinterPlayer } from './state'
import { createHolidayArt } from './holidayArt'
import { createChristmasTreeArt } from './christmasTreeArt'

function decoration(kind: typeof WINTER_DECOR[number]['kind']) {
  return kind === 'tree' ? createChristmasTreeArt() : createHolidayArt(kind)
}

function HolidayProp({ art, kind }: { art: ReturnType<typeof createHolidayArt>; kind: string }) {
  return <group name={'winter-art-' + kind}>{Object.entries(art).map(([finish, geometry]) =>
    <mesh key={finish} geometry={geometry} dispose={null} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={finish === 'gold' ? .34 : .74}
        metalness={finish === 'gold' ? .48 : 0} side={2}
        emissive={finish === 'glow' ? '#ffc775' : '#000000'} emissiveIntensity={finish === 'glow' ? .9 : 0}
        toneMapped={finish !== 'glow'} />
    </mesh>,
  )}</group>
}

function Snowfall({ low }: { low: boolean }) {
  const particles = useRef<Points>(null)
  const { geometry, material } = useMemo(() => {
    const count = low ? 320 : 900, positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = ((i * .61803398875) % 1) * 64 - 32
      positions[i * 3 + 1] = ((i * .754877666) % 1) * 30
      positions[i * 3 + 2] = ((i * .414213562) % 1) * 64 - 32
    }
    const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(positions, 3))
    const material = new ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
      vertexShader: 'uniform float time; uniform float pixelRatio; void main(){vec3 p=position; p.y=mod(p.y-time*1.6,30.0)-10.0; p.x+=sin(time*.45+position.z)*.65; vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(120.0/max(1.0,-mv.z),2.5,7.0)*pixelRatio;}',
      fragmentShader: 'void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(.94,.98,1.0,(1.0-smoothstep(.2,.5,d))*.8);}',
    })
    return { geometry, material }
  }, [low])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  useFrame(({ camera, clock, gl }) => {
    if (!particles.current) return
    particles.current.position.copy(camera.position)
    material.uniforms.time!.value = clock.elapsedTime
    material.uniforms.pixelRatio!.value = Math.min(1.5, gl.getPixelRatio())
  })
  return <points ref={particles} name="winter-snowfall" geometry={geometry} material={material} frustumCulled={false} raycast={() => {}} />
}

function Snowballs() {
  const mesh = useRef<InstancedMesh>(null), shots = useWinter(s => s.shots)
  const dummy = useMemo(() => new Object3D(), [])
  useFrame(() => {
    if (!mesh.current) return
    const now = estimatedServerTime(), channel = useSession.getState().roomId
    for (let i = 0; i < 32; i++) {
      const shot = shots[i], age = shot ? now - Date.parse(shot.sentAt) : -1
      const visible = !!shot && channel === shot.channelId && age >= 0 && age < shot.durationMs + 450
      const t = shot ? Math.max(0, Math.min(1, age / shot.durationMs)) : 0
      for (let j = 0; j < 9; j++) {
        dummy.scale.setScalar(0)
        if (visible && shot) {
          const dx = shot.endX - shot.x, dz = shot.endZ - shot.z
          dummy.position.set(shot.x + dx * t, shot.y + .7 * Math.sin(Math.PI * Math.hypot(dx, dz) * t / 16), shot.z + dz * t)
          if (j === 0 && t < 1) dummy.scale.setScalar(1)
          if (j > 0 && t === 1) {
            const burst = Math.max(0, (age - shot.durationMs) / 450), a = j * 2.4
            dummy.position.x += Math.cos(a) * burst * .9
            dummy.position.y += Math.sin(j * 3) * burst * .7
            dummy.position.z += Math.sin(a) * burst * .9
            dummy.scale.setScalar((1 - burst) * .43)
          }
        }
        dummy.updateMatrix(); mesh.current.setMatrixAt(i * 9 + j, dummy.matrix)
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} name="winter-snowballs" args={[undefined, undefined, 288]} frustumCulled={false} raycast={() => {}}>
    <sphereGeometry args={[.15, 8, 6]} /><meshLambertMaterial color="#f4fcff" />
  </instancedMesh>
}

function GroundSnow() {
  const geometry = useMemo(() => {
    const vertices: number[] = [], colors: number[] = [], segments = 32
    SNOW_PILES.forEach((p, index) => {
      const phase = index * 2.39996, radius = p.radius - .6
      const vertex = (ring: number, segment: number) => {
        const a = segment * Math.PI * 2 / segments
        const edge = .9 + .11 * Math.sin(3 * a + phase) + .05 * Math.cos(5 * a - phase) + .03 * Math.sin(7 * a)
        const r = radius * ring * edge, u = Math.cos(a) * r, v = Math.sin(a) * r * (.9 + .1 * Math.sin(phase))
        const x = p.x + u * Math.cos(phase) - v * Math.sin(phase), z = p.z + u * Math.sin(phase) + v * Math.cos(phase)
        vertices.push(x, groundSurfaceHeight(x, z) + .025 + .055 * (1 - ring * ring), z)
        colors.push(.94 - .12 * ring ** 3, .98 - .09 * ring ** 3, 1 - .045 * ring ** 3)
      }
      for (let i = 0; i < segments; i++) {
        vertex(0, i); vertex(.45, i + 1); vertex(.45, i)
        for (const [inner, outer] of [[.45, .75], [.75, 1]]) {
          vertex(inner!, i); vertex(inner!, i + 1); vertex(outer!, i)
          vertex(inner!, i + 1); vertex(outer!, i + 1); vertex(outer!, i)
        }
      }
    })
    const result = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3))
      .setAttribute('color', new Float32BufferAttribute(colors, 3))
    result.computeVertexNormals(); return result
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh name="winter-ground-snow" geometry={geometry} dispose={null} raycast={() => {}}>
    <meshLambertMaterial vertexColors side={2} />
  </mesh>
}

function WinterActor({ player }: { player: WinterPlayer }) {
  const group = useRef<Group>(null), ice = useRef<Group>(null), held = useRef<Group>(null)
  const pose = useRef({ x: 0, y: 0, z: 0, yaw: 0 })
  useFrame(() => {
    const avatar = avatars.get(player.userId), root = group.current
    if (!root) return
    root.visible = !!avatar?.connected
    if (!avatar) return
    const p = sampleAvatar(avatar, performance.now(), pose.current)
    root.position.set(p.x, p.y, p.z); root.rotation.y = p.yaw
    if (ice.current) ice.current.visible = winterFrozen(player.userId, estimatedServerTime())
    if (held.current) held.current.visible = player.snowballs === 1 && !winterFrozen(player.userId, estimatedServerTime())
  })
  return <group ref={group} name={'winter-player-' + player.userId}>
    <group ref={held} position={[.52, .05, .12]}><mesh raycast={() => {}}><sphereGeometry args={[.17, 10, 8]} /><meshLambertMaterial color="#f4fbff" /></mesh></group>
    <group ref={ice} name={'winter-frozen-' + player.userId} position={[0, .3, 0]}>
      <mesh raycast={() => {}}><boxGeometry args={[1.05, 2.3, .95]} /><meshStandardMaterial color="#9cddf5" transparent opacity={.36} roughness={.15} depthWrite={false} /></mesh>
      <mesh position={[0, -1.1, 0]} raycast={() => {}}><cylinderGeometry args={[.7, .8, .12, 12]} /><meshLambertMaterial color="#e7f7ff" /></mesh>
    </group>
  </group>
}

function WinterActors() {
  const players = useWinter(s => s.players)
  return <group name="winter-player-props">{Object.values(players).map(p => <WinterActor key={p.userId} player={p} />)}</group>
}

export function WinterScene({ low = false }: { low?: boolean }) {
  const art = useMemo(() => new Map([...new Set(WINTER_DECOR.map(d => d.kind))].map(kind => [kind, decoration(kind)])), [])
  useEffect(() => () => { for (const value of art.values()) for (const g of Object.values(value)) g?.dispose() }, [art])
  return <group name="winter-park">
    <SleighScene />
    <RoofSnow />
    <Snowfall low={low} />
    <Snowballs />
    <GroundSnow />
    <WinterActors />
    {WINTER_DECOR.map(d => <group key={d.id} name={'winter-' + d.id} position={[d.x, groundSurfaceHeight(d.x, d.z), d.z]}>
      <HolidayProp kind={d.kind} art={art.get(d.kind)!} />
    </group>)}
  </group>
}
