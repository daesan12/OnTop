import {residentsEnabled,useAiFeatures} from '../ai/serviceFeatures'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { bindAnchor } from '../../network/tableBindings'
import { useSession } from '../../network/worldClient'
import { useGame, tableBusy } from '../../game/store'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { GameControls } from '../../game/OmokPanel'
import { TABLE_GAMES, canLeaveByMovement, waitingForRound, tableTermsLabel } from './model'
import { publicMatchService } from './publicMatch'
import { resetSeatedLook, useTableLobby } from './state'
import './tableLobby.css'
import { useGathering } from './gathering'
import { TableGatheringHud } from './TableGatheringHud'
import { gameState } from '../../game/protocol'
import { TabletLobby } from './TabletLobby'
import { TABLET_ENABLED } from './tabletFeature'
import { participantResultLabel, resultSettlement } from './gatheringModel'
import { HostStartWaitNotice } from './HostStartWaitControls'
import { BoardRewardCoinSource } from '../wallet/RewardCoinFlight'
import { useCompanions } from '../ai/companions'
import { NpcArrivalPanel } from '../ai/NpcArrivalPanel'

export function TableLobby() {
  useAiFeatures(s=>s.companions)
  return <>{TABLET_ENABLED && <HostStartWaitNotice />}<TableLobbyContent /></>
}
function TableLobbyContent() {
  const practice=useCompanions(s=>s.practice)
  const runtime = useParkRuntime()
  const gathering = useGathering(), details = useTableLobby(s => s.gatheringDetails)
  const s = useSession(useShallow(s => ({
    own: s.sessionId, channel: s.roomId, focused: s.focusedAnchorId, seated: s.tableId,
    tables: s.tables, states: s.tableStates, bindings: s.bindings, pending: s.pending,
    connected: s.status === 'connected', profiles: s.profiles, bench: s.benchId,
  })))
  const game = useGame(s => s.game), start = useGame(s => s.start), busy = useGame(tableBusy)
  const roundStatus = game && gameState(game).status
  useEffect(resetSeatedLook, [game?.gameId, roundStatus, start?.phase])
  const lastResult = useGame(s => s.lastResult)
  const gameError = useGame(s => s.error)
  const movementExit = useGame(game => {
    const table = s.states[s.seated]
    return !!table && canLeaveByMovement(table, s.own, game)
  })
  const query = useTableLobby(useShallow(s => ({ tableId: s.tableId, status: s.status, error: s.error, panelOpen: s.panelOpen })))
  const [, setRefreshReference] = useState(0)
  const tableId = s.seated || bindAnchor(s.bindings, s.channel, s.focused, s.tables.map(t => t.tableId))
  const table = tableId ? s.states[tableId] : undefined
  const summary = s.tables.find(t => t.tableId === tableId)
  const ownTable = s.seated === tableId && !!tableId
  const ref = tableId ? publicMatchService.find({ channelId: s.channel, tableId }) : null
  const canWatch = !!ref && ref.tableId === tableId && ref.channelId === s.channel
    && !s.seated && !busy && s.connected
  if (residentsEnabled() && practice?.snapshot.tableId===tableId && ownTable) return practice.phase==='ARRIVING'?<NpcArrivalPanel/>:null
  if (TABLET_ENABLED && ownTable) return gathering?.finished ? <TableGatheringHud key={gathering.scope} model={gathering} /> : <TabletLobby tableId={tableId} />
  if (gathering && details !== gathering.scope && (gathering.gameCode || gathering.finished)) return <TableGatheringHud model={gathering} />
  if (!s.focused || !query.panelOpen || game || s.bench || !ownTable) return null
  return <section role="dialog" aria-label="테이블 정보" className="park-runtime-panel park-table-panel table-lobby">
    <div className="table-lobby-heading"><strong>테이블 · {s.focused || s.bindings.find(b => b.tableId === tableId)?.anchorId}</strong>
      <div className="table-heading-actions">{ownTable && <button disabled={s.pending || busy || !s.connected} onClick={() => void runtime.leaveTable()}>일어나기</button>}
        <button aria-label="테이블 정보 닫기" onClick={runtime.closeTable}>닫기</button></div></div>
    {gathering && <button className="gathering-settings-return" onClick={() => useTableLobby.setState({ gatheringDetails: '' })}>테이블 함께 보기</button>}
    <div className="prototype-table-heading"><h2>{TABLE_GAMES.find(g => g.code === table?.gameCode)?.name ?? '어떤 한 판 할까요?'}</h2><span aria-hidden="true">{table?.gameCode === 'DAVINCI_CODE' ? '0–11' : table?.gameCode === 'DICE' ? '⚄' : table?.gameCode === 'DICE_LEDGER' ? '帳' : table?.gameCode === 'ONE_CARD' ? '♠' : table?.gameCode === 'LIAR_BRIDGE' ? '橋' : table?.gameCode === 'HALLI_GALLI' ? '鐘' : '五目'}</span></div>
    <p className="table-lobby-note">{table?.gameCode === 'DAVINCI_CODE' ? '2~4인 · 숫자 타일 26개 · 추리와 공개 · 한 차례 120초' : table?.gameCode === 'OMOK' ? '15×15 렌주 · 흑 금수 · 한 수 30초' : table?.gameCode === 'DICE' ? '주사위 6개 · R 굴리기 · Q 점수 챙기기 · 차례 전체 30초' : table?.gameCode === 'ONE_CARD' ? '2~4인 · 손패 7장 · 원카드 선언 · 차례 전체 30초' : table?.gameCode === 'LIAR_BRIDGE' ? '2~4인 · 비밀 주사위와 다우트 · 말 3개 골인' : table?.gameCode === 'DICE_LEDGER' ? '2~4인 · 주사위 5개 · 세 번 굴려 12칸 기록 · 굴림마다 20초' : table?.gameCode === 'HALLI_GALLI' ? '2~4인 · 과일 카드 56장 · 같은 과일 정확히 5개면 종 · 공개 5초' : '자리에 앉아 함께할 게임을 선택하세요.'}</p>
    {!tableId ? <p>서버 테이블과 공원 배치 연결이 필요합니다.</p> : <>
      {gameError && <p role="alert">{gameError}</p>}
      <p className="table-lobby-role">{ownTable ? '참가자' : '공개 대기 상태 보기'} · {table ? `${table.seats.filter(s => s.userId).length}/${table.capacity}석` : `${summary?.occupiedSeats ?? '—'}/${summary?.capacity ?? '—'}석`}</p>
      <p aria-label="현재 방 설정">{tableTermsLabel(table ?? summary)}</p>
      {!ownTable && query.tableId === tableId && query.status === 'error' ?
        <div role="alert"><p>{query.error}</p><button disabled={s.pending || !s.connected} onClick={() => runtime.inspectTable(s.focused)}>테이블 정보 다시 확인</button></div>
        : !table && <p role="status">테이블 상태 확인 중</p>}
      {table && <ol className="table-seat-list" aria-label="좌석과 준비 상태">{table.seats.map(seat => <li key={seat.seatNumber} data-own={seat.userId === s.own}>
        <span>{seat.seatNumber}번 · {seat.userId === s.own ? '나' : seat.userId ? s.profiles[seat.userId]?.nickname ?? '산책자' : '빈자리'}</span>
        <span>{seat.userId && seat.userId === table.selectorUserId ? '방장 · ' : ''}{seat.userId ? seat.ready ? '준비' : '대기' : '비어 있음'}</span>
      </li>)}</ol>}
      {lastResult && ownTable && <section aria-label="지난 판 결과" className="table-round-result">
        <strong>지난 판 결과{lastResult.status === 'INVALID' && ' · 무효 경기'}</strong>
        <p>{lastResult.participants.map(p => `${p.userId === s.own ? '나' : s.profiles[p.userId]?.nickname ?? '상대'}: ${participantResultLabel(lastResult.status, p.result)}`).join(' · ')}</p>
        <p><BoardRewardCoinSource>{resultSettlement(lastResult)}</BoardRewardCoinSource></p>
        <p>좌석은 유지됩니다. 서버가 대기실을 연 뒤 다시 준비하면 새 판을 시작합니다.</p>
        <button disabled={s.pending || !s.connected || lastResult.settlementStatus !== 'SETTLED' || !waitingForRound(start, tableId)} onClick={() => useGame.setState({ lastResult: null, dismissedResult: { gameId: lastResult.gameSessionId, version: lastResult.version } })}>
          {table?.selectorUserId === s.own ? '다음 판 준비' : '대기실로 돌아가기'}</button>
      </section>}
      {ownTable ? <>
        <GameControls tableId={tableId} />
        <p className="table-lobby-note">{movementExit ? '미준비 대기 중에는 창을 닫고 이동키로 일어날 수 있어요.' : '준비·경기·정산 중 이동키로 퇴장하지 않습니다.'}</p>
        <button onClick={resetSeatedLook}>정면 보기</button>
        <small>마우스 오른쪽 드래그로 주변을 둘러볼 수 있어요.</small>
      </> : <>
        <button disabled={s.pending || !s.connected || busy || !!s.seated || !!s.bench || summary?.joinable === false} onClick={() => void runtime.joinTable()}>앉기</button>
        {s.bench && <p>벤치 관전 중입니다. 참가하려면 먼저 벤치에서 일어나주세요.</p>}
        {summary?.joinable === false && <p>진행·정산 중이거나 빈자리가 없는 테이블입니다.</p>}
        <button disabled={!canWatch || s.pending} onClick={() => ref && void runtime.watchGame(ref.gameId)}>경기 관전</button>
        {!ref && <p className="table-lobby-note">현재 확정된 진행 경기가 없습니다. 서버의 시작 확정을 기다려주세요.</p>}
        {import.meta.env.DEV && import.meta.env.MODE === 'facility-preview' && publicMatchService.mode === 'mock' && <>
          <p className="table-preview-label">공개 경기 참조만 목업 · 관전 승인과 공개 판은 기존 WS를 사용합니다.</p>
          <button onClick={() => setRefreshReference(n => n + 1)}>미리보기 경기 참조 확인</button>
        </>}
      </>}
      {table?.gameCode && !TABLE_GAMES.some(g => g.code === table.gameCode) && <p>이 게임의 화면은 아직 이관되지 않았습니다.</p>}
    </>}
  </section>
}
