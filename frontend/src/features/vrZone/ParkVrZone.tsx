import { lazy, Suspense, useEffect } from 'react'
import { useStore } from 'zustand'
import { useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { parkVrZone } from './parkBridge'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { parkRuntime } from '../../park/runtime/runtime'
import { SKEWER_COOP_ENABLED } from '../skewer/coop/availability'
import { CoopEntryBoundary, CoopEntryStatus } from './CoopEntryStatus'
import './coopEntry.css'

const CoopHost = lazy(() => import('../skewer/coop/CoopHost'))

export function ParkVrZone() {
  const phase = useStore(parkVrZone.store, state => state.phase)
  const owner = useSession(state => `${state.status}:${state.sessionId}:${state.roomId}`)
  useEffect(() => { parkVrZone.endVisit() }, [owner])
  useEffect(() => {
    inputState.minigameOpen = phase !== 'closed'
    if (phase !== 'closed') clearRoamingInput()
    return () => { inputState.minigameOpen = false; clearRoamingInput() }
  }, [phase])
  useEffect(() => () => { parkVrZone.endVisit(); inputState.minigameOpen = false }, [])
  if (phase === 'closed') return null
  if (SKEWER_COOP_ENABLED && parkRuntime.cooperativeGame)
    return <CoopEntryBoundary onClose={() => parkVrZone.close()}>
      <Suspense fallback={<CoopEntryStatus onClose={() => parkVrZone.close()} />}>
        <CoopHost transport={parkRuntime.cooperativeGame} onClose={() => { parkVrZone.close(); void parkRuntime.checkRecovery() }} />
      </Suspense>
    </CoopEntryBoundary>
  return <div className="vr-zone-coop-entry"><PaperPopup title="VR 체험관 · 온탑 꼬치왕" label="꼬치왕 이용 안내" closeLabel="꼬치왕 이용 안내 닫기" onClose={() => parkVrZone.close()}>
    <h2>{SKEWER_COOP_ENABLED ? '친구와 연결을 준비하고 있어요' : '잠시 가게를 정비하고 있어요'}</h2>
    <p role="status">{SKEWER_COOP_ENABLED ? '공원 연결을 확인한 뒤 다시 입장해 주세요.' : '준비가 끝나면 다시 만나요.'}</p>
    <p>온탑 꼬치왕은 두 사람이 함께 즐기는 무료 협동 게임이에요.</p>
    <div className="paper-actions"><button className="paper-primary" onClick={() => parkVrZone.close()}>공원으로 돌아가기</button></div>
  </PaperPopup></div>
}
