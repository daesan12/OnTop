import { useFrame } from '@react-three/fiber'
import type { RefObject } from 'react'
import { LIVE_LAYOUT, MACHINE_ART } from './machineArt'
import { fitFont, fitLines, laurel, PanelPlane, roundRect, StaticArt, useCanvasPanel } from './parts'
import type { LivePlace } from './protocol'
import type { BoardCell, LiveScene } from './reel'

/** 결과판 글자 해상도. 칸이 바뀔 때만 다시 그리므로 이름 창보다 크게 둔다. */
export const BOARD_W = 864, BOARD_H = 1193
const BADGE: Record<LivePlace, [string, string]> = { 1: ['#f6d066', '#c58b1c'], 2: ['#eef1f5', '#97a1ad'], 3: ['#ecb27a', '#a5612c'] }

interface Rect { x: number; y: number; w: number; h: number }
interface Group { place: LivePlace; top: number; height: number; cells: { cell: BoardCell; rect: Rect }[] }

/** 등수별 배치. 1등 1칸, 2등 2칸 한 줄, 3등은 2열. 서버 slots 순서와 관계없이 등수로 묶는다. */
function boardLayout(cells: readonly BoardCell[], w = BOARD_W, h = BOARD_H): Group[] {
  const groups = ([1, 2, 3] as const).map(place => ({ place, cells: cells.filter(cell => cell.place === place) }))
    .filter(g => g.cells.length)
  const rowsOf = (n: number, place: LivePlace) => place === 3 ? Math.ceil(n / 2) : 1
  const weights = groups.map(g => .45 + rowsOf(g.cells.length, g.place))
  const top = h * .16, bottom = h * .965, total = weights.reduce((a, b) => a + b, 0)
  let y = top
  return groups.map((group, gi) => {
    const height = (bottom - top) * weights[gi]! / total
    const cols = group.place === 3 ? 2 : group.cells.length, rows = rowsOf(group.cells.length, group.place)
    const x0 = w * .3, x1 = w * .95, gap = w * .02
    const cw = (x1 - x0 - gap * (cols - 1)) / cols
    const ch = Math.min((height - gap * (rows + 1)) / rows, h * .095)
    const blockTop = y + (height - (ch * rows + gap * (rows - 1))) / 2
    const laid = group.cells.map((cell, i) => ({ cell, rect: {
      x: x0 + (i % cols) * (cw + gap), y: blockTop + Math.floor(i / cols) * (ch + gap), w: cw, h: ch } }))
    const result = { place: group.place, top: y, height, cells: laid }
    y += height
    return result
  })
}

/** 결과판 칸의 캔버스 좌표. 닉네임 카드가 날아갈 목적지 계산에 쓴다. */
export function boardCellRect(cells: readonly BoardCell[], slotIndex: number) {
  for (const group of boardLayout(cells)) for (const { cell, rect } of group.cells) if (cell.slotIndex === slotIndex) return rect
  return null
}

