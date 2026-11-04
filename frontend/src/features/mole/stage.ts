import cabinet from './assets/cabinet.webp'
import gold from './assets/gold.webp'
import hedgehog from './assets/hedgehog.webp'
import helmet from './assets/helmet.webp'
import hole from './assets/hole.webp'
import mallet from './assets/mallet.webp'
import mole from './assets/mole.webp'
import type { MoleKind } from './protocol'

/** Gemini로 만든 게임기 그림(1920×1072)과 소스. 위치는 모두 배경 그림의 픽셀 좌표를 백분율로 바꿔 쓴다. */
export const ART = { cabinet, hole, mallet }
export const SPRITES: Record<MoleKind, string> = { NORMAL: mole, GOLD: gold, RAPID: helmet, DECOY: hedgehog }
export const STAGE = { width: 1920, height: 1072 } as const

const HOLE_ASPECT = 308 / 420
/** 판 사다리꼴: 윗변 y 508(x 395~1525), 아랫변 y 975(x 95~1830). */
const FIELD = { top: 508, bottom: 975, topLeft: 395, topRight: 1525, bottomLeft: 95, bottomRight: 1830 }
const ROWS = [0.3, 0.73] as const
const COLUMNS = [0.14, 0.35, 0.56, 0.77] as const
/** 아랫줄은 구멍 간격의 절반만큼 오른쪽으로 민다. */
const STAGGER = 0.105
const HOLE_OF_ROW = 0.145

const pct = (value: number, of: number) => `${(value / of * 100).toFixed(3)}%`

export interface Box { left: string; top: string; width: string; height: string }

function box(x: number, y: number, width: number, height: number): Box {
  return { left: pct(x, STAGE.width), top: pct(y, STAGE.height), width: pct(width, STAGE.width), height: pct(height, STAGE.height) }
}

/** 구멍 0~7(Q W E R / U I O P)의 자리. 원근에 맞춰 아랫줄 구멍이 조금 더 크다. */
export const HOLES: Box[] = [0, 1].flatMap(row => COLUMNS.map(column => {
  const v = ROWS[row]!, y = FIELD.top + (FIELD.bottom - FIELD.top) * v
  const left = FIELD.topLeft + (FIELD.bottomLeft - FIELD.topLeft) * v, right = FIELD.topRight + (FIELD.bottomRight - FIELD.topRight) * v
  const u = column + (row === 1 ? STAGGER : 0), x = left + (right - left) * u
  // 판이 앞으로 기울어 있어 먼 윗줄 구멍은 조금 더 납작하게 보인다.
  const width = (right - left) * HOLE_OF_ROW, height = width * HOLE_ASPECT * (row === 0 ? 0.88 : 1)
  return box(x - width / 2, y - height / 2, width, height)
}))

/** LED 창 세 개(점수 · 시간 · 콤보)와 그 위 이름표, 아래 구간 막대, 맨 아래 주황 몸통. */
export const LEDS: Box[] = [485, 833, 1182].map(x => box(x + 10, 356, 234, 92))
export const LED_LABELS: Box[] = [485, 833, 1182].map(x => box(x, 314, 254, 30))
export const PHASES: Box = box(485, 466, 951, 18)
export const BASE: Box = box(150, 1000, 1620, 66)
