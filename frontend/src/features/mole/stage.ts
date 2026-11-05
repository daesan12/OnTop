import cabinet from './assets/cabinet.webp'
import gold from './assets/gold.webp'
import hedgehog from './assets/hedgehog.webp'
import helmet from './assets/helmet.webp'
import hole from './assets/hole.webp'
import mallet from './assets/mallet.webp'
import mole from './assets/mole.webp'
import type { MoleKind } from './protocol'

/** Gemini로 만든 낮 공원 게임기 그림(1920×1072, 간판은 정면·판은 완만하게 기울어 보임)과 소스. 위치는 모두 배경 그림의 픽셀 좌표를 백분율로 바꿔 쓴다. */
export const ART = { cabinet, hole, mallet }
export const SPRITES: Record<MoleKind, string> = { NORMAL: mole, GOLD: gold, RAPID: helmet, DECOY: hedgehog }
export const STAGE = { width: 1920, height: 1072 } as const

const HOLE_ASPECT = 308 / 420
/**
 * 구멍 6개(S D F · J K L)를 한 줄 아치로 놓는다. [가운데 x, 가운데 y, 너비].
 * 판 윗면은 y 650~850(앞쪽 x 345~1575)이라 가운데 구멍을 조금 뒤로 보낸다. F와 J 사이는 손이 갈리는 곳이라 조금 더 벌린다.
 */
const ARCH = [[476, 795, 180], [664, 770, 172], [852, 752, 165], [1068, 752, 165], [1256, 770, 172], [1444, 795, 180]] as const
/** 구멍 그림은 45도에서 본 모양이라, 판이 완만하게 보이는 이 배경에서는 세로로 조금 눌러 쓴다. */
const FLATTEN = 0.8

const pct = (value: number, of: number) => `${(value / of * 100).toFixed(3)}%`

export interface Box { left: string; top: string; width: string; height: string }

function box(x: number, y: number, width: number, height: number): Box {
  return { left: pct(x, STAGE.width), top: pct(y, STAGE.height), width: pct(width, STAGE.width), height: pct(height, STAGE.height) }
}

/** 구멍 0~5의 자리. 뒤쪽(가운데) 구멍은 조금 작고 납작하게 보인다. */
export const HOLES: Box[] = ARCH.map(([x, y, width]) => {
  const height = width * HOLE_ASPECT * FLATTEN * (1 - (795 - y) / 43 * 0.05)
  return box(x - width / 2, y - height / 2, width, height)
})

/** LED 창 세 개(점수 · 시간 · 콤보)와 그 위 이름표, 남색 띠 아래 구간 막대, 맨 아래 안내 띠. */
export const LEDS: Box[] = [682, 878, 1074].map(x => box(x + 4, 463, 155, 97))
export const LED_LABELS: Box[] = [682, 878, 1074].map(x => box(x, 412, 163, 40))
export const PHASES: Box = box(682, 578, 554, 26)
export const BASE: Box = box(250, 1008, 1420, 56)
/** 기절 안내: 판 뒤쪽 가운데. */
export const STUN: Box = box(760, 640, 400, 60)
