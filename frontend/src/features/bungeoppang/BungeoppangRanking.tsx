import { useEffect, useId, useRef, useState } from 'react'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useSession } from '../../network/worldClient'
import { appendRanking, BUNGEOPPANG_RANKINGS_ENABLED, fetchRanking, RankingScoreUnavailableError, type RankingPage } from './ranking'
import { PaperPopup } from '../tableLobby/PaperPopup'
import './bungeoppangRanking.css'

/** `durationMs` is the round's stored play length (v5 only), so a 3-minute round shows the 3-minute board. */
export function useBungeoppangRanking(rulesVersion: string, refreshKey: string, active: boolean, durationMs?: number) {
  const runtime = useParkRuntime(), ownId = useSession(s => s.sessionId)
  const [data, setData] = useState<RankingPage | null>(null), [loading, setLoading] = useState(false)
  const [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const generation = useRef(0), controller = useRef<AbortController | null>(null)
  const enabled = active && BUNGEOPPANG_RANKINGS_ENABLED && ['v4', 'v5'].includes(rulesVersion)
  useEffect(() => {
    const visit = ++generation.current
    setData(null); setError(''); setLoading(enabled)
    if (!enabled) return
    const request = new AbortController(); controller.current = request
    const timer = setTimeout(() => request.abort(), 12000)
    // A discarded StrictMode mount must not dispatch a duplicate ranking read.
    void Promise.resolve().then(() => request.signal.aborted ? null : fetchRanking(runtime.requestJSON, rulesVersion, ownId, request.signal, undefined, durationMs)).then(result => {
      if (result && visit === generation.current) setData(result)
    }).catch(cause => {
      if (visit === generation.current) setError(cause instanceof RankingScoreUnavailableError ? cause.message : '전체 랭킹을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.')
    }).finally(() => { clearTimeout(timer); if (visit === generation.current) setLoading(false) })
    return () => { ++generation.current; request.abort(); clearTimeout(timer); controller.current?.abort() }
  }, [enabled, ownId, rulesVersion, durationMs, refreshKey, retry, runtime])
  const more = async () => {
    if (!data?.nextCursor || loading || !enabled) return
    const visit = generation.current, request = new AbortController(); controller.current = request
    const timer = setTimeout(() => request.abort(), 12000)
    setLoading(true); setError('')
    try {
      const next = await fetchRanking(runtime.requestJSON, rulesVersion, ownId, request.signal, data.nextCursor, durationMs)
      if (visit === generation.current) setData(appendRanking(data, next))
    } catch (cause) { if (visit === generation.current) setError(cause instanceof RankingScoreUnavailableError ? cause.message : '다음 순위를 불러오지 못했어요. 다시 불러와 주세요.') }
    finally { clearTimeout(timer); if (visit === generation.current) setLoading(false) }
  }
  return { data, loading, error, enabled, ownId, more, retry: () => setRetry(value => value + 1) }
}
type Feed = ReturnType<typeof useBungeoppangRanking>
export function RankingMedal() {
  const gold = useId(), rim = useId()
  return <svg className="bung-ranking-medal" viewBox="0 0 90 105" aria-hidden="true">
    <defs>
      <linearGradient id={gold} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#fff0a9"/><stop offset=".45" stopColor="#e8b94b"/><stop offset="1" stopColor="#c58b26"/></linearGradient>
      <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f8dc7c"/><stop offset=".5" stopColor="#af751e"/><stop offset="1" stopColor="#edc65d"/></linearGradient>
    </defs>
    <path d="m26 66-7 35 24-13 25 13-7-35" fill="#bb6338" stroke="#bf974e" strokeWidth="2" />
    <path d="m33 69-6 24 16-9 17 9-6-24" fill="#dba64c" />
    <circle cx="45" cy="43" r="35" fill={`url(#${rim})`} stroke="#9b691c" strokeWidth="2" />
    <circle cx="45" cy="43" r="29" fill={`url(#${gold})`} stroke="#fff1b2" strokeWidth="2" />
    <circle cx="45" cy="43" r="25.5" fill="none" stroke="#b48127" strokeWidth=".8" strokeDasharray="1 3" />
    <g className="bung-ranking-fish" stroke="#99601f" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M31 33 24 27l-1 12-9-5 5 13-4 12 13-5c7 8 24 6 34-1 8-5 12-12 8-18-7-10-26-11-39-2Z" fill="#dda744" />
      <path d="M32 34c9-7 28-5 34 3 5 7-7 17-19 18-9 1-16-2-19-7Z" fill="#f4cf72" />
      <path d="m34 34 12 19m-4-23 13 20m-21-7 23-10m-18 18 25-11M28 40l-7-4m7 10-8 7m40-16-3 10" fill="none" stroke="#bb822b" strokeWidth="1.3" />
      <circle cx="64" cy="37" r="2" fill="#82501b" stroke="none" />
      <path d="m67 44 4-1M38 29l5-5 8 5" fill="none" />
    </g>
    <path d="m24 19 2-6 2 6 6 2-6 2-2 6-2-6-6-2Z" fill="#fff4bf" />
  </svg>
}
export function RankingSummary({ feed, onOpen }: { feed: Feed; onOpen(): void }) {
  const { data, loading, enabled, error } = feed
  return <section className="bung-ranking-summary" aria-label="전체 랭킹 요약">
    <h3>전체 랭킹</h3>
    <div className="bung-ranking-preview"><RankingMedal /><div className="bung-ranking-position">
      <span className="bung-ranking-best">개인 최고 점수</span>
      <strong>{data?.me ? <>{data.me.rank}<small>위</small></> : '—'}<span>{data ? ` / ${data.totalParticipants}명` : ''}</span></strong>
      <small>{!enabled ? '전체 랭킹 준비 중' : loading && !data ? '순위를 확인하고 있어요' : error && !data ? '랭킹을 다시 확인해 주세요'
        : !data?.me ? '아직 등록된 최고 점수가 없어요' : `최고 ${data.me.score.toLocaleString()}점 · 최대 ${data.me.maxCombo.toLocaleString()}콤보`}</small>
    </div><button className="bung-ranking-open" onClick={onOpen}>랭킹 보기 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></button></div>
  </section>
}
export function BungeoppangRankingDialog({ feed, onClose, backLabel }: {
  feed: Feed; onClose(): void; backLabel: string
}) {
  return <PaperPopup title="붕어빵 전체 랭킹" label="붕어빵 전체 랭킹" closeLabel="랭킹 닫기"
    onClose={onClose} className="bungeoppang-paper-result bungeoppang-ranking-popup">
    <RankingDetails feed={feed} onBack={onClose} backLabel={backLabel} />
  </PaperPopup>
}

function RankingDetails({ feed, onBack, backLabel }: { feed: Feed; onBack(): void; backLabel: string }) {
  const { data, loading, error, enabled, ownId } = feed
  return <section className="bung-ranking-details" aria-label="전체 랭킹 상세">
    <h2>붕어빵 전체 랭킹</h2><p className="paper-subtitle">따끈하게 쌓아 올린 우리들의 최고 기록</p>
    <div className="bung-result-ornament" aria-hidden="true">❖</div>
    <p className="bung-ranking-rule">개인 최고 점수 → 해당 경기의 최대 연속 콤보 순<br />두 값이 같으면 공동 순위, 먼저 완료한 기록부터 표시해요</p>
    <div className="bung-ranking-overview"><RankingMedal /><div><strong>{data ? `${data.totalParticipants.toLocaleString()}명` : '전체 기간'}</strong>
      <span>개인별 최고 점수 · 전체 기간</span></div>{data?.me && <b>내 순위 {data.me.rank}위</b>}</div>
    {!enabled ? <p className="bung-ranking-message" role="status">전체 랭킹을 준비하고 있어요.<br />준비가 끝나면 참여자들의 기록을 확인할 수 있어요.</p>
      : loading && !data ? <p className="bung-ranking-message" role="status">전체 랭킹을 불러오고 있어요…</p>
        : data && data.items.length === 0 ? <p className="bung-ranking-message" role="status">아직 등록된 기록이 없어요. 첫 도전을 기다리고 있어요!</p> : null}
    {data && data.items.length > 0 && <div className="bung-ranking-table-wrap"><table className="bung-ranking-table">
      <caption>전체 기간 개인 최고 점수와 최대 연속 콤보 순위</caption><thead><tr><th scope="col">순위</th><th scope="col">참여자</th><th scope="col">점수</th><th scope="col">최대 콤보</th></tr></thead>
      <tbody>{data.items.map(item => <tr key={item.userId} data-own={item.userId === ownId}>
        <td><span className="bung-ranking-number" data-podium={item.rank <= 3}>{item.rank}<small>위</small></span></td>
        <th scope="row"><span>{item.nickname}{item.userId === ownId && <em>나</em>}</span><time dateTime={item.completedAt}>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(item.completedAt))} 완료</time></th>
        <td>{item.score.toLocaleString()}<small>점</small></td>
        <td>{item.maxCombo.toLocaleString()}<small>콤보</small></td>
      </tr>)}</tbody></table></div>}
    {error && <p className="paper-error" role="alert">{error}<button className="paper-text-button" disabled={loading} onClick={feed.retry}>랭킹 다시 확인</button></p>}
    {data?.nextCursor && <button className="bung-ranking-more" disabled={loading} onClick={() => void feed.more()}>{loading ? '불러오는 중…' : '다음 순위 더 보기'}</button>}
    <button className="bung-ranking-back" onClick={onBack}>{backLabel}</button>
  </section>
}
