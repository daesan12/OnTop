import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { AdditiveBlending, Color, Group, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, SphereGeometry, Vector3,
  type MeshBasicMaterial } from 'three'
import type { XYZ } from '../../world/art/propGeometry'
import { FlyingCard } from './FlyingCard'
import { LIVE_LAYOUT, MACHINE_ART, type Bulb } from './machineArt'
import { HeaderPlaque, NameDisplay } from './NameDisplay'
import { GlowArt, glowTexture, LIVE_FONT, PanelPlane, roundRect, StaticArt, useCanvasPanel, fitFont, type EmissiveMaterial } from './parts'
import { boardCells, currentPlace, currentResult, headline, ReelDirector, revealedBefore, SPIN, type BoardCell,
  type LiveScene, type ReelFrame } from './reel'
import { ResultBoard } from './ResultBoard'
import { phaseElapsed, useRaffleLive } from './store'
import { WinnerBurst } from './WinnerBurst'

/** 서버 연결 전 결과판 모양(1등 1, 2등 2, 3등 5) */
const DEFAULT_CELLS: BoardCell[] = ([1, 2, 2, 3, 3, 3, 3, 3] as const)
  .map((place, slotIndex) => ({ slotIndex, place, prizeName: '', state: 'pending', nickname: null, fresh: false }))

function drawSign(c: CanvasRenderingContext2D, w: number, h: number) {
  const bg = c.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#9a2a22')
  bg.addColorStop(1, '#5c1513')
  c.fillStyle = bg
  c.fillRect(0, 0, w, h)
  roundRect(c, 14, 14, w - 28, h - 28, 34)
  c.lineWidth = 9
  c.strokeStyle = '#e3b04f'
  c.stroke()
  roundRect(c, 30, 30, w - 60, h - 60, 24)
  c.lineWidth = 2
  c.strokeStyle = 'rgba(243, 199, 90, .6)'
  c.stroke()
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  const title = 'OnTop 공개 추첨'
  fitFont(c, title, h * .46, w * .84, 900)
  c.lineJoin = 'round'
  c.lineWidth = h * .07
  c.strokeStyle = '#3a0d0b'
  c.strokeText(title, w / 2, h * .43)
  const gold = c.createLinearGradient(0, h * .2, 0, h * .66)
  gold.addColorStop(0, '#fff8e2')
  gold.addColorStop(1, '#f2c254')
  c.fillStyle = gold
  c.fillText(title, w / 2, h * .43)
  c.font = `700 ${h * .12}px ${LIVE_FONT}`
  c.fillStyle = '#f1c46b'
  c.fillText('O N T O P   L I V E   R A F F L E', w / 2, h * .8)
}

function drawBanner(c: CanvasRenderingContext2D, w: number, h: number) {
  const bg = c.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#c23a30')
  bg.addColorStop(1, '#94231d')
  c.fillStyle = bg
  c.fillRect(0, 0, w, h)
  c.fillStyle = '#e3b04f'
  c.fillRect(0, h * .9, w, h * .1)
  for (let x = 0; x < w; x += 18) c.fillRect(x, h * .9, 9, h * .1)
  c.lineWidth = 6
  c.strokeStyle = '#e3b04f'
  c.strokeRect(14, 14, w - 28, h * .86 - 14)
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + i * 2 * Math.PI / 5
    c.beginPath()
    c.arc(w / 2 + Math.cos(a) * w * .07, h * .12 - Math.sin(a) * w * .07, w * .065, 0, Math.PI * 2)
    c.fillStyle = '#f3cf6e'
    c.fill()
  }
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillStyle = '#fff3d6'
  fitFont(c, 'OnTop', h * .07, w * .8, 900)
  c.fillText('OnTop', w / 2, h * .25)
  for (const [text, y] of [['공개 추첨', .38], ['행사', .5]] as const) {
    fitFont(c, text, h * .09, w * .82, 900)
    c.fillText(text, w / 2, h * y)
  }
  c.save()
  c.translate(w / 2, h * .7)
  c.rotate(-.2)
  roundRect(c, -w * .26, -h * .06, w * .52, h * .12, 10)
  c.fillStyle = '#f3cf6e'
  c.fill()
  c.fillStyle = '#b8312b'
  c.beginPath()
  c.arc(0, 0, h * .025, 0, Math.PI * 2)
  c.fill()
  c.restore()
}

