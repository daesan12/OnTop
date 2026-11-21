import { parkRuntime } from '../../park/runtime/runtime'

export type Difficulty = 'NORMAL' | 'HARD'
export type Position = { x: number; y: number }
export type Difference = { label: string; box: [number, number, number, number] }
export type Budget = { todayEarned: number; dailyCap: number }
type DuelScore = {
  joined: boolean
  ready: boolean
  startInMs: number | null
  opponentTotal: number
  opponentMatches: Difference[]
  outcome: 'WIN' | 'LOSS' | 'DRAW' | null
  end: 'COMPLETED' | 'LEFT' | 'DISCONNECTED' | null
}
export type Round = {
  id: string
  difficulty: Difficulty
  round: number
  scene: string
  name: string
  phase: 'WAITING' | 'PLAYING' | 'REVIEW'
  remainingMs: number
  cooldownMs: number
  total: number
  matched: Difference[]
  answers: Difference[]
  tap: 'HIT' | 'MISS' | 'WAIT' | 'ALREADY_FOUND' | null
  receipt: { calculated: number; granted: number; todayEarned: number } | null
  duel?: DuelScore
}
type DuelResponse = { board: Round; duel: DuelScore }
export type DuelRoom = { id: string; title: string; difficulty: Difficulty; players: number; capacity: number }

const root = '/api/v1/minigames/spot-difference'
export const width = 1448
export const height = 1086
export const rounds = 5
export const targetsPerRound = 6
export const roundSeconds = 60
export const cards = {
  NORMAL: { label: '보통', detail: '소품의 색과 모양 변화 위주', reward: 2, previewScene: 'fish-stall' },
  HARD: { label: '어려움', detail: '작은 소품의 모양과 무늬 변화 위주', reward: 3, previewScene: 'wardrobe-cyber' },
} satisfies Record<Difficulty, { label: string; detail: string; reward: number; previewScene: string }>

function post<T>(path: string, body: object): Promise<T> {
  return parkRuntime.requestJSON(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as Promise<T>
}

function duelRound({ board, duel }: DuelResponse): Round {
  return { ...board, duel }
}

export const spotDifference = {
  status: (signal: AbortSignal) => parkRuntime.requestJSON(root + '/status', { signal }) as Promise<Budget>,
  start: (difficulty: Difficulty, requestId: string) => post<Round>(root + '/runs', { difficulty, requestId }),
  act: (round: Pick<Round, 'id' | 'round'>, type: 'READY' | 'TAP' | 'SYNC' | 'NEXT', point?: Position) =>
    post<Round>(`${root}/runs/${round.id}/actions`, { type, round: round.round, ...point }),
  rooms: (signal: AbortSignal) => parkRuntime.requestJSON(root + '/duels', { signal }) as Promise<DuelRoom[]>,
  createDuel: (difficulty: Difficulty, title?: string) => post<DuelResponse>(root + '/duels', { difficulty, title }).then(duelRound),
  joinDuel: (code: string) => post<DuelResponse>(`${root}/duels/${code.toLowerCase()}/join`, {}).then(duelRound),
  currentDuel: async (signal: AbortSignal) => {
    const { match } = await parkRuntime.requestJSON(root + '/duels/current', { signal }) as {
      match: DuelResponse | null
    }
    return match && duelRound(match)
  },
  actDuel: (round: Pick<Round, 'id' | 'round'>, type: 'READY' | 'TAP' | 'SYNC' | 'LEAVE',
    point?: Position, actionId?: string) =>
    post<DuelResponse>(`${root}/duels/${round.id}/actions`, { type, round: round.round, ...point, actionId }).then(duelRound),
}
