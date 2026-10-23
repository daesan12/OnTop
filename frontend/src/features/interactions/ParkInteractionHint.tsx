import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { useBenchState } from './benchState'
import { benchService } from './benchService'
import { getParkInteraction, interactWithPark, type ParkInteraction } from './parkInteraction'
import { standBench } from './benchController'
import './interactions.css'

export function ParkInteractionHint() {
  const { benchId, status } = useSession(useShallow(s => ({ benchId: s.benchId, status: s.status })))
  const { pending, error } = useBenchState(useShallow(s => ({ pending: s.pending, error: s.error })))
  const [target, setTarget] = useState<ParkInteraction | null>(null)
  useEffect(() => {
    const sample = () => {
      const next = getParkInteraction()
      setTarget(old => old?.id === next?.id && old?.seat === next?.seat && old?.occupied === next?.occupied
        && old?.available === next?.available ? old : next)
    }
    sample()
    const timer = setInterval(sample, 100)
    return () => clearInterval(timer)
  }, [])
  if (!target && !benchId && !pending && !error) return null
  return <aside className="park-runtime-panel park-interaction" aria-label="가까운 상호작용"
    data-target-id={benchId || target?.id}>
    {benchId ? <>
      <strong>벤치 이용 중 · {benchService.mode === 'mock' ? '목업' : '서버 연결 필요'}</strong>
      <button type="button" aria-label="벤치에서 일어나기" disabled={pending || status !== 'connected'}
        onClick={event => { void standBench(); event.currentTarget.blur() }}>일어나기 · WASD / 방향키</button>
      <small>목업 착석은 현재 탭의 표시만 변경합니다.</small>
    </> : target && <button type="button" aria-keyshortcuts="E"
      disabled={pending || target.occupied || !target.available}
      onClick={event => { interactWithPark(); event.currentTarget.blur() }}>
      <kbd>E</kbd> {target.occupied ? '벤치에 빈자리가 없어요'
        : target.available ? target.label : '벤치 서버 연결 필요'}
      {target.kind === 'bench' && target.available && ' · 목업'}
    </button>}
    {pending && <span role="status">벤치 이용 요청 확인 중…</span>}
    {error && <div role="alert">{error}<button type="button" onClick={() => useBenchState.setState({ error: '' })}>닫기</button></div>}
  </aside>
}