/** 꺼진 호박색 유리 → 주황 필라멘트 → 따뜻한 흰빛 */
const OFF = new Color('#5e3a1a'), WARM = new Color('#f0a53c'), ON = new Color('#fff7df'), GLOW = new Color('#ffb648')
const fract = (v: number) => ((v % 1) + 1) % 1

/**
 * 전구 밝기(0~1). 회전 관련 패턴은 롤러 위치·회전 시간으로만 계산하므로 일시정지하면 그대로 멈춘다.
 * 시작 0.8초 동안 왼쪽부터 순차 점등, 회전 중 추격 점멸, 당첨 시 이름 창 중심에서 바깥으로 점등 후 깜빡임.
 */
function bulbLevel(b: Bulb, f: ReelFrame, clock: number) {
  switch (f.mode) {
    case 'idle': return .38 + .14 * Math.sin(clock * 1.6 + b.seq * 9)
    case 'spin': case 'paused': case 'landing': {
      if (f.spinMs < SPIN.upMs) return b.seq <= f.spinMs / SPIN.upMs ? 1 : .12
      const level = fract(b.seq * 14 - f.base * .5) < .38 ? 1 : .3
      return f.mode === 'paused' ? level * .7 : level
    }
    case 'landed': {
      if (f.result === null) return .42
      const first = f.place === 1, t = f.sinceLanding
      if (b.dist > t / (first ? 380 : 480)) return .3
      if (f.highlight <= 0) return .82
      // 닉네임 창 테두리 전구는 강조 내내 켜 두고, 바깥 전구만 깜빡인다.
      if (b.dist < .25) return 1
      return Math.floor(t / (first ? 110 : 150) + (first ? b.seq * 4 : 0)) % 2 ? .62 : 1
    }
    default: return fract(b.seq * 6 - clock * 1.4) < .5 ? 1 : .45
  }
}

/**
 * 켜진 전구: 밝기에 따라 색이 바뀌는 유리알과, 카메라를 향하는 작은 빛번짐 판.
 * 실제 광원을 늘리지 않고(공원 조명 예산 유지) 가산 혼합 판으로만 빛을 표현한다.
 */
function Bulbs({ scene }: { scene: RefObject<LiveScene | null> }) {
  const cores = useRef<InstancedMesh>(null), glows = useRef<InstancedMesh>(null), root = useRef<Group>(null)
  const bulbs = MACHINE_ART.bulbs
  const assets = useMemo(() => ({ sphere: new SphereGeometry(1, 10, 6), plane: new PlaneGeometry(1, 1), spark: glowTexture('spark') }), [])
  const temp = useMemo(() => ({ color: new Color(), matrix: new Matrix4(), q: new Quaternion(), parent: new Quaternion(),
    eye: new Vector3(), at: new Vector3(), scale: new Vector3() }), [])
  useLayoutEffect(() => {
    const m = cores.current!
    bulbs.forEach((b, i) => {
      m.setMatrixAt(i, temp.matrix.makeScale(b.r, b.r, b.r).setPosition(...b.p))
      m.setColorAt(i, OFF)
      glows.current!.setColorAt(i, temp.color.setRGB(0, 0, 0))
    })
    m.instanceMatrix.needsUpdate = true
    return () => { assets.sphere.dispose(); assets.plane.dispose(); assets.spark.dispose() }
  }, [bulbs, assets, temp])
  useFrame(({ camera }) => {
    const live = scene.current, core = cores.current, glow = glows.current, group = root.current
    if (!live || !core || !glow || !group) return
    // 빛번짐 판은 카메라를 향하고, 전구 뒤 판넬에 잘리지 않도록 카메라 쪽으로 조금 띄운다.
    group.getWorldQuaternion(temp.parent).invert()
    temp.q.copy(camera.quaternion).premultiply(temp.parent)
    temp.eye.copy(camera.position)
    group.worldToLocal(temp.eye)
    bulbs.forEach((b, i) => {
      const level = bulbLevel(b, live.frame, live.clock)
      core.setColorAt(i, level < .5 ? temp.color.lerpColors(OFF, WARM, level * 2) : temp.color.lerpColors(WARM, ON, level * 2 - 1))
      glow.setColorAt(i, temp.color.copy(GLOW).multiplyScalar(Math.max(0, level - .25) ** 1.5 * 1.3))
      temp.at.set(...b.p)
      temp.at.addScaledVector(temp.scale.subVectors(temp.eye, temp.at).normalize(), b.r * 2.2)
      const size = b.r * 7.5
      glow.setMatrixAt(i, temp.matrix.compose(temp.at, temp.q, temp.scale.set(size, size, size)))
    })
    core.instanceColor!.needsUpdate = true
    glow.instanceColor!.needsUpdate = true
    glow.instanceMatrix.needsUpdate = true
  })
  return <group ref={root}>
    <instancedMesh ref={cores} args={[assets.sphere, undefined, bulbs.length]} name="raffle-live-bulbs">
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
    <instancedMesh ref={glows} args={[assets.plane, undefined, bulbs.length]} name="raffle-live-bulb-glow" frustumCulled={false} renderOrder={2}>
      <meshBasicMaterial map={assets.spark} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  </group>
}

