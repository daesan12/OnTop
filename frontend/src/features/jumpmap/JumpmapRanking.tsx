import { useEffect, useState } from 'react'
import { parseJumpmapRankings, type JumpmapRankingEntry as Entry } from './ranking'
import { JumpmapMedal } from './JumpmapMedal'

export type RankingLoader = (signal: AbortSignal) => Promise<unknown>
export const jumpTime = (ms: number) => {
  const seconds=Math.floor(Math.max(0,ms)/1000)
  return `${Math.floor(seconds/60)}분 ${String(seconds%60).padStart(2,'0')}초`
}
export function JumpmapRanking({ load, onBack }: { load?: RankingLoader; onBack(): void }) {
  const [attempt, retry] = useState(0)
  const [state, setState] = useState<{ items: Entry[]; me: Entry | null; error: string; loading: boolean }>({ items: [], me: null, error: '', loading: !!load })
  useEffect(() => {
    if (!load) return
    const abort = new AbortController()
    setState(s => ({ ...s, loading: true, error: '' }))
    // A discarded StrictMode mount must not dispatch a duplicate ranking read.
    void Promise.resolve().then(() => abort.signal.aborted ? undefined : load(abort.signal)).then(value => {
      if (abort.signal.aborted) return
      const parsed = parseJumpmapRankings(value)
      if (!abort.signal.aborted) setState({ ...parsed, error: '', loading: false })
    }).catch(() => { if (!abort.signal.aborted) setState(s => ({ ...s, loading: false, error: '랭킹을 불러오지 못했어요.' })) })
    return () => abort.abort()
  }, [load, attempt])
  return <section className="jm-ranking" aria-label="점프맵 타임어택 랭킹">
    <header className="jm-ranking-heading"><JumpmapMedal rank={1}/><div><h2>돌탑 타임어택 랭킹</h2>
      <p>가장 빠른 완주에 도전해 보세요!</p></div></header>
    <div className="jm-ranking-content">
      <p>개인 최고 기록 · 동점은 공동 순위, 먼저 도착한 순서</p>
      {!load ? <p>미리보기에서는 실제 랭킹에 연결하지 않아요.</p> : state.loading ? <p role="status">랭킹 확인 중…</p>
        : state.error ? <p role="alert">{state.error} <button onClick={() => retry(value => value + 1)}>다시 확인</button></p>
          : <><div className="jm-my-record" aria-label="내 최고 기록"><JumpmapMedal rank={state.me?.rank}/>
            <div><span>개인 최고 기록</span>{state.me ? <><strong>{state.me.rank}<small>위</small></strong><time>{jumpTime(state.me.finishMs)}</time></>
              : <p>아직 등록된 내 완주 기록이 없어요.</p>}</div></div>
            {state.items.length ? <ol aria-label="완주 기록 순위" tabIndex={0}>{state.items.map(item => <li key={item.userId} data-own={item.userId === state.me?.userId}>
              <span className="jm-ranking-place">{item.rank <= 3 && <JumpmapMedal rank={item.rank}/>}<b>{item.rank}위</b></span>
              <span className="jm-ranking-name" title={item.nickname}>{item.nickname}</span><time>{jumpTime(item.finishMs)}</time></li>)}</ol>
              : <p>첫 완주 기록을 기다리고 있어요.</p>}</>}
    </div>
    <div className="paper-actions"><button className="paper-primary" onClick={onBack}>결과로 돌아가기</button></div>
  </section>
}
