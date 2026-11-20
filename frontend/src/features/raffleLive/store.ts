import { create } from 'zustand'
import { parseSnapshot, type LiveCandidate, type LiveStatus } from './protocol'

export interface RaffleLiveState {
  /** 마지막으로 반영한 서버 상태. 발표된 슬롯 결과만 들어 있다. */
  status: LiveStatus | null
  /** 연출용 응모자 목록. WS 방송에는 없으므로 REST로 받은 값을 유지한다. */
  candidates: readonly LiveCandidate[]
  /** 서버 시각 - 로컬 수신 시각(ms) */
  clockOffset: number
  /** 서버 상태를 반영한다. 같은 행사에서 버전이 오르지 않은 상태와 형식이 틀린 상태는 버린다. */
  accept(input: unknown, now?: number): boolean
  clear(): void
}

export const useRaffleLive = create<RaffleLiveState>((set, get) => ({
  status: null,
  candidates: [],
  clockOffset: 0,
  accept(input, now = Date.now()) {
    let parsed: ReturnType<typeof parseSnapshot>
    try { parsed = parseSnapshot(input) } catch { return false }
    const { status: current, candidates } = get()
    const sameEvent = current?.liveEventId === parsed.status.liveEventId
    if (sameEvent && parsed.status.version <= current!.version) return false
    set({
      status: parsed.status,
      candidates: parsed.candidates ?? (sameEvent ? candidates : []),
      clockOffset: Date.parse(parsed.status.serverTime) - now,
    })
    return true
  },
  clear() { set({ status: null, candidates: [], clockOffset: 0 }) },
}))

/** 현재 단계 시작 후 경과 시간. 서버 시각 기준이라 늦게 들어온 화면도 같은 지점부터 이어 간다. */
export function phaseElapsed(state: Pick<RaffleLiveState, 'status' | 'clockOffset'>, now = Date.now()) {
  if (!state.status) return 0
  return Math.max(0, now + state.clockOffset - Date.parse(state.status.phaseStartedAt))
}
