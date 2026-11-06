import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { avatars, useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { panelOwnsKeys } from '../../world/inputOwnership'
import { useBenchState } from './benchState'
import { benchService } from './benchService'
import { getParkInteraction, interactWithPark, type ParkInteraction } from './parkInteraction'
import './interactions.css'
import { useFitnessState } from '../fitness/state'
import { findFitness } from '../fitness/anchors'
import { useTelescopeState } from '../telescopes/state'
import { fitnessService } from '../fitness/service'
import { useFacilityState } from '../facilities/state'
import { telescopeService } from '../telescopes/service'
import { BenchSpectatorControls } from './BenchSpectatorControls'
import { useTableLobby } from '../tableLobby/state'
import { useGame } from '../../game/store'
import { FitnessRewardPanel } from '../fitness/FitnessRewardPanel'
import { CARRY_ESCAPE_PRESSES } from '../carry/escape'

export function ParkInteractionHint() {
  const { benchId, fitnessId } = useSession(useShallow(s => ({ benchId: s.benchId, fitnessId: s.fitnessId })))
  const { pending, error } = useBenchState(useShallow(s => ({ pending: s.pending, error: s.error })))
  const fitness = useFitnessState(useShallow(s => ({ pending: s.pending, error: s.error })))
  const telescopePending = useTelescopeState(s => s.pending)
  const actionPending = useSession(s => s.pending)
  const fitnessRewards = useFacilityState(s => s.options?.fitnessRewardsEnabled === true)
  const joiningTable = useTableLobby(s => !!s.joiningAnchorId)
  const entryNotice = useTableLobby(s => s.entryNotice)
  const omokWatching = useGame(s => s.game?.role === 'SPECTATOR' && !!s.game.omok && !!s.watchedGameId)
  const [target, setTarget] = useState<ParkInteraction | null>(null)
  const [carry, setCarry] = useState<import('../../network/protocol').CarryState | null>(null)
  useEffect(() => {
    const sample = () => {
      parkRuntime.setInteractionBusy?.(panelOwnsKeys())
      const next = getParkInteraction()
      const carrying = avatars.get(useSession.getState().sessionId)?.carry ?? null
      setCarry(old => old?.carryId === carrying?.carryId && old?.role === carrying?.role ? old : carrying)
      setTarget(old => old?.id === next?.id && old?.label === next?.label && old?.seat === next?.seat && old?.occupied === next?.occupied
        && old?.available === next?.available && old?.occupant === next?.occupant ? old : next)
    }
    sample()
    const timer = setInterval(sample, 100)
    return () => clearInterval(timer)
  }, [])
  if (!target && !carry && !benchId && !fitnessId && !pending && !fitness.pending && !telescopePending && !joiningTable && !error && !fitness.error) return null
  const station = findFitness(fitnessId)
  return <aside className="park-runtime-panel park-interaction" aria-label="가까운 상호작용"
    hidden={omokWatching}
    data-carry-role={carry?.role}
    data-target-id={fitnessId || target?.id || benchId} data-target-kind={target?.kind}
    data-fitness-id={fitnessId || (target?.kind === 'fitness' ? target.id : undefined)}>
    {fitnessId ? <>
      <strong>{station?.name} 이용 중{fitnessService.mode === 'mock' ? ' · 목업' : ''}</strong>
      <small>{station?.instruction}</small>
      {fitnessRewards && <FitnessRewardPanel />}
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
    {carry?.role === 'CARRIED' && <>
      <strong>다른 산책자가 나를 들고 있어요</strong>
      <span role="status" className="carry-escape-hint">
        <span className="carry-escape-hint__keys" aria-hidden="true">
          {Array.from({ length: CARRY_ESCAPE_PRESSES }, (_, index) =>
            <kbd key={index}>{index % 2 ? 'D' : 'A'}</kbd>)}
        </span>
        <span>A · D 번갈아 {CARRY_ESCAPE_PRESSES}회 눌러 내려오기</span>
        <small>A 또는 D부터 시작해요</small>
      </span>
    </>}
    {carry?.role === 'THROWN' && <span role="status">날아가는 중 · 착지하면 다시 움직일 수 있어요</span>}
    {carry?.role === 'CARRIER' && <button type="button" aria-keyshortcuts="Escape"
      disabled={actionPending} onClick={event => {
        void parkRuntime.releaseAvatar?.(carry.carryId); event.currentTarget.blur()
      }}><kbd>Esc</kbd> 내려놓기</button>}
    {target?.kind === 'table' && target.id === entryNotice?.anchorId
      && <span role="status">{entryNotice.text}</span>}
    {joiningTable && <span role="status">자리를 확인하고 있어요…</span>}
    {pending && <span role="status">벤치 이용 요청 확인 중…</span>}
    {fitness.pending && <span role="status">운동기구 이용 요청 확인 중…</span>}
    {telescopePending && <span role="status">망원경 이용 요청 확인 중…</span>}
    {error && <div role="alert">{error}<button type="button" onClick={() => useBenchState.setState({ error: '' })}>닫기</button></div>}
    {fitness.error && <div role="alert">{fitness.error}<button type="button" onClick={() => useFitnessState.setState({ error: '' })}>닫기</button></div>}
  </aside>
}
