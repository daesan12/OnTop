import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AdminAnalyticsError, isStaleSnapshot, kstDate, loadAdminAnalytics, selectAnalyticsPeriod, shiftDate,
  type AnalyticsSnapshot,
} from './adminAnalytics'
import './adminAnalytics.css'

const number = new Intl.NumberFormat('ko-KR')
const dateTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
})
const displayTime = (value: string) => dateTime.format(new Date(value))
const percent = (part: number, total: number) => total ? `${(part / total * 100).toFixed(1)}%` : '—'

type LoadError = { kind: AdminAnalyticsError['kind']; message: string }

export function AdminAnalyticsPage({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<LoadError | null>(null)
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const request = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    request.current?.abort()
    const abort = request.current = new AbortController()
    setLoading(true); setError(null)
    try {
      const next = await loadAdminAnalytics(abort.signal)
      if (abort.signal.aborted) return
      setSnapshot(next)
      const latestDay = kstDate(next.dataAsOf)
      setFrom(current => current || shiftDate(latestDay, -6))
      setTo(current => current || latestDay)
    } catch (cause) {
      if (abort.signal.aborted) return
      if (cause instanceof AdminAnalyticsError && cause.kind === 'unauthenticated') {
        onAuthEnded(); return
      }
      if (cause instanceof AdminAnalyticsError && cause.kind === 'forbidden') setSnapshot(null)
      setError(cause instanceof AdminAnalyticsError
        ? { kind: cause.kind, message: cause.message }
        : { kind: 'failed', message: '연결 상태를 확인한 뒤 다시 조회해주세요.' })
    } finally { if (!abort.signal.aborted) setLoading(false) }
  }, [onAuthEnded])

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void load() })
    return () => { active = false; request.current?.abort() }
  }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const validRange = Boolean(from && to && from <= to)
  const selected = snapshot && validRange ? selectAnalyticsPeriod(snapshot, from, to) : null
  const daily = selected?.daily ?? []
  const games = selected?.games ?? []
  const funnelSteps = [
    { label: '신규 가입', value: selected?.funnel.onboarded ?? 0 },
    { label: '채널 입장', value: selected?.funnel.channelJoined ?? 0 },
    { label: '테이블 착석', value: selected?.funnel.tableJoined ?? 0 },
    { label: '경기 시작', value: selected?.funnel.gameStarted ?? 0 },
    { label: '경기 완주', value: selected?.funnel.gameCompleted ?? 0 },
  ]
  const maxDaily = Math.max(1, ...daily.map(row => row.activeUsers))
  const stale = snapshot && isStaleSnapshot(snapshot.dataAsOf, now)

  return <section className="admin-feedback-content admin-analytics" aria-label="일별·게임별 이용 분석" aria-busy={loading}>
    <div className="admin-feedback-toolbar">
      <h2>이용 현황</h2>
      <button type="button" disabled={loading} onClick={() => void load()}>집계 새로고침</button>
    </div>
    {loading && <p role="status">집계를 확인하고 있어요…</p>}
    {error && <div className="admin-feedback-error" role="alert">
      <p>{error.message}{snapshot && error.kind !== 'forbidden' ? ' 아래는 마지막으로 불러온 집계입니다.' : ''}</p>
      <button type="button" disabled={loading} onClick={() => void load()}>다시 조회</button>
    </div>}
    {snapshot && <>
      <div className="admin-analytics-meta">
        <p><strong>데이터 기준</strong> <time dateTime={snapshot.dataAsOf}>{displayTime(snapshot.dataAsOf)}</time> KST</p>
        <p><strong>집계 생성</strong> <time dateTime={snapshot.generatedAt}>{displayTime(snapshot.generatedAt)}</time> KST</p>
        <span className={stale ? 'admin-analytics-stale' : 'admin-analytics-current'} role="status">
          {stale ? '집계 지연 · 데이터 기준 시각이 36시간 이상 지났습니다' : '최근 집계'}
        </span>
      </div>

      <div className="admin-analytics-range" role="group" aria-label="조회 기간">
        <label>시작일 <input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label>종료일 <input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
        <small>한국 날짜 기준 · 백업 시점까지의 기록</small>
      </div>
      {!validRange && <p className="admin-analytics-notice" role="alert">시작일과 종료일을 확인해주세요.</p>}
      {validRange && <>
        {daily.length + (selected?.funnelRows.length ?? 0) + games.length === 0 && <p className="admin-analytics-notice" role="status">
          선택한 기간에 집계된 기록이 없습니다.
        </p>}
        <div className="admin-analytics-cards" aria-label="선택 기간 요약">
          <article><span>신규 가입</span><strong>{number.format(selected?.newUsers ?? 0)}</strong><small>명</small></article>
          <article><span>공원 연결</span><strong>{number.format(selected?.connections ?? 0)}</strong><small>회</small></article>
          <article><span>경기 시작</span><strong>{number.format(selected?.gameStarts ?? 0)}</strong><small>건</small></article>
        </div>

        <section className="admin-analytics-block" aria-labelledby="admin-daily-title">
          <h3 id="admin-daily-title">일별 이용 현황</h3>
          <p>활성 사용자와 경기 참여자는 날짜별 고유 인원입니다. 여러 날짜의 인원을 합쳐 기간 고유 인원으로 표시하지 않습니다.</p>
          {daily.length === 0 ? <p className="admin-analytics-empty">이 기간의 일별 기록이 없습니다.</p> : <>
            <ol className="admin-analytics-bars" aria-label="날짜별 활성 사용자">
              {daily.map(row => <li key={row.date}>
                <time dateTime={row.date}>{row.date}</time>
                <span className="admin-analytics-track"><span style={{ width: `${row.activeUsers / maxDaily * 100}%` }} /></span>
                <strong>{number.format(row.activeUsers)}명</strong>
              </li>)}
            </ol>
            <div className="admin-analytics-scroll"><table>
              <caption>한국 날짜별 이용 지표</caption>
              <thead><tr><th scope="col">날짜</th><th scope="col">활성 사용자</th><th scope="col">신규 가입</th>
                <th scope="col">공원 연결</th><th scope="col">경기 참여자</th></tr></thead>
              <tbody>{daily.map(row => <tr key={row.date}><th scope="row">{row.date}</th>
                <td>{number.format(row.activeUsers)}</td><td>{number.format(row.newUsers)}</td>
                <td>{number.format(row.connections)}</td><td>{number.format(row.players)}</td></tr>)}</tbody>
            </table></div>
          </>}
        </section>

        <section className="admin-analytics-block" aria-labelledby="admin-funnel-title">
          <h3 id="admin-funnel-title">가입 후 이용 흐름</h3>
          <p>선택 기간에 가입한 회원이 백업 시점까지 각 단계에 한 번이라도 도달한 인원입니다.</p>
          {selected?.funnelRows.length === 0 ? <p className="admin-analytics-empty">이 기간의 가입 흐름 기록이 없습니다.</p> :
            <ol className="admin-analytics-funnel">{funnelSteps.map(step => <li key={step.label}>
              <span>{step.label}</span><strong>{number.format(step.value)}명</strong>
              <span>{percent(step.value, funnelSteps[0].value)}</span>
            </li>)}</ol>}
        </section>

        <section className="admin-analytics-block" aria-labelledby="admin-games-title">
          <h3 id="admin-games-title">게임별 현황</h3>
          <p>시작·종료 확인은 두 기록이 모두 있는 경기입니다. 기권은 경기 수가 아닌 참가자 수를 기준으로 셉니다.</p>
          {games.length === 0 ? <p className="admin-analytics-empty">이 기간의 게임 기록이 없습니다.</p> :
            <div className="admin-analytics-scroll"><table>
              <caption>게임 시작일 기준 집계</caption>
              <thead><tr><th scope="col">게임</th><th scope="col">시작</th><th scope="col">종료 기록</th>
                <th scope="col">시작·종료 확인</th><th scope="col">종료율</th><th scope="col">기권 참여자</th>
                <th scope="col">참가자 기권율</th><th scope="col">평균 경기 시간</th></tr></thead>
              <tbody>{games.map(row => <tr key={row.gameCode}><th scope="row">{row.gameCode}</th>
                <td>{number.format(row.started)}</td><td>{number.format(row.ended)}</td>
                <td>{number.format(row.completed)}</td><td>{percent(row.completed, row.started)}</td>
                <td>{number.format(row.forfeits)} / {number.format(row.participants)}</td>
                <td>{percent(row.forfeits, row.participants)}</td>
                <td>{row.timedGames ? `${(row.durationSeconds / row.timedGames / 60).toFixed(1)}분` : '—'}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>
      </>}
    </>}
  </section>
}
