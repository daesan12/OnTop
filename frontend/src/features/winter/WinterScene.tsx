import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Object3D, ShaderMaterial, type Points } from 'three'
import { PropBuilder } from '../../world/art/propGeometry'
import { PropModel } from '../../world/art/PropModel'
import { groundSurfaceHeight } from '../../../park-renewal-preview/groundSurface'
import { estimatedServerTime, useSession, avatars, sampleAvatar } from '../../network/worldClient'
import { RoofSnow } from './roofSnow'
import { WINTER_DECOR, SNOW_PILES } from './plan'
import { useWinter, winterFrozen, type WinterPlayer } from './state'

function decoration(kind: typeof WINTER_DECOR[number]['kind']) {
  const b = new PropBuilder([10, 6]), snow = '#eef5f0', red = '#a63837', gold = '#deb668'
  if (kind === 'tree') {
    b.cylinder('wood', '#70503a', [0, .6, 0], .28, .35, 1.2)
    for (let i = 0; i < 4; i++) {
      const y = 1.8 + i * 1.22, radius = 2.5 - i * .52
      b.cylinder('paint', i % 2 ? '#234c3d' : '#2f604a', [0, y, 0], .1, radius, 2.6)
      b.cylinder('paint', snow, [0, y + .77, 0], .14, radius * .58 + .06, 1.16)
      b.cylinder('paint', snow, [0, y - 1.23, 0], radius * .94, radius * .99, .14)
      for (let j = 0; j < 9; j++) {
        const a = j * Math.PI * 2 / 9 + i * .6
        b.ball('paint', j % 2 ? red : gold, [Math.sin(a) * radius * .79, y - .7, Math.cos(a) * radius * .79], [.13, .16, .13])
      }
    }
    // 다섯 갈래 별은 앞·뒤 어디서 보아도 식별되도록 입체적으로 만든다.
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5
      b.box('gold', gold, [Math.sin(a) * .22, 7.25 + Math.cos(a) * .22, 0], [.16, .6, .16], [0, 0, -a])
    }
  } else if (kind === 'snowman') {
    b.ball('paint', snow, [0, .72, 0], [.85, .78, .85])
    b.ball('paint', snow, [0, 1.62, 0], [.58, .58, .58])
    b.ball('paint', snow, [0, 2.27, 0], [.4, .4, .4])
    b.cylinder('paint', '#263934', [0, 2.68, 0], .48, .48, .09)
    b.cylinder('paint', '#263934', [0, 2.88, 0], .27, .3, .4)
    b.ring('paint', red, [0, 1.96, 0], .38, .12, [Math.PI / 2, 0, 0])
    b.box('paint', red, [.26, 1.65, .5], [.18, .62, .1], [0, 0, -.12])
    for (const x of [-.14, .14]) b.ball('paint', '#24352e', [x, 2.34, .36], [.045, .05, .035])
    b.cylinder('paint', '#d68034', [0, 2.22, .52], .01, .09, .36, [Math.PI / 2, 0, 0])
    for (const y of [1.35, 1.64, 1.86]) b.ball('paint', '#34423a', [0, y, .53], [.06, .06, .06])
    for (const x of [-1, 1]) b.cylinder('wood', '#71503d', [x * .76, 1.72, 0], .035, .05, .92, [0, 0, x * -.9])
  } else if (kind === 'gifts') {
    for (const [i, [x, y, z, size]] of [[-.55, .4, 0, .8], [.45, .3, .2, .6], [.1, .92, -.3, .55]].entries()) {
      b.box('paint', [red, '#2c604d', '#dbc590'][i]!, [x!, y!, z!], [size!, size!, size!])
      b.box('gold', gold, [x!, y!, z!], [size! + .02, size! + .02, .1])
      b.box('gold', gold, [x!, y!, z!], [.1, size! + .025, size! + .025])
      b.ring('gold', gold, [x! - .12, y! + size! / 2 + .06, z!], .13, .035)
      b.ring('gold', gold, [x! + .12, y! + size! / 2 + .06, z!], .13, .035)
    }
  } else {
    for (const x of [-.23, .23]) {
      b.ball('paint', '#26312d', [x, .16, .12], [.21, .17, .32])
      b.cylinder('paint', red, [x, .48, 0], .18, .16, .65)
    }
    b.ball('paint', red, [0, 1.12, 0], [.65, .67, .43])
    b.box('paint', '#edeadf', [0, 1.22, .42], [.12, .85, .08])
    b.box('paint', '#31352c', [0, .87, .31], [1.08, .17, .24])
    b.box('gold', gold, [0, .87, .45], [.23, .23, .07])
    b.ball('paint', '#e9bc99', [0, 1.98, 0], [.38, .4, .34])
    b.ball('paint', snow, [0, 1.78, .25], [.36, .38, .22])
    b.ball('paint', '#e0a17f', [0, 1.99, .4], [.09, .08, .08])
    for (const x of [-.13, .13]) b.ball('paint', '#26312d', [x, 2.11, .31], [.035, .04, .03])
    b.cylinder('paint', red, [.07, 2.53, 0], 0, .4, .72, [0, 0, -.2])
    b.ring('paint', snow, [0, 2.24, 0], .35, .09, [Math.PI / 2, 0, 0])
    b.ball('paint', snow, [.15, 2.88, 0], [.13, .13, .13])
    b.cylinder('paint', red, [-.69, 1.2, 0], .17, .2, .7, [0, 0, -.25])
    b.ball('paint', snow, [-.77, .88, 0], [.18, .15, .18])
  }
  return b.finish()
}

function SantaHand() {
  const hand = useRef<Group>(null)
  useFrame(({ clock }) => { if (hand.current) hand.current.rotation.z = -.65 + Math.sin(clock.elapsedTime * 2.5) * .18 })
  return <group ref={hand} position={[.5, 1.48, 0]}>
    <mesh position={[0, .3, 0]}><capsuleGeometry args={[.16, .4, 3, 8]} /><meshLambertMaterial color="#a63837" /></mesh>
    <mesh position={[0, .64, 0]}><sphereGeometry args={[.19, 8, 6]} /><meshLambertMaterial color="#eef5f0" /></mesh>
  </group>
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
    <RoofSnow />
    <Snowfall low={low} />
    <Snowballs />
    <GroundSnow />
    <WinterActors />
    {WINTER_DECOR.map(d => <group key={d.id} name={'winter-' + d.id} position={[d.x, groundSurfaceHeight(d.x, d.z), d.z]}>
      <PropModel name={'winter-art-' + d.kind} art={art.get(d.kind)!} />
      {d.kind === 'santa' && <SantaHand />}
    </group>)}
  </group>
}