function mix(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(',')})`
}

function drawBoard(c: CanvasRenderingContext2D, w: number, h: number, cells: readonly BoardCell[], completed: boolean, flash: number) {
  const bg = c.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#5f2d19')
  bg.addColorStop(1, '#40200f')
  c.fillStyle = bg
  c.fillRect(0, 0, w, h)
  roundRect(c, 12, 12, w - 24, h - 24, 26)
  c.lineWidth = completed ? 14 : 8
  c.strokeStyle = completed ? '#ffd56a' : '#d9a441'
  c.stroke()

  roundRect(c, w * .14, 30, w * .72, h * .095, 22)
  c.fillStyle = '#7a2620'
  c.fill()
  c.lineWidth = 5
  c.strokeStyle = '#e3b04f'
  c.stroke()
  laurel(c, w * .06, 30 + h * .0475, h * .05, '#e3b04f')
  laurel(c, w * .94, 30 + h * .0475, h * .05, '#e3b04f', true)
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  const title = completed ? '당첨을 축하합니다!' : '당첨 결과'
  fitFont(c, title, h * .052, w * .62)
  c.fillStyle = '#fff3d6'
  c.fillText(title, w / 2, 30 + h * .05)

  boardLayout(cells, w, h).forEach((group, gi) => {
    if (gi) {
      c.strokeStyle = 'rgba(227, 176, 79, .45)'
      c.lineWidth = 3
      c.beginPath()
      c.moveTo(w * .06, group.top)
      c.lineTo(w * .94, group.top)
      c.stroke()
    }
    const r = Math.min(group.height * .3, w * .085), bx = w * .15, by = group.top + group.height / 2 - r * .25
    const [light, dark] = BADGE[group.place]
    const badge = c.createLinearGradient(0, by - r, 0, by + r)
    badge.addColorStop(0, light)
    badge.addColorStop(1, dark)
    c.beginPath()
    c.arc(bx, by, r, 0, Math.PI * 2)
    c.fillStyle = badge
    c.fill()
    c.lineWidth = 4
    c.strokeStyle = '#3a1d10'
    c.stroke()
    laurel(c, bx - r * 1.32, by, r * .95, light)
    laurel(c, bx + r * 1.32, by, r * .95, light, true)
    fitFont(c, `${group.place}등`, r * .9, r * 1.7)
    c.fillStyle = '#3a1d10'
    c.fillText(`${group.place}등`, bx, by + r * .04)
    fitFont(c, `(${group.cells.length}명)`, r * .5, r * 2.4, 700)
    c.fillStyle = '#f4dfb2'
    c.fillText(`(${group.cells.length}명)`, bx, by + r * 1.45)

    for (const { cell, rect } of group.cells) {
      roundRect(c, rect.x, rect.y, rect.w, rect.h, rect.h * .3)
      const fresh = cell.fresh ? flash : 0
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2 + 2
      if (cell.state === 'pending') {
        // 미발표: 어둡게 파인 빈 홈과 점선 테두리
        c.fillStyle = 'rgba(24, 9, 2, .45)'
        c.fill()
        c.setLineDash([10, 8])
        c.lineWidth = 3
        c.strokeStyle = 'rgba(214, 170, 96, .55)'
        c.stroke()
        c.setLineDash([])
        fitFont(c, '발표 전', rect.h * .3, rect.w * .8, 700)
        c.fillStyle = 'rgba(232, 204, 152, .62)'
        c.fillText('발표 전', cx, cy)
        continue
      }
      if (cell.state === 'empty') {
        c.fillStyle = '#c3b9aa'
        c.fill()
        fitFont(c, '당첨자 없음', rect.h * .34, rect.w * .84, 700)
        c.fillStyle = '#5c544b'
        c.fillText('당첨자 없음', cx, cy)
        continue
      }
      // 발표 완료: 밝은 아이보리 칸, 금색 테두리, 굵은 진한 글자. 막 반영된 칸은 금색으로 번쩍인다.
      c.fillStyle = fresh ? mix([255, 250, 238], [255, 204, 76], fresh) : '#fffaee'
      c.fill()
      c.lineWidth = fresh || completed ? 7 : 4
      c.strokeStyle = fresh || completed ? '#ffcf4a' : '#d9a441'
      c.stroke()
      const { lines, size } = fitLines(c, cell.nickname!, rect.h * .52, rect.w * .88, 900)
      c.fillStyle = '#24130a'
      lines.forEach((line, i) => c.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * size * 1.08))
    }
  })
}

/** 우측 결과판. 발표가 끝난 칸만 채우고, 발표 중인 칸은 강조·이동 연출이 끝난 뒤 채운다. */
export function ResultBoard({ scene }: { scene: RefObject<LiveScene | null> }) {
  const { position, yaw, face } = LIVE_LAYOUT.board
  const panel = useCanvasPanel(BOARD_W, BOARD_H, undefined, .6)
  useFrame(() => {
    const live = scene.current
    if (!live) return
    const completed = live.status?.phase === 'COMPLETED'
    const flash = Math.ceil(live.frame.fillFlash * 5) / 5
    const key = live.cells.map(c => `${c.place}${c.state[0]}${c.nickname ?? ''}${c.fresh ? flash : ''}`).join('|') + completed
    if (key === panel.key) return
    panel.key = key
    drawBoard(panel.context, BOARD_W, BOARD_H, live.cells, completed, flash)
    panel.texture.needsUpdate = true
  })
  return <group name="raffle-live-result-board" position={position} rotation={[0, yaw, 0]}>
    <StaticArt art={MACHINE_ART.board} name="raffle-live-board-stand" />
    <PanelPlane panel={panel} size={face.size} position={face.position} name="raffle-live-board-face" />
  </group>
}
