import { getAuthSession } from '../../auth/authFlow'

/**
 * 클라이언트 행동 로그(docs/behavior-log.md 3장 "클라이언트")를 모아 묶어서 보낸다.
 * 서버는 허용 목록 밖의 이벤트·속성을 버리므로 여기서 보내는 모양은 ClientBehaviorIntake와 같아야 한다.
 * 기록·전송 실패는 게임 진행을 막지 않는다. 예외를 밖으로 내보내지 않고 큐가 넘치면 오래된 것부터 버린다.
 */
export type GpuFamily = 'apple' | 'intel' | 'nvidia' | 'amd' | 'adreno' | 'mali' | 'powervr' | 'software' | 'other' | 'unknown'

export interface PerfReportProps {
  windowSec: number
  frames: number
  slowFrames: number
  fps: number
  p95Ms: number
  p99Ms: number
  drawCalls: number
  triangles: number
  dpr: number
  renderMode: 'continuous' | 'on-demand' | 'paused'
  quality: 'low' | 'medium' | 'high'
  device: 'desktop' | 'mobile'
  gpu: GpuFamily
}

export type TourStepName = 'flight' | 'walk' | 'greet' | 'map' | 'minigame' | 'table'
export interface OnboardingStepProps {
  flow: 'welcome_tour'
  action: 'start' | 'step_done' | 'collapse' | 'resume' | 'abandon' | 'finish'
  step?: TourStepName
  replay: boolean
  doneCount: number
  elapsedSec: number
}

export type ClientBehaviorEvent =
  | { type: 'PERF_REPORT'; props: PerfReportProps }
  | { type: 'ONBOARDING_STEP'; props: OnboardingStepProps }

type Queued = ClientBehaviorEvent & { at: number }

const ENDPOINT = '/api/v1/behavior-events'
/** 서버가 한 번에 받는 최대 건수. */
export const MAX_BATCH = 20
const MAX_QUEUE = 60
/** 서버는 15분 넘게 지난 이벤트를 버린다. 보내는 시간을 고려해 조금 일찍 버린다. */
const MAX_AGE_MS = 14 * 60_000
const RETRY_STATUS = new Set([401, 429, 500, 502, 503, 504])

const queue: Queued[] = []
let sending = false

export function logBehavior(event: ClientBehaviorEvent) {
  try {
    queue.push({ ...event, at: performance.now() })
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
  } catch {
    // 기록 실패는 무시한다.
  }
}

export const queuedBehaviorCount = () => queue.length

export function clearBehaviorQueue() {
  queue.length = 0
  sending = false
}

function requeue(batch: Queued[]) {
  queue.unshift(...batch)
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
}

/**
 * 모아 둔 것을 한 묶음 보낸다. 로그인 회원이 아니면 다른 회원 이름으로 남지 않도록 큐를 비운다.
 * 모든 요청을 keepalive로 보내 주기 전송 도중 탭을 닫아도 보내던 묶음이 끊기지 않는다.
 * leaving(탭 숨김·떠남)이면 응답을 기다리지 않고, 주기 전송이 보내는 중이어도 큐에 남은 것만 따로 보낸다.
 * 두 요청이 큐에서 꺼낸 묶음은 서로 겹치지 않으므로 같은 이벤트를 두 번 보내지 않는다.
 * 발생 시각은 서버가 ageMs로 정하므로 묶음이 도착하는 순서가 바뀌어도 이벤트 순서는 그대로다.
 */
export async function flushBehavior({ leaving = false }: { leaving?: boolean } = {}) {
  try {
    const session = getAuthSession()
    if (session?.status !== 'AUTHENTICATED') {
      queue.length = 0
      return
    }
    const now = performance.now()
    for (let i = queue.length - 1; i >= 0; i--) if (now - queue[i].at > MAX_AGE_MS) queue.splice(i, 1)
    if (!queue.length || sending && !leaving) return
    const batch = queue.splice(0, MAX_BATCH)
    const body = JSON.stringify({ events: batch.map(({ type, props, at }) =>
      ({ type, ageMs: Math.max(0, Math.round(now - at)), props })) })
    const request = fetch(ENDPOINT, {
      method: 'POST', keepalive: true, credentials: 'omit', cache: 'no-store',
      headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' }, body,
    })
    if (leaving) {
      request.catch(() => undefined)
      return
    }
    sending = true
    try {
      const response = await request
      // 토큰 갱신 중이거나 서버가 잠시 못 받으면 다음에 다시 보낸다. 형식 오류(400)는 다시 보내도 같으므로 버린다.
      if (RETRY_STATUS.has(response.status)) requeue(batch)
    } catch {
      requeue(batch)
    } finally {
      sending = false
    }
  } catch {
    // 전송 실패는 무시한다.
  }
}
