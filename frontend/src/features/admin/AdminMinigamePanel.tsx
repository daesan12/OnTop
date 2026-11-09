import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminAccess } from './adminAccess'
import { AdminEventsError, finalizeEventRound, firstMinigameWeek,
  legacyMinigameLabels, loadEventRound, schedule, type EventKind, type EventRound } from './adminEvents'
import { confirmWeeklyRanking, loadWeeklyGames, loadWeeklyRanking,
  type WeeklyGame, type WeeklyRanking } from './weeklyMinigameAwards'

const displayTime = (value: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value))
const metric = (code: string, value: number) => code === 'JUMPMAP'
  ? `${value.toLocaleString('ko-KR')}ms` : code === 'BUNGEOPPANG'
    ? `${value.toLocaleString('ko-KR')}점` : `검증값 ${value.toLocaleString('ko-KR')}`
const changed = (before: WeeklyRanking, after: WeeklyRanking) => before.status !== after.status
  || before.candidateCount !== after.candidateCount || before.excludedGmCount !== after.excludedGmCount
  || (before.ranks[0]?.sourceRecordId ?? null) !== (after.ranks[0]?.sourceRecordId ?? null)

export function AdminMinigamePanel({ week, access, onAuthEnded, onFinalized }: {
  week: string | null; access: AdminAccess; onAuthEnded: () => void; onFinalized: () => void
}) {
  const legacy = week === firstMinigameWeek
  const [games, setGames] = useState<WeeklyGame[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)

  const reload = useCallback(async () => {
    request.current?.abort()
    setGames([]); setSelected(''); setError('')
    if (!week || legacy || week < firstMinigameWeek) return
    const controller = request.current = new AbortController()
    setLoading(true)
    try {
      const result = await loadWeeklyGames(week, controller.signal)
      if (!controller.signal.aborted) setGames(result)
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof AdminEventsError && cause.kind === 'unauthenticated') onAuthEnded()
      else setError(cause instanceof Error ? cause.message : '게임 목록을 조회하지 못했습니다.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }, [week, legacy, onAuthEnded])

  useEffect(() => { void reload(); return () => request.current?.abort() }, [reload])
  const game = games.find(item => item.gameCode === selected)

  return <section className="admin-events-panel" aria-label="미니게임 행사 관리">
    <div className="admin-events-panel-head"><h3>미니게임 1위 · {week || '회차 미선택'}</h3>
      {!legacy && <button type="button" disabled={!week || loading} onClick={() => void reload()}>게임 목록 새로고침</button>}</div>
    {!week && <p>유효한 KST 월요일 회차를 선택해주세요.</p>}
    {week && week < firstMinigameWeek && <p>미니게임 행사는 {firstMinigameWeek}부터 조회할 수 있습니다.</p>}
    {loading && <p role="status">등록된 게임을 조회하고 있습니다…</p>}
    {error && <p role="alert" className="admin-feedback-error">{error}</p>}
    {week && !legacy && !loading && !error && games.length === 0 &&
      <p>이 주차에 등록되어 활성화된 미니게임이 없습니다. 행사 기간과 상품 설정을 확인해주세요.</p>}
    {week && (legacy || games.length > 0) && <label className="admin-events-game-select">
      미니게임 선택
      <select value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">게임을 선택해주세요</option>
        {legacy ? Object.entries(legacyMinigameLabels).map(([code, label]) =>
          <option key={code} value={code}>{label}</option>)
          : games.map(item => <option key={item.gameCode} value={item.gameCode}>{item.displayName}</option>)}
      </select>
    </label>}
    {week && selected && legacy && <LegacyMinigame key={`${week}-${selected}`} week={week}
      kind={selected as 'bungeoppang' | 'jumpmap'} access={access}
      onAuthEnded={onAuthEnded} onFinalized={onFinalized} />}
    {week && game && !legacy && <WeeklyMinigame key={`${week}-${game.gameCode}`} week={week}
      game={game} access={access} onAuthEnded={onAuthEnded} onFinalized={onFinalized} />}
  </section>
}

function WeeklyMinigame({ week, game, access, onAuthEnded, onFinalized }: {
  week: string; game: WeeklyGame; access: AdminAccess;
  onAuthEnded: () => void; onFinalized: () => void
}) {
  const [ranking, setRanking] = useState<WeeklyRanking | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const busyRef = useRef(false)

  const reload = useCallback(async () => {
    request.current?.abort()
    setRanking(null); setConfirming(false); setError('')
    const controller = request.current = new AbortController()
    setLoading(true)
    try {
      const result = await loadWeeklyRanking(week, game.gameCode, controller.signal)
      if (!controller.signal.aborted) setRanking(result)
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof AdminEventsError && cause.kind === 'unauthenticated') onAuthEnded()
      else setError(cause instanceof Error ? cause.message : '검증 랭킹을 조회하지 못했습니다.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }, [week, game.gameCode, onAuthEnded])

  useEffect(() => { void reload(); return () => request.current?.abort() }, [reload])

  async function confirm() {
    if (!ranking || ranking.status !== 'READY' || !access.canOperate || busyRef.current) return
    const controller = request.current = new AbortController()
    busyRef.current = true; setBusy(true); setError(''); setConfirming(false)
    try {
      const latest = await loadWeeklyRanking(week, game.gameCode, controller.signal)
      if (controller.signal.aborted) return
      if (latest.status !== 'READY' || changed(ranking, latest)) {
        setRanking(latest)
        setError('다른 작업으로 순위가 변경됐습니다. 최신 랭킹을 다시 확인해주세요.')
        return
      }
      const result = await confirmWeeklyRanking(week, game.gameCode, latest, controller.signal)
      if (!controller.signal.aborted) { setRanking(result); onFinalized() }
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof AdminEventsError && cause.kind === 'unauthenticated') { onAuthEnded(); return }
      setError(cause instanceof Error ? cause.message : '확정 결과를 확인하지 못했습니다.')
      // The POST may have committed even if its response was lost.
      try {
        const current = await loadWeeklyRanking(week, game.gameCode, controller.signal)
        if (!controller.signal.aborted) {
          setRanking(current)
          if (current.status === 'FINALIZED') onFinalized()
        }
      } catch { setRanking(null) }
    } finally { busyRef.current = false; setBusy(false) }
  }

  return <div className="admin-events-game-detail">
    <div className="admin-events-panel-head"><h4>{game.displayName} 검증 랭킹</h4>
      <button type="button" disabled={busy || loading} onClick={() => void reload()}>랭킹 새로고침</button></div>
    <dl className="admin-events-facts">
      <div><dt>행사 시작</dt><dd>{displayTime(game.startsAt)}</dd></div>
      <div><dt>기록 마감</dt><dd>{displayTime(game.endsAt)}</dd></div>
      <div><dt>발표</dt><dd>{displayTime(game.announcesAt)}</dd></div>
      <div><dt>1위 상품</dt><dd>{game.prizeName}</dd></div>
      <div><dt>규칙 버전</dt><dd>{game.rankingRuleVersion}</dd></div>
      <div><dt>상태</dt><dd>{ranking?.status === 'PROVISIONAL' ? '잠정 순위'
        : ranking?.status === 'READY' ? '확정 대기' : ranking?.status === 'FINALIZED' ? '확정 완료' : '조회 전'}</dd></div>
      <div><dt>발표 상태</dt><dd>{ranking?.status === 'FINALIZED'
        ? Date.now() >= Date.parse(game.announcesAt) ? '발표됨' : '발표 전'
        : Date.now() >= Date.parse(game.announcesAt) ? '결과 확정 지연' : '발표 전'}</dd></div>
    </dl>
    {loading && <p role="status">서버 검증 기록을 조회하고 있습니다…</p>}
    {error && <p role="alert" className="admin-feedback-error">{error}</p>}
    {ranking && !loading && <>
      <p>후보 {ranking.candidateCount}명 · GM 제외 {ranking.excludedGmCount}명 · 제외 후 {ranking.candidateCount - ranking.excludedGmCount}명</p>
      {ranking.status === 'PROVISIONAL' && <p role="status">기록 마감과 정산 대기 전의 잠정 순위입니다. 아직 확정할 수 없습니다.</p>}
      {ranking.status !== 'FINALIZED' && Date.now() >= Date.parse(game.announcesAt) &&
        <p role="status">발표 시각이 지났지만 결과가 아직 확정되지 않았습니다. 검증 랭킹과 확정 상태를 확인해주세요.</p>}
      {ranking.status === 'FINALIZED' ? <div className="admin-events-results"><h4>확정 결과</h4>
        {ranking.winner ? <p><strong>{ranking.winner.nickname}</strong> · {ranking.winner.prizeName} ·
          {metric(game.gameCode, ranking.winner.sourceValue)} · 기록 {ranking.winner.sourceRecordId}</p>
          : <p>검증된 기록이 없어 공석으로 확정됐습니다.</p>}</div>
        : <div className="admin-events-results"><h4>{ranking.status === 'READY' ? '확정 전 검토 순위' : '잠정 순위'}</h4>
          {ranking.ranks.length ? <ol>{ranking.ranks.map(item => <li key={item.sourceRecordId}>
            <strong>{item.place}위 · {item.nickname}</strong>
            <span>{metric(game.gameCode, item.sourceValue)}</span>
            <small>기록 {item.sourceRecordId} · 달성 {displayTime(item.achievedAt)}</small>
          </li>)}</ol> : <p>검증된 기록이 없습니다. 마감 후 확정하면 상품은 공석으로 기록됩니다.</p>}</div>}
      {ranking.status === 'READY' && access.canOperate && <div className="admin-events-action">
        {!confirming ? <button type="button" disabled={busy} onClick={() => setConfirming(true)}>1위 확정 준비</button>
          : <div role="group" aria-label="미니게임 확정 확인">
            <p>{game.displayName}의 {ranking.ranks[0]?.nickname ?? '공석'} 결과와 상품 {game.prizeName}을 확정합니다. 서버가 순위를 다시 검증합니다.</p>
            <button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? '확정 중…' : '이 순위 최종 확정'}</button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>취소</button>
          </div>}
      </div>}
      {ranking.status === 'READY' && !access.canOperate && <p>확정은 운영 권한이 있는 관리자만 할 수 있습니다.</p>}
    </>}
  </div>
}

function LegacyMinigame({ week, kind, access, onAuthEnded, onFinalized }: {
  week: string; kind: Extract<EventKind, 'bungeoppang' | 'jumpmap'>;
  access: AdminAccess; onAuthEnded: () => void; onFinalized: () => void
}) {
  const [round, setRound] = useState<EventRound | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const timing = schedule(week, kind)
  const eligible = Date.now() >= Date.parse(timing.eligibleAt)

  const reload = useCallback(async () => {
    request.current?.abort()
    setRound(null); setError(''); setConfirming(false)
    const controller = request.current = new AbortController()
    setLoading(true)
    try {
      const result = await loadEventRound(kind, week, controller.signal)
      if (!controller.signal.aborted) setRound(result)
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof AdminEventsError && cause.kind === 'unauthenticated') onAuthEnded()
      else setError(cause instanceof Error ? cause.message : '회차를 조회하지 못했습니다.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }, [kind, week, onAuthEnded])
  useEffect(() => { void reload(); return () => request.current?.abort() }, [reload])

  async function confirm() {
    if (!access.canOperate || !eligible || round?.finalized || busy || !confirming) return
    const controller = request.current = new AbortController()
    setBusy(true); setError(''); setConfirming(false)
    try {
      const result = await finalizeEventRound(kind, week, controller.signal)
      if (!controller.signal.aborted) { setRound(result); onFinalized() }
    } catch (cause) {
      if (controller.signal.aborted) return
      if (cause instanceof AdminEventsError && cause.kind === 'unauthenticated') { onAuthEnded(); return }
      setError(cause instanceof Error ? cause.message : '확정 결과를 확인하지 못했습니다.')
      try { const current = await loadEventRound(kind, week, controller.signal)
        if (!controller.signal.aborted) setRound(current)
      } catch { setRound(null) }
    } finally { setBusy(false) }
  }

  return <div className="admin-events-game-detail">
    <div className="admin-events-panel-head"><h4>{legacyMinigameLabels[kind]} · 기존 회차</h4>
      <button type="button" disabled={loading || busy} onClick={() => void reload()}>결과 새로고침</button></div>
    <p>2026-11-02 회차는 기존 게임상 API의 결과를 표시합니다.</p>
    {loading && <p role="status">회차를 조회하고 있습니다…</p>}
    {error && <p role="alert" className="admin-feedback-error">{error}</p>}
    {round && !loading && <>
      <dl className="admin-events-facts">
        <div><dt>기록 마감</dt><dd>{displayTime(round.endsAt)}</dd></div>
        <div><dt>발표</dt><dd>{displayTime(round.announcesAt)}</dd></div>
        <div><dt>상태</dt><dd>{round.finalized ? '확정 완료' : eligible ? '확정 대기' : '진행 중'}</dd></div>
        {round.finalized && <><div><dt>후보</dt><dd>{round.candidateCount}</dd></div>
          <div><dt>GM 제외</dt><dd>{round.excludedGmCount}</dd></div></>}
      </dl>
      {round.finalized && <div className="admin-events-results"><h4>확정 결과</h4>
        {round.winners.length ? round.winners.map(item => <p key={item.userId}>
          <strong>{item.nickname || `회원 #${item.userId}`}</strong> · {item.prizeName} · {item.evidence}</p>)
          : <p>검증된 기록이 없어 공석입니다.</p>}</div>}
      {!round.finalized && access.canOperate && <div className="admin-events-action">
        {!confirming ? <button type="button" disabled={!eligible || busy} onClick={() => setConfirming(true)}>결과 확정 준비</button>
          : <div role="group" aria-label="기존 회차 확정 확인">
            <p>기존 {legacyMinigameLabels[kind]} 회차를 확정합니다. 서버에서 후보와 GM 제외를 검증합니다.</p>
            <button type="button" disabled={busy} onClick={() => void confirm()}>{busy ? '확정 중…' : '확정 실행'}</button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>취소</button>
          </div>}
      </div>}
      {!round.finalized && !access.canOperate && <p>확정은 운영 권한이 있는 관리자만 할 수 있습니다.</p>}
    </>}
    {!loading && !round && !error && <p>이 게임의 회차 기록이 없습니다.</p>}
  </div>
}
