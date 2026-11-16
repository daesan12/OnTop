import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AdminAccessError } from './adminAccess'
import {
  readMoleAudit, searchMoleAudit, type AuditDetail, type AuditFilters, type AuditRound, type Distribution,
  type MoleDetectedMember,
} from './adminMoleAudit'
import { kstDate } from './adminAnalytics'
import { JumpmapMacroPanel } from './JumpmapMacroPanel'
import { JumpRopeMacroPanel } from './JumpRopeMacroPanel'
import { MoleDetectionsPanel } from './MoleDetectionsPanel'
import './adminMacroAnalysis.css'

const gameOptions = { 'whack-a-mole': '두더지 잡기', 'speed-mole': '스피드 두더지 잡기' } as const
const inputOptions = { KEYBOARD: '키보드', POINTER: '마우스·펜', TOUCH: '터치' } as const
const outcomes = {
  HIT: '적중', RAPID: '헬멧 연타', MISS: '빈 구멍', DECOY: '고슴도치',
  IGNORED: '판정 제외', HONEYPOT: '더미 ID',
} as const
const idPattern = '[1-9][0-9]{0,18}'
const receivedTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit',
  fractionalSecondDigits: 3,
})
const formatAuditDateTime = (value: string) => `${kstDate(value)} ${receivedTime.format(new Date(value))}`

