import { useFrame } from '@react-three/fiber'
import type { RefObject } from 'react'
import { LIVE_LAYOUT } from './machineArt'
import { fitFont, laurel, PanelPlane, roundRect, useCanvasPanel } from './parts'
import { EMPTY_LABEL, type LiveScene, type ReelDirector, type ReelFrame } from './reel'

const DISPLAY_W = 960, DISPLAY_H = 288
/** 롤러 한 칸이 차지하는 각도(rad). 가운데 칸 위아래로 이전·다음 칸이 기울어 보인다. */
const ROW_ANGLE = .62

/** 위아래 칸 → 가운데 칸 글자색 */
const DIM: [number, number, number] = [150, 128, 104], INK: [number, number, number] = [36, 19, 10]
const ink = (focus: number) => `rgb(${DIM.map((v, i) => Math.round(v + (INK[i]! - v) * focus)).join(',')})`

/**
 * 가로로 누운 원통 롤러를 정면에서 본 모습. 가운데 칸(밝은 창)만 크고 진하게, 위아래 칸은 작고 흐리게
 * 그려 깊이감을 주고, 원통 각도에 따라 세로로 눌린다. 빠를 때는 잔상이 남는다.
 * 글자 크기는 닉네임 길이와 관계없이 창 폭에 맞춘다. 위치 계산(감속·정지·반동)은 reel.ts 그대로다.
 */
function drawDisplay(c: CanvasRenderingContext2D, w: number, h: number, director: ReelDirector, f: ReelFrame, connected: boolean) {
  const drum = c.createLinearGradient(0, 0, 0, h)
  drum.addColorStop(0, '#a87838')
  drum.addColorStop(.2, '#ead6ad')
  drum.addColorStop(.5, '#f8eedb')
  drum.addColorStop(.8, '#ead6ad')
  drum.addColorStop(1, '#a87838')
  c.fillStyle = drum
  c.fillRect(0, 0, w, h)
  const cy = h / 2, radius = h * .62, band = h * .24
  const rolling = f.mode !== 'idle' && f.mode !== 'complete'
  // 가운데 선택 창: 가장 밝은 띠와 금색 기준선
  c.fillStyle = '#fffdf6'
  c.fillRect(0, cy - band, w, band * 2)
  const winner = f.mode === 'landed' && f.result !== null
  if (winner) {
    const glow = c.createRadialGradient(w / 2, cy, h * .08, w / 2, cy, w * .5)
    glow.addColorStop(0, `rgba(255, 214, 110, ${.35 + .45 * f.highlight})`)
    glow.addColorStop(1, 'rgba(255, 214, 110, 0)')
    c.fillStyle = glow
    c.fillRect(0, 0, w, h)
  }
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  if (!rolling) {
    const text = !connected ? '연결 중…' : f.mode === 'idle' ? '추첨 대기 중' : '추첨 완료!'
    fitFont(c, text, h * (f.mode === 'idle' ? .3 : .4), w * .8)
    c.fillStyle = f.mode === 'idle' ? '#5a3a1e' : '#a52a1a'
    c.fillText(text, w / 2, cy)
  } else {
    // 칸 사이 홈
    const base = Math.floor(f.position)
    c.lineWidth = 3
    for (let i = base - 2; i <= base + 3; i++) {
      const theta = (i + .5 - f.position) * ROW_ANGLE
      if (Math.abs(theta) > 1.5) continue
      c.strokeStyle = `rgba(110, 70, 30, ${.35 * Math.cos(theta)})`
      const y = cy + Math.sin(theta) * radius
      c.beginPath()
      c.moveTo(60, y)
      c.lineTo(w - 60, y)
      c.stroke()
    }
    const trail = f.speed > 4 ? Math.min(30, f.speed * 1.7) : 0
    // 멈춘 뒤에는 위아래 칸이 사라지며 당첨자 칸만 남는다.
    const settle = f.mode === 'landed' ? Math.min(1, f.sinceLanding / 380) : 0
    for (let i = base - 2; i <= base + 3; i++) {
      const rows = i - f.position, theta = rows * ROW_ANGLE
      if (Math.abs(theta) > 1.3) continue
      const isResult = f.mode === 'landed' && f.target === i
      if (f.mode === 'landed' && !isResult && settle >= 1) continue
      const squash = Math.cos(theta)
      // 1: 가운데 창에 정렬된 칸, 0: 한 칸 이상 떨어진 칸
      const focus = Math.max(0, 1 - Math.abs(rows))
      const label = director.label(i)
      const empty = label === EMPTY_LABEL
      const pop = isResult && !empty ? Math.min(1, f.sinceLanding / 260) * (f.place === 1 ? .28 : .16) : 0
      fitFont(c, label, h * (.2 + .15 * focus) * (1 + pop), w * (.6 + .28 * focus))
      c.save()
      c.translate(w / 2, cy + Math.sin(theta) * radius)
      c.scale(1, squash)
      const color = empty ? '#857a6c' : isResult ? '#8a1d12' : ink(focus)
      c.fillStyle = color
      if (trail) {
        for (let g = 1; g <= 3; g++) {
          c.globalAlpha = .14 * squash / g
          c.fillText(label, 0, g * trail / 3)
        }
      }
      c.globalAlpha = (.35 + .65 * focus) * squash * (isResult ? 1 : 1 - settle)
      if (isResult && !empty) {
        // 금빛 번짐을 먼저 깔고, 그 위에 선명한 글자를 다시 쓴다.
        c.shadowColor = 'rgba(255, 186, 50, .95)'
        c.shadowBlur = 10 + 28 * f.highlight
        c.fillText(label, 0, 0)
        c.shadowBlur = 0
      }
      c.fillText(label, 0, 0)
      c.restore()
    }
  }
  // 원통 곡면 음영: 위아래로 갈수록 어둡게
  const shade = c.createLinearGradient(0, 0, 0, h)
  shade.addColorStop(0, 'rgba(52, 24, 6, .88)')
  shade.addColorStop(.28, 'rgba(52, 24, 6, .12)')
  shade.addColorStop(.38, 'rgba(52, 24, 6, 0)')
  shade.addColorStop(.62, 'rgba(52, 24, 6, 0)')
  shade.addColorStop(.72, 'rgba(52, 24, 6, .12)')
  shade.addColorStop(1, 'rgba(52, 24, 6, .88)')
  c.fillStyle = shade
  c.fillRect(0, 0, w, h)
  if (rolling) {
    c.fillStyle = '#d9a441'
    c.fillRect(0, cy - band - 2, w, 3)
    c.fillRect(0, cy + band - 1, w, 3)
    for (const s of [-1, 1]) {
      const x = s < 0 ? 6 : w - 6
      c.beginPath()
      c.moveTo(x, cy - 30)
      c.lineTo(x - s * 40, cy)
      c.lineTo(x, cy + 30)
      c.closePath()
      c.fill()
    }
  }
  if (f.mode === 'paused') {
    // 가운데 닉네임은 가리지 않고, 오른쪽 위에 멈춤 표시만 둔다.
    c.fillStyle = 'rgba(40, 20, 10, .18)'
    c.fillRect(0, 0, w, h)
    roundRect(c, w * .76, h * .05, w * .2, h * .17, h * .085)
    c.fillStyle = '#6d2a18'
    c.fill()
    fitFont(c, '잠시 멈춤', h * .1, w * .17)
    c.fillStyle = '#fff3d6'
    c.fillText('잠시 멈춤', w * .86, h * .135)
  }
  if (winner) {
    const blink = f.highlight > 0 && Math.floor(f.sinceLanding / (f.place === 1 ? 110 : 160)) % 2 ? .45 : 1
    c.lineWidth = 18
    c.strokeStyle = `rgba(255, 196, 60, ${f.highlight > 0 ? blink : .7})`
    c.strokeRect(9, 9, w - 18, h - 18)
  }
}

