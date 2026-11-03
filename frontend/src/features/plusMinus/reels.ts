/** 정지 버튼 연출 계산. 결과는 서버가 정한 칸이며 여기서는 어디서 몇 칸 미끄러질지만 정한다. */
export const SPIN_STEP_MS = [55, 70, 55] as const
export const AUTO_STOP_MS = 5000

/** 회전 중인 릴의 현재 불빛 칸. 릴마다 시작 칸을 어긋나게 둬 세 릴이 같이 돌지 않게 한다. */
export function spinningCell(reel: number, cells: number, elapsed: number) {
  return (Math.floor(Math.max(0, elapsed) / SPIN_STEP_MS[reel]!) + reel * 5) % cells
}

/** 누른 순간의 칸에서 목표 칸까지 감속하며 미끄러진다. 너무 가까우면 한 바퀴 더 돌아 매번 다른 길이가 된다. */
export function landingTimeline(from: number, target: number, cells: number) {
  const distance = (target - from + cells) % cells
  const steps = distance >= Math.ceil(cells / 4) ? distance : distance + cells
  const times: number[] = [0]
  let at = 0
  for (let i = 1; i <= steps; i++) { at += 28 + 70 * (i / steps) ** 2; times.push(at) }
  return { from, steps, times, duration: at }
}

export function landingCell(timeline: ReturnType<typeof landingTimeline>, cells: number, elapsed: number) {
  const step = timeline.times.reduce((found, t, i) => t <= elapsed ? i : found, 0)
  return (timeline.from + step) % cells
}
