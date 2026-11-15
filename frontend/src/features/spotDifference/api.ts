import { parkRuntime } from '../../park/runtime/runtime'

export type Difficulty = 'NORMAL' | 'HARD'
export type Position = { x: number; y: number }
export type Difference = { label: string; box: [number, number, number, number] }
export type Budget = { todayEarned: number; dailyCap: number }
export type Round = {
  id: string
  difficulty: Difficulty
  round: number
  scene: string
  name: string
  phase: 'WAITING' | 'PLAYING' | 'REVIEW'
  remainingMs: number
  total: number
  matched: Difference[]
  answers: Difference[]
  tap: 'HIT' | 'MISS' | 'WAIT' | 'ALREADY_FOUND' | null
  receipt: { calculated: number; granted: number; todayEarned: number } | null
}

const root = '/api/v1/minigames/spot-difference'
export const width = 1448
export const height = 1086
export const rounds = 6
export const targetsPerRound = 6
export const roundSeconds = 60
export const cards = {
  NORMAL: { label: '보통', detail: '소품의 색과 모양', reward: 2 },
  HARD: { label: '어려움', detail: '스킨의 무늬와 작은 장식', reward: 3 },
} satisfies Record<Difficulty, { label: string; detail: string; reward: number }>

function post(path: string, body: object): Promise<Round> {
  return parkRuntime.requestJSON(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as Promise<Round>
}

export const spotDifference = {
  status: (signal: AbortSignal) => parkRuntime.requestJSON(root + '/status', { signal }) as Promise<Budget>,
  start: (difficulty: Difficulty, requestId: string) => post(root + '/runs', { difficulty, requestId }),
  act: (round: Round, type: 'READY' | 'TAP' | 'SYNC' | 'NEXT', point?: Position) =>
    post(`${root}/runs/${round.id}/actions`, { type, round: round.round, ...point }),
}
