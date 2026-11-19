import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { Color, DoubleSide, Euler, InstancedMesh, Matrix4, Quaternion, Shape, ShapeGeometry, Vector3 } from 'three'
import { SIMPLE_MAP } from '../../world/art/mapRenderProfile'
import { LIVE_LAYOUT } from './machineArt'
import { seededRandom, type LiveScene } from './reel'

const CONFETTI = SIMPLE_MAP ? 90 : 180
const STARS = SIMPLE_MAP ? 20 : 40
const COLORS = ['#e8b43a', '#d63a2f', '#fff1c8', '#3f8f5a', '#4b78c4', '#f08c2e', '#f6d77f']
const GRAVITY = -5.2, DRAG = 1.3
/** 효과가 완전히 끝나는 시간(ms) */
const BURST_MS = 4600

interface Piece { p: Vector3; v: Vector3; r: Vector3; spin: Vector3; life: number; delay: number; size: number }

/** 직선 저항과 중력을 받는 낙하. 시간만으로 위치가 정해져 프레임이 떨어지거나 늦게 들어와도 같다. */
function place(piece: Piece, t: number, out: Vector3) {
  const e = 1 - Math.exp(-DRAG * t)
  out.set(piece.p.x + piece.v.x * e / DRAG, piece.p.y + piece.v.y * e / DRAG + GRAVITY / DRAG * (t - e / DRAG),
    piece.p.z + piece.v.z * e / DRAG)
  if (out.y < .03) out.y = .03
  return out
}

function starGeometry() {
  const shape = new Shape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? .42 : 1, a = Math.PI / 2 + i * Math.PI / 5
    if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  return new ShapeGeometry(shape)
}

function usePieces(count: number) {
  return useMemo<Piece[]>(() => Array.from({ length: count }, () => ({ p: new Vector3(), v: new Vector3(), r: new Vector3(),
    spin: new Vector3(), life: 0, delay: 0, size: 1 })), [count])
}

/** 당첨 순간·추첨 완료 때 퍼지는 꽃가루와 금색 별. 1등은 더 많이, 더 높이 퍼진다. */
export function WinnerBurst({ scene }: { scene: RefObject<LiveScene | null> }) {
  const confettiRef = useRef<InstancedMesh>(null)
  const starRef = useRef<InstancedMesh>(null)
  const confetti = usePieces(CONFETTI), stars = usePieces(STARS)
  const state = useRef({ key: '', visible: false })
  const temp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3(), at: new Vector3(), e: new Euler() }), [])
  const star = useMemo(starGeometry, [])

  useLayoutEffect(() => {
    const color = new Color()
    const m = confettiRef.current!
    for (let i = 0; i < CONFETTI; i++) {
      m.setColorAt(i, color.set(COLORS[i % COLORS.length]!))
      m.setMatrixAt(i, temp.m.makeScale(0, 0, 0))
    }
    m.instanceColor!.needsUpdate = true
    for (let i = 0; i < STARS; i++) starRef.current!.setMatrixAt(i, temp.m.makeScale(0, 0, 0))
    return () => star.dispose()
  }, [temp, star])

  useFrame(() => {
    const live = scene.current, a = confettiRef.current, b = starRef.current
    if (!live || !a || !b) return
    const burst = live.burst
    if (!burst || burst.ageMs >= BURST_MS) {
      if (state.current.visible) {
        for (let i = 0; i < CONFETTI; i++) a.setMatrixAt(i, temp.m.makeScale(0, 0, 0))
        for (let i = 0; i < STARS; i++) b.setMatrixAt(i, temp.m.makeScale(0, 0, 0))
        a.instanceMatrix.needsUpdate = b.instanceMatrix.needsUpdate = true
        state.current.visible = false
      }
      return
    }
    if (burst.key !== state.current.key) {
      state.current.key = burst.key
      const random = seededRandom([...burst.key].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261))
      const big = burst.kind !== 'winner', wide = burst.kind === 'complete'
      const [dx, dy, dz] = LIVE_LAYOUT.display.position, [sx, sy, sz] = LIVE_LAYOUT.sign.position
      const spawn = (piece: Piece, index: number, isStar: boolean) => {
        const fromSign = wide || big && index % 2 === 1
        piece.p.set((fromSign ? sx : dx) + (random() - .5) * (fromSign ? 4.4 : 2.8), (fromSign ? sy : dy) + (random() - .3) * .6,
          (fromSign ? sz : dz) + .35)
        piece.v.set((random() - .5) * (big ? 6.5 : 5), 2.4 + random() * (big ? 4.6 : 3.4), 1 + random() * 2.6)
        piece.r.set(random() * 6, random() * 6, random() * 6)
        piece.spin.set((random() - .5) * 12, (random() - .5) * 12, (random() - .5) * 12)
        piece.life = 2.4 + random() * 1.8
        piece.delay = isStar ? random() * .25 : random() * (big ? .5 : .2)
        piece.size = isStar ? .1 + random() * .08 : 1
      }
      // 1등·완료가 아니면 꽃가루 2/3와 별 절반만 쓴다.
      confetti.forEach((piece, i) => { spawn(piece, i, false); if (!big && i % 3 === 2) piece.life = 0 })
      stars.forEach((piece, i) => { spawn(piece, i, true); if (!big && i % 2) piece.life = 0 })
    }
    const age = burst.ageMs / 1000
    const draw = (mesh: InstancedMesh, pieces: Piece[]) => pieces.forEach((piece, i) => {
      const t = age - piece.delay
      if (t < 0 || t >= piece.life) return mesh.setMatrixAt(i, temp.m.makeScale(0, 0, 0))
      const fade = Math.min(1, (piece.life - t) * 2, t * 8)
      temp.e.set(piece.r.x + piece.spin.x * t, piece.r.y + piece.spin.y * t, piece.r.z + piece.spin.z * t)
      temp.s.setScalar(piece.size * fade)
      mesh.setMatrixAt(i, temp.m.compose(place(piece, t, temp.at), temp.q.setFromEuler(temp.e), temp.s))
    })
    draw(a, confetti)
    draw(b, stars)
    a.instanceMatrix.needsUpdate = b.instanceMatrix.needsUpdate = true
    state.current.visible = true
  })

  return <>
    <instancedMesh ref={confettiRef} args={[undefined, undefined, CONFETTI]} name="raffle-live-confetti" frustumCulled={false}>
      <planeGeometry args={[.11, .065]} />
      <meshBasicMaterial side={DoubleSide} toneMapped={false} />
    </instancedMesh>
    <instancedMesh ref={starRef} args={[star, undefined, STARS]} name="raffle-live-stars" frustumCulled={false}>
      <meshBasicMaterial color="#ffd257" side={DoubleSide} toneMapped={false} />
    </instancedMesh>
  </>
}
