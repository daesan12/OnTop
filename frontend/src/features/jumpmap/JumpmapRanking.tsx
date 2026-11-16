import { useEffect, useState } from 'react'
import { PaperPopup } from '../tableLobby/PaperPopup'
import { parseJumpmapRankings, type JumpmapRankingEntry as Entry } from './ranking'
import { JumpmapMedal } from './JumpmapMedal'
import './jumpmapRanking.css'

export type RankingLoader = (signal: AbortSignal) => Promise<unknown>
export const jumpTime = (ms: number) => {
  const seconds=Math.floor(Math.max(0,ms)/1000)
  return `${Math.floor(seconds/60)}분 ${String(seconds%60).padStart(2,'0')}초`
}
const rankingTitle = '돌탑 타임어택 랭킹'

function rankingTime(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  const seconds = String(Math.floor(ms / 1000) % 60).padStart(2, '0')
  const milliseconds = String(ms % 1000).padStart(3, '0')
  return `${minutes}분 ${seconds}.${milliseconds}초`
}

export function JumpmapRankingDialog({ load, onBack, backLabel = '결과로 돌아가기' }: {
  load?: RankingLoader; onBack(): void; backLabel?: string
}) {
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
  return <PaperPopup title={null} label={rankingTitle} className="jm-ranking-paper" closeLabel="랭킹 닫기" onClose={onBack}>
    <section className="jm-ranking">
      <header className="jm-ranking-heading">
        <JumpmapMedal rank={1} />
        <div>
          <h2>{rankingTitle}</h2>
          <p>가장 빠른 완주 기록이 1위예요. 같은 기록은 공동 순위예요.</p>
        </div>
      </header>
      {!load ? <p className="jm-ranking-status">미리보기에서는 실제 랭킹에 연결하지 않아요.</p>
        : state.loading ? <p className="jm-ranking-status" role="status">랭킹 확인 중…</p>
        : state.error ? <div className="jm-ranking-status">
          <p role="alert">{state.error}</p>
          <button type="button" onClick={() => retry(value => value + 1)}>다시 확인</button>
        </div>
        : <>
          <section className="jm-my-record" aria-label="내 최고 기록">
            <h3>내 최고 기록</h3>
            {state.me ? <div><strong>{state.me.rank}위</strong><time>{rankingTime(state.me.finishMs)}</time></div>
              : <p>아직 등록된 내 완주 기록이 없어요.</p>}
          </section>
          {state.items.length > 0 ? <div className="jm-ranking-board">
            <div className="jm-ranking-columns" aria-hidden="true"><span>순위</span><span>도전자</span><span>완주 기록</span></div>
            <ol role="list" aria-label="완주 기록 순위" tabIndex={0}>
              {state.items.map(item => {
                const own = item.userId === state.me?.userId
                return <li key={item.userId} data-own={own}>
                  <span className="jm-ranking-place">{item.rank <= 3 && <JumpmapMedal rank={item.rank} />}<b>{item.rank}위</b></span>
                  <span className="jm-ranking-name" title={item.nickname}>{item.nickname}</span>
                  <time>{rankingTime(item.finishMs)}</time>
                </li>
              })}
            </ol>
          </div> : <p className="jm-ranking-status">첫 완주 기록을 기다리고 있어요.</p>}
        </>}
      <div className="paper-actions"><button type="button" className="paper-primary" onClick={onBack}>{backLabel}</button></div>
    </section>
  </PaperPopup>
}
