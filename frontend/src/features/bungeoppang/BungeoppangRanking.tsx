import { useEffect, useRef, useState } from 'react'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useSession } from '../../network/worldClient'
import { appendRanking, BUNGEOPPANG_RANKINGS_ENABLED, fetchRanking, type RankingPage } from './ranking'
import './bungeoppangRanking.css'

export function useBungeoppangRanking(rulesVersion: string, refreshKey: string, active: boolean) {
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
    void Promise.resolve().then(() => request.signal.aborted ? null : fetchRanking(runtime.requestJSON, rulesVersion, ownId, request.signal)).then(result => {
      if (result && visit === generation.current) setData(result)
    }).catch(() => {
      if (visit === generation.current) setError('전체 랭킹을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.')
    }).finally(() => { clearTimeout(timer); if (visit === generation.current) setLoading(false) })
    return () => { ++generation.current; request.abort(); clearTimeout(timer); controller.current?.abort() }
  }, [enabled, ownId, rulesVersion, refreshKey, retry, runtime])
  const more = async () => {
    if (!data?.nextCursor || loading || !enabled) return
    const visit = generation.current, request = new AbortController(); controller.current = request
    const timer = setTimeout(() => request.abort(), 12000)
    setLoading(true); setError('')
    try {
      const next = await fetchRanking(runtime.requestJSON, rulesVersion, ownId, request.signal, data.nextCursor)
      if (visit === generation.current) setData(appendRanking(data, next))
    } catch { if (visit === generation.current) setError('다음 순위를 불러오지 못했어요. 다시 불러와 주세요.') }
    finally { clearTimeout(timer); if (visit === generation.current) setLoading(false) }
  }
  return { data, loading, error, enabled, ownId, more, retry: () => setRetry(value => value + 1) }
}
type Feed = ReturnType<typeof useBungeoppangRanking>
export function RankingMedal() {
  return <svg className="bung-ranking-medal" viewBox="0 0 90 105" aria-hidden="true">
    <path d="m26 66-7 35 24-13 25 13-7-35" fill="#bb6338" stroke="#bf974e" strokeWidth="2" />
    <path d="m33 69-6 24 16-9 17 9-6-24" fill="#dba64c" />
    <circle cx="45" cy="43" r="35" fill="#d4a64a" stroke="#b58437" strokeWidth="2" />
    <circle cx="45" cy="43" r="29" fill="#eac674" stroke="#fff0b8" strokeWidth="2" />
    <path d="m26 34 7 24h25l7-24-13 9-7-15-7 15Z" fill="#fff1bc" stroke="#a77a35" strokeWidth="1.5" />
    <circle cx="26" cy="33" r="3" fill="#fff1bc" /><circle cx="45" cy="27" r="3" fill="#fff1bc" /><circle cx="65" cy="33" r="3" fill="#fff1bc" />
  </svg>
}
export function RankingSummary({ feed, onOpen }: { feed: Feed; onOpen(): void }) {
  const { data, loading, enabled, error } = feed
  return <section className="bung-ranking-summary" aria-label="전체 랭킹 요약">
    <h3>전체 랭킹</h3>
    <div className="bung-ranking-preview"><RankingMedal /><div className="bung-ranking-position">
      <span className="bung-ranking-best">개인 최고 기록</span>
      <strong>{data?.me ? <>{data.me.rank}<small>위</small></> : '—'}<span>{data ? ` / ${data.totalParticipants}명` : ''}</span></strong>
      <small>{!enabled ? '전체 랭킹 준비 중' : loading && !data ? '순위를 확인하고 있어요' : error && !data ? '랭킹을 다시 확인해 주세요'
        : !data?.me ? '아직 등록된 최고 기록이 없어요' : '전체 기간 · 완성 개수와 실수 기준'}</small>
    </div><button className="bung-ranking-open" onClick={onOpen}>랭킹 보기 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></button></div>
  </section>
}
export function RankingDetails({ feed, onBack }: { feed: Feed; onBack(): void }) {
  const { data, loading, error, enabled, ownId } = feed
  return <section className="bung-ranking-details" aria-label="전체 랭킹 상세">
    <h2>붕어빵 전체 랭킹</h2><p className="paper-subtitle">따끈하게 쌓아 올린 우리들의 최고 기록</p>
    <div className="bung-result-ornament" aria-hidden="true">❖</div>
    <p className="bung-ranking-rule">완성 개수 많은 순 · 실수 적은 순<br />동점은 같은 순위, 먼저 완료한 기록부터 표시해요</p>
    <div className="bung-ranking-overview"><RankingMedal /><div><strong>{data ? `${data.totalParticipants.toLocaleString()}명` : '전체 기간'}</strong>
      <span>개인별 최고 기록 · 전체 기간</span></div>{data?.me && <b>내 순위 {data.me.rank}위</b>}</div>
    {!enabled ? <p className="bung-ranking-message" role="status">전체 랭킹을 준비하고 있어요.<br />준비가 끝나면 참여자들의 기록을 확인할 수 있어요.</p>
      : loading && !data ? <p className="bung-ranking-message" role="status">전체 랭킹을 불러오고 있어요…</p>
        : data && data.items.length === 0 ? <p className="bung-ranking-message" role="status">아직 등록된 기록이 없어요. 첫 도전을 기다리고 있어요!</p> : null}
    {data && data.items.length > 0 && <div className="bung-ranking-table-wrap"><table className="bung-ranking-table">
      <caption>전체 기간 개인 최고 기록 순위</caption><thead><tr><th scope="col">순위</th><th scope="col">참여자</th><th scope="col">완성</th><th scope="col">실수</th></tr></thead>
      <tbody>{data.items.map(item => <tr key={item.userId} data-own={item.userId === ownId}>
        <td><span className="bung-ranking-number" data-podium={item.rank <= 3}>{item.rank}<small>위</small></span></td>
        <th scope="row"><span>{item.nickname}{item.userId === ownId && <em>나</em>}</span><time dateTime={item.completedAt}>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(item.completedAt))} 완료</time></th>
        <td>{item.made}<small>개</small></td><td>{item.failed}<small>회</small></td>
      </tr>)}</tbody></table></div>}
    {error && <p className="paper-error" role="alert">{error}<button className="paper-text-button" disabled={loading} onClick={feed.retry}>랭킹 다시 확인</button></p>}
    {data?.nextCursor && <button className="bung-ranking-more" disabled={loading} onClick={() => void feed.more()}>{loading ? '불러오는 중…' : '다음 순위 더 보기'}</button>}
    {data && <p className="bung-ranking-updated">서버 확정 기록 기준 · 동점 다음 순위는 인원수만큼 건너뛰어요</p>}
    <button className="bung-ranking-back" onClick={onBack}>결과로 돌아가기</button>
  </section>
}
