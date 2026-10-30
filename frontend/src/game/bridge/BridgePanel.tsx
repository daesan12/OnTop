import { SeatedLookButton } from '../../features/tableLobby/SeatedLookButton'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGame, recoveryBlocked } from '../store'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useTableLobby } from '../../features/tableLobby/state'
import { OmokSurrender } from '../OmokSurrender'
import { canActBridge } from './actions'
import type { BridgeInput } from './protocol'
import { COLORS, EVENTS, PAWNS, STAGES } from './presentation'
import { resultSettlement } from '../../features/tableLobby/gatheringModel'
import { TableClock, useTableNow } from './TableClock'
import './bridge.css'

export function BridgePanel() {
  const s = useGame(), session = useSession(useShallow(s => ({ sessionId: s.sessionId, status: s.status, pending: s.pending, profiles: s.profiles }))), runtime = useParkRuntime()
  const view = useTableLobby(s => s.spectatorView), [rules, setRules] = useState(false), now = useTableNow()
  const g = s.game?.bridge ? s.game : null
  if (!g) return <section className="park-runtime-panel bridge-panel" aria-label="다리 경기"><strong>거짓말 다리 건너기</strong><p role="status">공개 판과 본인 상태를 확인하고 있습니다.</p>
    {s.error && <p role="alert">{s.error}</p>}<button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button></section>
  const b = g.bridge, ownId = session.sessionId, spectator = g.role === 'SPECTATOR', finished = b.status === 'FINISHED'
  const own = b.players.find(p => p.userId === ownId)
  const fresh = !spectator && session.status === 'connected' && s.recovery === 'RESTORED' && !s.uncertain && g.version >= s.awaitingVersion
  const secret = fresh && !s.pending && g.secret?.userId === ownId && g.secret.turnId === b.turnId ? g.secret : null
  const name = (id: string) => id === ownId ? '나' : session.profiles[id]?.nickname ?? `참가자 ${b.players.findIndex(p => p.userId === id) + 1}`
  const can = (input: BridgeInput) => !session.pending && session.status === 'connected' && canActBridge(ownId, input, now)
  const send = (input: BridgeInput) => { if (can(input)) void runtime.actBridge(input) }
  const r = b.resolution, removed = (b.operations.length ? b.operations : r?.operations ?? []).filter(op => op.type === 'VACATE_GOAL_SLOT')
  return <section className="prototype-game minigame-hud bridge-panel" aria-label="다리 경기" data-stage={b.stage}>
    <header className="mini-heading"><small>온탑 · 믿음과 의심 사이</small><h2>{spectator ? '거짓말 다리 관전' : '거짓말 다리 건너기'}</h2><p>2~4인 · 비밀 주사위 · 시계 방향 순차 판단</p></header>
    <div className="mini-scoreboard bridge-players" aria-label="다리 참가자">{b.players.map((p, index) => <div key={p.userId} style={{ borderColor: COLORS[index] }}>
      <b>{name(p.userId)} {p.userId === b.turnUserId && !finished ? '· 선언자' : ''}{p.userId === b.responderUserId ? ' · 현재 판단자' : ''}</b>
      <span>유효 골인 {p.goals}/3 · {p.score}점</span><small>{p.pawns.some(p => p.status === 'ACTIVE') ? `현재 ${p.pawns.find(p => p.status === 'ACTIVE')!.position}칸` : p.goals ? '골인 말로 판단 가능' : '이동할 말 없음'} · 예비 {p.pawns.filter(p => p.status === 'RESERVE').length}개</small>
      <div className="bridge-pawn-status" aria-label={`${name(p.userId)} 말 현황`}>{p.pawns.map(pawn => <span key={pawn.id} data-status={pawn.status} title={`${pawn.id}: ${PAWNS[pawn.status]}`}>{PAWNS[pawn.status]}</span>)}</div>
      {p.pendingForfeit ? <small>기권 예정 · 판정 후 정리</small> : p.forfeited ? <small>기권 · 승리 후보 제외</small> : null}
    </div>)}</div>
    <div className="mini-status"><p role="status">{finished ? b.winnerUserIds.length ? `${b.winnerUserIds.map(name).join(' · ')} ${b.winnerUserIds.length > 1 ? '공동 승리' : '승리'}` : '승자 없이 경기 종료'
      : `${STAGES[b.stage]} · ${name(b.responderUserId ?? b.turnUserId!)}${b.stage === 'RESPONDING' ? ' 판단 차례' : ' 차례'}`}</p>
    <small>{b.turnId}번째 차례 · {EVENTS[b.lastEvent]}</small><TableClock deadline={b.turnDeadline} now={now} resolving={b.stage === 'RESOLVING'} />
    {b.turnDeadline && now >= Date.parse(b.turnDeadline) && <p>시간 만료 · 서버의 다음 상태를 기다리고 있습니다.</p>}
    </div>
    <section className="mini-actions bridge-main-actions">
    {b.declaration !== null && <p>선언한 숫자 <b>{b.declaration}</b> · {b.acceptedBy.length}명 믿음</p>}
    {b.stage === 'RESPONDING' && <small>판단 순서: {b.responseOrder.map(name).join(' → ')} · 현재 {name(b.responderUserId!)}</small>}
    {secret && <div className="bridge-private" aria-label="나만 보는 주사위"><b>{secret.die}</b><small>{secret.die === 'X' ? 'X · 어떤 숫자든 거짓말입니다.' : '본인에게만 공개된 눈입니다. 다른 숫자도 선언할 수 있습니다.'}</small></div>}
    {b.stage === 'RESOLVING' && <p>판정 연출 중에는 입력할 수 없습니다. 점수와 말 상태는 서버 판정이 이미 반영되었습니다.</p>}
    {r && <div aria-label="최근 다리 판정"><small>최근 판정 · {r.turnId}번째 차례 · 선언 {r.declaredNumber}</small>
      {r.challenged ? <p>실제 눈 <b>{r.actualFace}</b> · {r.wasBluff ? '거짓말을 찾아냈습니다. 선언자의 말이 떨어집니다.' : '선언이 사실입니다. 도전자의 현재 말 또는 최저 골인 말을 잃습니다.'}</p>
        : <p>모두 믿음 · 실제 눈은 공개하지 않습니다.</p>}</div>}
    {removed.length > 0 && <p>{removed.map(op => op.slotNumber).join(' · ')}번 골인 말 제거 · 사용 완료 슬롯은 재사용하지 않습니다.</p>}
    {!spectator && !finished && <div className="bridge-actions" aria-label="다리 행동">
      {b.stage === 'AWAITING_ROLL' && b.turnUserId === ownId && <button disabled={!can({ kind: 'roll' })} onClick={() => send({ kind: 'roll' })}>비밀 주사위 굴리기</button>}
      {b.stage === 'DECLARING' && b.turnUserId === ownId && <div className="bridge-actions" role="group" aria-label="선언할 숫자">{([1, 2, 3, 4] as const).map(value => <button key={value} disabled={!can({ kind: 'declare', value })} onClick={() => send({ kind: 'declare', value })}>{value} 선언</button>)}</div>}
      {b.stage === 'RESPONDING' && b.responderUserId === ownId && <><button disabled={!can({ kind: 'trust' })} onClick={() => send({ kind: 'trust' })}>믿기</button><button disabled={!can({ kind: 'doubt' })} onClick={() => send({ kind: 'doubt' })}>다우트!</button>
        <small>{own?.pawns.some(p => p.status === 'ACTIVE') ? '다우트 실패 시 현재 말이 추락합니다.' : '골인 말만 보유 중 · 실패하면 최저 골인 말을 잃고 성공해도 이동 보상은 없습니다.'}</small></>}
    </div>}
    {spectator && <p>관전 중 · 공개 판만 볼 수 있으며 비공개 주사위·행동·개인 정산 권한은 없습니다.</p>}
    </section>
    <div className="mini-feedback">{s.pending && <p>요청 중 · 서버 판정 확인 중입니다.</p>}{g.version < s.awaitingVersion && <p>처리 확인 수신 · 최신 판과 본인 상태를 기다리고 있습니다.</p>}
    {s.uncertain && <p>반영 여부를 확인해주세요. 같은 행동을 자동 재전송하지 않습니다.</p>}{recoveryBlocked() && <p>경기 복구 확인 중 · 입력을 잠시 멈췄습니다.</p>}{s.error && <p role="alert">{s.error}</p>}
    </div>
    {!spectator && finished && <p>{s.result ? resultSettlement(s.result) : '결과 확인 중'}</p>}
    <section className="bridge-goals" aria-label="골인 점수 위치"><div className="bridge-goal-track">{b.goalSlots.map(slot => <span key={slot.slot} data-status={slot.status}
      title={slot.status === 'OCCUPIED' ? `${slot.slot}점 · ${name(slot.userId!)}` : slot.status === 'VACATED' ? `${slot.slot}번 사용 완료 · 재사용 불가` : `${slot.slot}번 미사용`}>{slot.slot}{slot.status === 'VACATED' ? ' ×' : slot.status === 'OCCUPIED' ? ' ●' : ''}</span>)}</div>
    <small>{b.nextGoalSlot <= 8 ? `다음 골인 번호 ${b.nextGoalSlot}` : '1~8번 발급 완료'} · 사용 완료 슬롯은 정렬하거나 다시 채우지 않습니다.</small>
    </section>
    <div className="mini-tools"><SeatedLookButton /><div className="bridge-actions"><button aria-expanded={rules} onClick={() => setRules(!rules)}>다리 규칙</button>
      <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkGame()}>최신 다리 확인</button>
      {recoveryBlocked() && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkRecovery()}>경기 복구 다시 확인</button>}
      {!spectator && finished && <button disabled={session.pending || session.status !== 'connected'} onClick={() => void runtime.checkResult()}>정산 결과 확인</button>}
      {spectator && <button disabled={session.pending} onClick={() => void runtime.unwatchGame()}>관전 종료</button>}</div>
    {rules && <div className="mini-help bridge-rules"><p>1·2·3·4·X·X 비밀 주사위. 1~4를 선언하고 다음 참가자부터 순서대로 믿기/다우트를 판단합니다. 다우트가 없으면 눈을 끝까지 공개하지 않습니다.</p>
      <p>굴림·선언·각 판단 30초. 굴림/선언 만료는 차례 넘김, 판단 만료는 믿기입니다. 판정 연출은 1.5초이며 다음 단계는 서버가 엽니다.</p>
      <p>각자 말 7개, 다리 8칸을 지나 골인합니다. 유효 골인 3개 즉시 승리, 골인 슬롯은 1~8 순차 발급·제거 후 재사용하지 않습니다. 공동 승리와 벌칙은 서버 결과를 따릅니다.</p></div>}
    {spectator && <div className="bridge-actions" role="group" aria-label="관전 시점"><button aria-pressed={view === 'board'} onClick={() => useTableLobby.setState({ spectatorView: 'board' })}>공개 판 보기</button><button aria-pressed={view === 'table'} onClick={() => useTableLobby.setState({ spectatorView: 'table' })}>테이블 둘러보기</button></div>}
    {!spectator && <OmokSurrender key={`${ownId}:${g.gameId}`} context={{ userId: ownId, gameId: g.gameId, version: g.version }} disabled={!fresh || session.pending || !!own?.forfeited || !!own?.pendingForfeit} />}
    </div>
  </section>
}