export function AdminMacroAnalysisPage({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [view, setView] = useState<'games' | 'mole' | 'jumpmap' | 'jumpRope'>('games')
  return <section className="admin-feedback-content admin-macro">
    {view === 'games' ? <>
      <h2>게임 매크로 분석</h2>
      <button type="button" className="admin-macro-game" onClick={() => setView('mole')}>
        <strong>두더지 플레이 기록</strong><span>두더지 잡기와 스피드 두더지 잡기의 적발 회원과 타격 기록을 조회합니다.</span>
      </button>
      <button type="button" className="admin-macro-game" onClick={() => setView('jumpmap')}>
        <strong>점프맵 반복 패턴</strong><span>반복 재생으로 보이는 판이 기록된 회원과 적발 횟수를 조회합니다.</span>
      </button>
      <button type="button" className="admin-macro-game" onClick={() => setView('jumpRope')}>
        <strong>구구구 줄넘기 기록</strong><span>같은 점프 기록의 재제출과 흔들림 없는 박자가 기록된 회원을 조회합니다.</span>
      </button>
    </> : <>
      <button type="button" className="admin-macro-back" onClick={() => setView('games')}>← 게임 선택</button>
      {view === 'mole' ? <MoleAudit onAuthEnded={onAuthEnded} />
        : view === 'jumpmap' ? <JumpmapMacroPanel onAuthEnded={onAuthEnded} /> : <JumpRopeMacroPanel onAuthEnded={onAuthEnded} />}
    </>}
  </section>
}

function MoleAudit({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [form, setForm] = useState<AuditFilters>(() => ({
    game: 'whack-a-mole', input: 'KEYBOARD', userId: '', roundId: '', date: kstDate(new Date().toISOString()),
  }))
  const [query, setQuery] = useState<AuditFilters | null>(null)
  const [rounds, setRounds] = useState<AuditRound[] | null>(null)
  const [detail, setDetail] = useState<AuditDetail | null>(null)
  const [selectedDetection, setSelectedDetection] = useState<MoleDetectedMember | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const searchHeading = useRef<HTMLHeadingElement>(null)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => () => request.current?.abort(), [])

  const openedDetection = detail && selectedDetection?.userId === detail.selected.userId
    && selectedDetection.latestRoundId === detail.selected.roundId ? selectedDetection : null
  useEffect(() => {
    if (openedDetection) detailHeading.current?.focus()
  }, [openedDetection])

  const begin = (message: string) => {
    request.current?.abort()
    const controller = request.current = new AbortController()
    setBusy(message)
    setError('')
    return controller.signal
  }
  const fail = (cause: unknown, signal: AbortSignal) => {
    if (signal.aborted) return
    if (cause instanceof AdminAccessError && cause.kind === 'unauthenticated') onAuthEnded()
    else setError(cause instanceof Error ? cause.message : '조회하지 못했습니다.')
  }

  const search = async (event: FormEvent) => {
    event.preventDefault()
    const filters = { ...form, userId: form.userId.trim(), roundId: form.roundId.trim() }
    if (!filters.userId && !filters.roundId && !filters.date) {
      setError('회원 ID, 판 ID 또는 날짜를 입력해주세요.')
      return
    }
    const signal = begin('판을 조회하고 있어요…')
    setDetail(null)
    setSelectedDetection(null)
    setRounds(null)
    setQuery(filters)
    try {
      const results = await searchMoleAudit(filters, signal)
      setRounds(results)
      if (filters.roundId && results.length === 1) {
        setDetail(await readMoleAudit(filters.game, results[0]!.roundId, filters.input, signal))
      }
    } catch (cause) { fail(cause, signal) }
    finally { if (!signal.aborted) setBusy('') }
  }

  const openRound = async (roundId: string, filters: AuditFilters, detection?: MoleDetectedMember) => {
    const signal = begin('타임라인과 비교 기록을 가져오고 있어요…')
    setDetail(null)
    if (detection) {
      setSelectedDetection(detection)
      setForm(filters)
      setQuery(filters)
      setRounds(null)
      searchHeading.current?.focus()
    }
    try {
      const result = await readMoleAudit(filters.game, roundId, filters.input, signal)
      if (detection) setRounds([result.selected])
      setDetail(result)
    }
    catch (cause) { fail(cause, signal) }
    finally { if (!signal.aborted) setBusy('') }
  }

  const select = (round: AuditRound) => {
    if (query) void openRound(round.roundId, query)
  }

  return <>
    <h2>두더지 플레이 기록</h2>
    <div className="admin-macro-filters admin-mole-game-filter">
      <div className="admin-mole-game-control">
        <label htmlFor="admin-mole-game">게임</label>
        <select id="admin-mole-game" value={form.game} onChange={event => {
          request.current?.abort()
          setForm({ ...form, game: event.target.value as AuditFilters['game'], userId: '', roundId: '' })
          setBusy('')
          setError('')
          setQuery(null)
          setRounds(null)
          setDetail(null)
          setSelectedDetection(null)
        }}>
          {Object.entries(gameOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </div>
    <MoleDetectionsPanel key={form.game} game={form.game} onAuthEnded={onAuthEnded} onOpen={item => {
      const roundId = item.latestRoundId
      void openRound(roundId, { ...form, userId: item.userId, roundId, date: '' }, item)
    }} />
    <h3 tabIndex={-1} ref={searchHeading}>플레이 기록 조회</h3>
    <form className="admin-macro-filters admin-mole-search-filters" onSubmit={event => void search(event)}>
      <label>비교 입력 방식<select value={form.input} onChange={event => setForm({ ...form, input: event.target.value as AuditFilters['input'] })}>
        {Object.entries(inputOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>회원 ID<input inputMode="numeric" pattern={idPattern} value={form.userId}
        onChange={event => setForm({ ...form, userId: event.target.value })} /></label>
      <label>판 ID<input inputMode="numeric" pattern={idPattern} value={form.roundId}
        onChange={event => setForm({ ...form, roundId: event.target.value })} /></label>
      <label>날짜 (한국 시간)<input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label>
      <button type="submit">조회</button>
    </form>
    {busy && <p role="status">{busy}</p>}
    {error && <p role="alert">{error}</p>}
    {detail && <section className="admin-macro-card" aria-labelledby="admin-mole-detail-title">
      <h3 id="admin-mole-detail-title" tabIndex={-1} ref={detailHeading}>{detail.selected.roundId}번 판 상세</h3>
      <RoundIdentity detail={detail} detectedAt={openedDetection?.lastDetectedAt} />
    </section>}
    {rounds && <div className="admin-macro-layout">
      <div className="admin-macro-card">
        <h3>조회 결과</h3>
        {rounds.length === 0 ? <p>조회 조건과 일치하는 판이 없어요.</p> :
          <RoundList rounds={rounds} active={detail?.selected.roundId} onSelect={select} />}
        {rounds.length === 40 && <p>최근 40판을 표시합니다. 조회 조건을 좁혀주세요.</p>}
        {detail && <><h3>같은 회원의 최근 판</h3>
          <RoundList rounds={detail.recent} active={detail.selected.roundId} onSelect={select} /></>}
      </div>
      {detail && query && <div className="admin-macro-detail">
        <ComparisonTable detail={detail} query={query} />
        <section className="admin-macro-card">
          <h3>{detail.selected.roundId}번 판 타임라인</h3>
          <p>서버 수신 시각은 묶음 단위입니다. 등장과 입력 시점은 브라우저가 보고한 판 기준 시간입니다.</p>
          {detail.timeline.length === 0 ? <p>수신한 판 중 타격 기록이 없어요.</p> : <div className="admin-macro-scroll" tabIndex={0} aria-label="타격 타임라인">
            <table><thead><tr><th>서버 수신</th><th>등장 (ms)</th><th>입력 (ms)</th><th>구멍</th><th>입력 방식</th><th>타격</th></tr></thead>
              <tbody>{detail.timeline.map(tap => <tr key={tap.sequence} data-signal={tap.outcome === 'HONEYPOT' || undefined}>
                <td>{receivedTime.format(new Date(tap.receivedAt))}</td><td>{tap.appearedAtMs ?? '—'}</td><td>{tap.clientAtMs}</td>
                <td>{tap.hole + 1}</td><td>{inputOptions[tap.input]}</td><td>{outcomes[tap.outcome]}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {detail.selected.completionHoneypotTaps > 0 &&
            <p>완료 제출에서 확인된 더미 ID 타격 {detail.selected.completionHoneypotTaps}건</p>}
        </section>
      </div>}
    </div>}
  </>
}

function RoundIdentity({ detail, detectedAt }: {
  detail: AuditDetail
  detectedAt?: string
}) {
  // 목록은 종료 제출 신호도 포함하며, 상세의 타임라인에는 판 중 신호만 있다.
  let lastDetection = detectedAt
  for (const tap of detail.timeline) {
    if (tap.outcome === 'HONEYPOT' && (!lastDetection || Date.parse(tap.receivedAt) > Date.parse(lastDetection))) {
      lastDetection = tap.receivedAt
    }
  }
  const timestampLabel = detectedAt ? '최근 적발 시각' : '판 중 적발 시각'

  return <dl className="admin-mole-round-identity">
    <div><dt>회원</dt><dd>{detail.nickname && <strong>{detail.nickname} · </strong>}
      회원 #{detail.selected.userId}{detail.withdrawn ? ' · 탈퇴' : ''}</dd></div>
    <div><dt>판 시작 시각 (한국 시간)</dt><dd>
      <time dateTime={detail.selected.startedAt}>{formatAuditDateTime(detail.selected.startedAt)}</time>
    </dd></div>
    {lastDetection && <div><dt>{timestampLabel} (한국 시간)</dt><dd>
      <time dateTime={lastDetection}>{formatAuditDateTime(lastDetection)}</time>
    </dd></div>}
  </dl>
}

function RoundList({ rounds, active, onSelect }: {
  rounds: AuditRound[]; active?: string; onSelect: (round: AuditRound) => void
}) {
  return <div className="admin-macro-table"><table>
    <thead><tr><th>판 ID</th><th>회원 ID</th><th>서버 관측</th><th>더미 ID</th></tr></thead>
    <tbody>{rounds.map(round => <tr key={round.roundId} data-selected={round.roundId === active || undefined}>
      <td><button type="button" aria-pressed={round.roundId === active} onClick={() => onSelect(round)}>{round.roundId}</button></td>
      <td>{round.userId}</td><td>{round.observedTaps}건</td>
      <td data-signal={round.honeypotTaps > 0 || round.completionHoneypotTaps > 0 || undefined}>
        판 중 {round.honeypotTaps} · 종료 {round.completionHoneypotTaps}
      </td>
    </tr>)}</tbody>
  </table></div>
}

const distributionLabel = ({ count, median, p10, p90 }: Distribution) =>
  count ? `중앙값 ${median}ms · ${p10}–${p90}ms · ${count}건` : '표본 없음'

function ComparisonTable({ detail, query }: { detail: AuditDetail; query: AuditFilters }) {
  const { selected, member, reference } = detail
  return <section className="admin-macro-card">
    <h3>같은 게임·입력 방식 비교</h3>
    <p>{gameOptions[query.game]} · {inputOptions[query.input]} · {kstDate(selected.startedAt)} · 동일 규칙 버전</p>
    <div className="admin-macro-table"><table><thead><tr>
      <th>지표</th><th>회원 {selected.userId} · {member.rounds}판</th><th>비교 표본 · {reference.rounds}판</th>
    </tr></thead><tbody>
      <tr><th scope="row">더미 ID 타격</th><td data-signal={member.honeypotTaps > 0 || member.completionHoneypotTaps > 0 || undefined}>
        판 중 {member.honeypotTaps} · 종료 {member.completionHoneypotTaps}</td>
        <td>{reference.rounds ? '판 중 0 · 종료 0' : '표본 없음'}</td></tr>
      <tr><th scope="row">{query.game === 'speed-mole' ? '등장 후 적중 간격' : '등장 후 첫 타격'}</th>
        <td>{distributionLabel(member.first)}</td><td>{distributionLabel(reference.first)}</td></tr>
      {query.game === 'whack-a-mole' && <tr><th scope="row">헬멧 연타 간격</th>
        <td>{distributionLabel(member.rapid)}</td><td>{distributionLabel(reference.rapid)}</td></tr>}
    </tbody></table></div>
    <p>간격은 클라이언트 보고 기준이며 범위는 10–90백분위입니다. 비교 표본은 더미 신호가 관측되지 않은 다른 회원의 정산 판입니다. 회원의 더미 건수는 입력 방식과 관계없이 최근 판을 합산합니다.</p>
  </section>
}
