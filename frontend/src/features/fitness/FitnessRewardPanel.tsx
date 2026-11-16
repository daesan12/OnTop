import { useEffect, useState } from 'react'
import { parkRuntime } from '../../park/runtime/runtime'
import { useSession } from '../../network/worldClient'
import { useFacilityState } from '../facilities/state'
import { useWalletSettlement } from '../wallet/settlementRefresh'
import { FITNESS_REWARD_STATUS_PATH, fitnessRewardDate, fitnessRewardSeconds, parseFitnessRewardStatus, type FitnessRewardStatus } from './rewards'
import './fitnessRewards.css'

type Snapshot = { status: FitnessRewardStatus; at: number }
export function FitnessRewardView({ snapshot, now, error = '' }: {
  snapshot: Snapshot | null; now: number; error?: string
}) {
  const status = snapshot?.status
  const elapsed = snapshot ? Math.max(0, now - snapshot.at) : 0
  const current = status && fitnessRewardDate(status.serverNow + elapsed) === status.earningsDate
  const earned = current && status.enabled && !error ? status.todayEarned : null
  const seconds = current && status.enabled && !error ? fitnessRewardSeconds(status, elapsed) : null
  const detail = error || (status && !status.enabled ? '이 환경에서는 운동 보상을 지급하지 않아요.'
    : status && earned !== null && earned >= status.dailyCap ? '오늘 운동 보상 한도에 도달했어요.'
    : seconds === 0 ? '지급을 확인하고 있어요.' : seconds !== null ? '다음 지급까지 ' + seconds + '초' : '')
  return <section className="fitness-reward" aria-label="운동기구 수입" tabIndex={0} onKeyDown={event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) event.stopPropagation()
  }}>
    <div className="fitness-reward-total"><span>실제 1분당 5냥</span><strong>{earned === null ? '—' : earned}<small> / 500냥</small></strong></div>
    {detail && <p className="fitness-reward-caption">{detail}</p>}
  </section>
}

export function FitnessRewardPanel() {
  const owner = useSession(s => s.sessionId), channel = useSession(s => s.roomId)
  const leaseId = useFacilityState(s => s.occupancies[owner]?.leaseId ?? '')
  // 이용 식별자가 바뀌면 이전 기구의 타이머·오류·수입 알림을 함께 비운다.
  return <LiveFitnessReward key={`${owner}/${channel}/${leaseId}`} owner={owner} leaseId={leaseId} />
}
function LiveFitnessReward({ owner, leaseId }: { owner: string; leaseId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [error, setError] = useState('')
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const abort = new AbortController()
    let disposed = false, loading = false, refreshPending = false
    const load = async () => {
      if (disposed || document.hidden || !leaseId) return
      if (loading) { refreshPending = true; return }
      loading = true
      refreshPending = false
      try {
        const status = parseFitnessRewardStatus(await parkRuntime.requestJSON(FITNESS_REWARD_STATUS_PATH, { signal: abort.signal }))
        if (disposed) return
        if (status.activeLeaseId !== leaseId) { setSnapshot(null); return }
        const at = performance.now()
        setSnapshot({ status, at }); setNow(at); setError('')
      } catch {
        if (!disposed) setError('운동 수입 확인 지연')
      } finally {
        loading = false
        // 조회 중 도착한 지급 알림은 합쳐서 한 번 더 확인한다.
        if (refreshPending && !disposed) void load()
      }
    }
    void load()
    const tick = setInterval(() => setNow(performance.now()), 1000)
    const poll = setInterval(() => void load(), 30_000)
    const stop = useWalletSettlement.subscribe((state, before) => {
      if (state.owner === owner && state.revision !== before.revision) void load()
    })
    const reconnected = useSession.subscribe((state, before) => {
      if (state.sessionId === owner && state.status === 'connected' && before.status !== 'connected') void load()
    })
    const visible = () => { if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', visible)
    return () => { disposed = true; abort.abort(); clearInterval(poll); clearInterval(tick); stop(); reconnected(); document.removeEventListener('visibilitychange', visible) }
  }, [owner, leaseId])
  return <FitnessRewardView snapshot={snapshot} now={now} error={error} />
}