/**
 * 공개 추첨 무대. 서버 상태(useRaffleLive)만 읽어 연출하며 당첨자를 정하지 않는다.
 * 충돌체가 없으므로 공원에 둘 때는 통행로가 아닌 빈 자리에 배치해야 한다.
 */
export function RaffleLiveMachine({ position = [0, 0, 0], yaw = 0 }: { position?: XYZ; yaw?: number }) {
  const scene = useRef<LiveScene | null>(null)
  const director = useMemo(() => new ReelDirector(), [])
  const cache = useRef<{ status: unknown; exclude: ReadonlySet<string> }>({ status: undefined, exclude: new Set() })
  const wheels = useRef<(Group | null)[]>([])
  const lantern = useRef<EmissiveMaterial | null>(null), frameGlow = useRef<EmissiveMaterial | null>(null)
  const halo = useRef<MeshBasicMaterial>(null), floor = useRef<MeshBasicMaterial>(null), boardHalo = useRef<MeshBasicMaterial>(null)
  const textures = useMemo(() => ({ halo: glowTexture('halo'), disc: glowTexture('disc') }), [])
  useEffect(() => () => { textures.halo.dispose(); textures.disc.dispose() }, [textures])
  const sign = useCanvasPanel(1104, 240, drawSign)
  const banner = useCanvasPanel(368, 720, drawBanner)

  // 다른 부품보다 먼저 이번 프레임의 연출 상태를 계산한다.
  useFrame(({ clock }) => {
    const state = useRaffleLive.getState(), status = state.status
    if (status !== cache.current.status) cache.current = { status, exclude: status ? revealedBefore(status) : new Set() }
    const now = Date.now()
    const slotKey = status ? `${status.liveEventId}:${status.currentSlotIndex}` : 'none'
    const elapsed = phaseElapsed(state, now)
    const frame = director.update({
      phase: status?.phase ?? null, slotKey, place: currentPlace(status),
      seed: status ? status.liveEventId * 1000 + (status.currentSlotIndex ?? 0) : 0,
      candidates: state.candidates, exclude: cache.current.exclude, result: currentResult(status),
      spinElapsedMs: status?.spinElapsedMs ?? 0, phaseElapsedMs: elapsed,
    })
    const live = scene.current ??= { director, frame, status, cells: DEFAULT_CELLS, headline: headline(status, frame),
      burst: null, clock: 0 }
    live.status = status
    live.frame = frame
    live.clock = clock.elapsedTime
    live.cells = status ? boardCells(status, frame.filled) : DEFAULT_CELLS
    live.headline = headline(status, frame)
    live.burst = frame.mode === 'landed' && frame.result
      ? { key: `${slotKey}:${status!.phaseStartedAt}`, ageMs: frame.sinceLanding, kind: frame.place === 1 ? 'first' : 'winner' }
      : status?.phase === 'COMPLETED' ? { key: `complete:${status.liveEventId}:${status.version}`, ageMs: elapsed, kind: 'complete' }
        : null

    for (const wheel of wheels.current) if (wheel) wheel.rotation.x = -frame.base * .35
    const t = live.clock, first = frame.place === 1, winner = frame.mode === 'landed' && frame.result !== null
    if (lantern.current) lantern.current.emissiveIntensity = frame.mode === 'idle' ? .7
      : winner ? 1 + frame.highlight * (first ? 2 : 1.4) : frame.mode === 'complete' ? 1.3 + .3 * Math.sin(t * 3) : .95
    // 닉네임 창 금색 테두리: 평소엔 은은하게, 당첨 순간 가장 밝게(1등은 더 강하게)
    if (frameGlow.current) frameGlow.current.emissiveIntensity = winner ? .55 + frame.highlight * (first ? 2.4 : 1.7)
      : frame.mode === 'complete' ? .8 + .3 * Math.sin(t * 3) : frame.mode === 'spin' || frame.mode === 'landing' ? .35 : .2
    if (halo.current) halo.current.opacity = winner ? .3 + frame.highlight * (first ? 1 : .75)
      : frame.mode === 'landing' ? .18 : frame.mode === 'spin' ? .1 : frame.mode === 'complete' ? .4 + .2 * Math.sin(t * 3) : .05
    if (floor.current) floor.current.opacity = winner ? .2 + .45 * frame.highlight * (first ? 1.3 : 1)
      : frame.mode === 'complete' ? .35 : frame.mode === 'spin' || frame.mode === 'landing' ? .1 : 0
    if (boardHalo.current) boardHalo.current.opacity = status?.phase === 'COMPLETED' ? .35 + .25 * Math.sin(t * 3)
      : frame.fillFlash * .8
  }, -1)

  const { display, sign: signLayout, banner: bannerLayout, board, drum, wheelX, roofZ } = LIVE_LAYOUT
  return <group name="raffle-live-machine" position={position} rotation={[0, yaw, 0]}>
    <StaticArt art={MACHINE_ART.body} name="raffle-live-stage" />
    <group position={[0, 0, roofZ]}><StaticArt art={MACHINE_ART.roof} name="raffle-live-roof" /></group>
    <GlowArt art={MACHINE_ART.frame} finish="gold" name="raffle-live-display-frame" color="#ffb347" onMaterial={m => { frameGlow.current = m }} />
    <GlowArt art={MACHINE_ART.lanterns} name="raffle-live-lanterns" color="#ffbf5e" onMaterial={m => { lantern.current = m }} />
    <Bulbs scene={scene} />
    {[-1, 1].map((s, i) => <group key={s} ref={g => { wheels.current[i] = g }} position={[s * wheelX, drum.y, drum.z]}>
      <StaticArt art={MACHINE_ART.wheel} name="raffle-live-wheel" />
    </group>)}
    <NameDisplay scene={scene} />
    <HeaderPlaque scene={scene} />
    <PanelPlane panel={sign} size={signLayout.size} position={signLayout.position} name="raffle-live-sign" />
    <group position={bannerLayout.position} rotation={[0, bannerLayout.yaw, 0]}>
      <StaticArt art={MACHINE_ART.banner} name="raffle-live-banner-pole" />
      <PanelPlane panel={banner} size={bannerLayout.face.size} position={bannerLayout.face.position} name="raffle-live-banner" doubleSided />
    </group>
    <ResultBoard scene={scene} />
    <mesh name="raffle-live-display-halo" position={[display.position[0], display.position[1], display.position[2] + .1]} renderOrder={2}>
      <planeGeometry args={[4.8, 2.1]} />
      <meshBasicMaterial ref={halo} map={textures.halo} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
    <mesh name="raffle-live-stage-light" position={[0, .875, .5]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[4.2, 2.6]} />
      <meshBasicMaterial ref={floor} map={textures.disc} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
    <group position={board.position} rotation={[0, board.yaw, 0]}>
      <mesh name="raffle-live-board-halo" position={[0, board.face.position[1], board.face.position[2] + .06]} renderOrder={2}>
        <planeGeometry args={[3.5, 4.5]} />
        <meshBasicMaterial ref={boardHalo} map={textures.halo} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
    <FlyingCard scene={scene} />
    <WinnerBurst scene={scene} />
  </group>
}