/** 가운데 대형 닉네임 롤러. 고속 회전 중에는 초당 30회까지만 다시 그린다. */
export function NameDisplay({ scene }: { scene: RefObject<LiveScene | null> }) {
  const { position, size } = LIVE_LAYOUT.display
  const panel = useCanvasPanel(DISPLAY_W, DISPLAY_H, undefined, .62)
  useFrame(() => {
    const live = scene.current
    if (!live) return
    const { frame: f, director } = live
    const now = performance.now()
    const key = `${f.mode}|${f.position.toFixed(4)}|${f.highlight.toFixed(2)}|${director.label(Math.round(f.position))}|${live.status ? 1 : 0}`
    if (key === panel.key || f.speed > 9 && now - panel.drawnAt < 32) return
    panel.key = key
    panel.drawnAt = now
    drawDisplay(panel.context, DISPLAY_W, DISPLAY_H, director, f, live.status !== null)
    panel.texture.needsUpdate = true
  })
  return <PanelPlane panel={panel} size={size} position={position} name="raffle-live-name-display" />
}

const PLAQUE_W = 1024, PLAQUE_H = 190

function drawPlaque(c: CanvasRenderingContext2D, w: number, h: number, title: string, sub: string, glow: number) {
  const bg = c.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, glow ? '#7a3417' : '#5e2b18')
  bg.addColorStop(1, '#3a190e')
  c.fillStyle = bg
  c.fillRect(0, 0, w, h)
  roundRect(c, 10, 10, w - 20, h - 20, 26)
  c.lineWidth = 7 + glow * 5
  c.strokeStyle = glow ? '#ffd56a' : '#d9a441'
  c.stroke()
  laurel(c, w * .06, h / 2, h * .42, '#e3b04f')
  laurel(c, w * .94, h / 2, h * .42, '#e3b04f', true)
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  fitFont(c, title, h * .4, w * .74)
  c.fillStyle = '#fff3d6'
  if (glow) {
    c.shadowColor = 'rgba(255, 200, 80, .95)'
    c.shadowBlur = 26 * glow
  }
  c.fillText(title, w / 2, sub ? h * .42 : h / 2)
  c.shadowBlur = 0
  if (sub) {
    fitFont(c, sub, h * .19, w * .6, 700)
    c.fillStyle = '#f1c46b'
    c.fillText(sub, w / 2, h * .79)
  }
}

/** 닉네임 창 위 현판. 진행 단계·등수·강조 단계가 바뀔 때만 다시 그린다. */
export function HeaderPlaque({ scene }: { scene: RefObject<LiveScene | null> }) {
  const { position, size } = LIVE_LAYOUT.plaque
  const panel = useCanvasPanel(PLAQUE_W, PLAQUE_H)
  useFrame(() => {
    const live = scene.current
    if (!live) return
    const { title, sub } = live.headline
    const glow = Math.ceil(live.frame.highlight * 4) / 4
    const key = `${title}|${sub}|${glow}`
    if (key === panel.key) return
    panel.key = key
    drawPlaque(panel.context, PLAQUE_W, PLAQUE_H, title, sub, glow)
    panel.texture.needsUpdate = true
  })
  return <PanelPlane panel={panel} size={size} position={position} name="raffle-live-plaque" />
}
