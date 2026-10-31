import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { useBenchState } from './benchState'
import { benchService } from './benchService'
import { getParkInteraction, interactWithPark, type ParkInteraction } from './parkInteraction'
import './interactions.css'
import { useFitnessState } from '../fitness/state'
import { findFitness } from '../fitness/anchors'
import { useTelescopeState } from '../telescopes/state'
import { fitnessService } from '../fitness/service'
import { telescopeService } from '../telescopes/service'
import { BenchSpectatorControls } from './BenchSpectatorControls'
import { useTableLobby } from '../tableLobby/state'
import { useGame } from '../../game/store'
import { tableTermsLabel } from '../tableLobby/model'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'

export function ParkInteractionHint() {
  const runtime = useParkRuntime()
  const { benchId, fitnessId } = useSession(useShallow(s => ({ benchId: s.benchId, fitnessId: s.fitnessId })))
  const { pending, error } = useBenchState(useShallow(s => ({ pending: s.pending, error: s.error })))
  const fitness = useFitnessState(useShallow(s => ({ pending: s.pending, error: s.error })))
  const telescopePending = useTelescopeState(s => s.pending)
  const joiningTable = useTableLobby(s => !!s.joiningAnchorId)
  const omokWatching = useGame(s => s.game?.role === 'SPECTATOR' && !!s.game.omok && !!s.watchedGameId)
  const [target, setTarget] = useState<ParkInteraction | null>(null)
  const roomTerms = useSession(s => {
    if (target?.kind !== 'table') return null
    const binding = s.bindings.find(b => b.channelId === s.roomId && b.anchorId === target.id)
    const table = s.tables.find(t => t.tableId === binding?.tableId)
    return table && table.occupiedSeats > 0 ? tableTermsLabel(table) : null
  })
  useEffect(() => {
    const sample = () => {
      const next = getParkInteraction()
      setTarget(old => old?.id === next?.id && old?.label === next?.label && old?.seat === next?.seat && old?.occupied === next?.occupied
        && old?.available === next?.available && old?.occupant === next?.occupant ? old : next)
    }
    sample()
    const timer = setInterval(sample, 100)
    return () => clearInterval(timer)
  }, [])
  if (!target && !benchId && !fitnessId && !pending && !fitness.pending && !telescopePending && !joiningTable && !error && !fitness.error) return null
  const station = findFitness(fitnessId)
  return <aside className="park-runtime-panel park-interaction" aria-label="가까운 상호작용"
    hidden={omokWatching}
    data-target-id={fitnessId || target?.id || benchId} data-target-kind={target?.kind}
    data-fitness-id={fitnessId || (target?.kind === 'fitness' ? target.id : undefined)}>
    {fitnessId ? <>
      <strong>{station?.name} 이용 중{fitnessService.mode === 'mock' ? ' · 목업' : ''}</strong>
      <small>{station?.instruction}</small>
    </> : benchId ? <>
      <strong>벤치 이용 중{benchService.mode === 'mock' ? ' · 목업' : ''}</strong>
      <BenchSpectatorControls />
    </> : target && <button type="button" aria-keyshortcuts="E"
      disabled={pending || fitness.pending || telescopePending || joiningTable || target.occupied || !target.available}
      onClick={event => { interactWithPark(); event.currentTarget.blur() }}>
      <kbd>E</kbd> {target.occupied ? target.kind === 'fitness' || target.kind === 'telescope' ? `${target.occupant} 님이 사용 중 · ${target.label}` : '벤치에 빈자리가 없어요'
        : target.available ? target.label : target.kind === 'fitness' ? '운동기구 서버 연결 필요' : target.kind === 'telescope' ? '망원경 서버 연결 필요' : '벤치 서버 연결 필요'}
      {target.kind === 'bench' && target.available && benchService.mode === 'mock' && ' · 목업'}
      {target.kind === 'fitness' && target.available && fitnessService.mode === 'mock' && ' · 목업'}
      {target.kind === 'telescope' && target.available && telescopeService.mode === 'mock' && ' · 목업'}
    </button>}
    {!benchId && !fitnessId && target?.kind === 'table' && target.label === '테이블에 앉기' &&
      <button type="button" disabled={pending || fitness.pending || telescopePending || joiningTable || !target.available}
        onClick={event => { runtime.inspectTable(target.id); event.currentTarget.blur() }}>
        테이블 정보 · 관전
      </button>}
    {roomTerms && <small aria-label="참가할 방 설정">{roomTerms}</small>}
    {joiningTable && <span role="status">자리를 확인하고 있어요…</span>}
    {pending && <span role="status">벤치 이용 요청 확인 중…</span>}
    {fitness.pending && <span role="status">운동기구 이용 요청 확인 중…</span>}
    {telescopePending && <span role="status">망원경 이용 요청 확인 중…</span>}
    {error && <div role="alert">{error}<button type="button" onClick={() => useBenchState.setState({ error: '' })}>닫기</button></div>}
    {fitness.error && <div role="alert">{fitness.error}<button type="button" onClick={() => useFitnessState.setState({ error: '' })}>닫기</button></div>}
  </aside>
}
