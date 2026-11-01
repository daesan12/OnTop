import { useEffect, useState } from 'react'
import { integer, record } from '../../network/protocol'
import { JumpmapMedal } from './JumpmapMedal'

export type RankingLoader = (signal: AbortSignal) => Promise<unknown>
interface Entry { rank: number; userId: string; nickname: string; finishMs: number; finishedAt: string }
const entry = (value: unknown): value is Entry => record(value) && integer(value.rank) && value.rank > 0
  && typeof value.userId === 'string' && typeof value.nickname === 'string' && integer(value.finishMs) && value.finishMs > 0
  && typeof value.finishedAt === 'string' && Number.isFinite(Date.parse(value.finishedAt))
export const jumpTime = (ms: number) => {
  const time = Math.max(0, Math.round(ms))
  const seconds = String(Math.floor(time / 1000) % 60).padStart(2, '0')
  return `${Math.floor(time / 60000)}분 ${seconds}.${String(time % 1000).padStart(3, '0')}초`
}
export function JumpmapRanking({ load }: { load?: RankingLoader }) {
  const [open, setOpen] = useState(false), [attempt, retry] = useState(0)
  const [state, setState] = useState<{ items: Entry[]; me: Entry | null; error: string; loading: boolean }>({ items: [], me: null, error: '', loading: false })
  useEffect(() => {
    if (!open || !load) return
    const abort = new AbortController()
    setState(s => ({ ...s, loading: true, error: '' }))
    void load(abort.signal).then(value => {
      if (!record(value) || !Array.isArray(value.items) || value.items.length > 50 || !value.items.every(entry)
        || value.me !== null && !entry(value.me)) throw new Error('랭킹 응답을 확인하지 못했어요.')
      if (!abort.signal.aborted) setState({ items: value.items as Entry[], me: value.me as Entry | null, error: '', loading: false })
    }).catch(() => { if (!abort.signal.aborted) setState(s => ({ ...s, loading: false, error: '랭킹을 불러오지 못했어요.' })) })
    return () => abort.abort()
  }, [open, load, attempt])
  return <section className="jm-ranking" aria-label="점프맵 타임어택 랭킹">
    <button className="paper-secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>타임어택 랭킹 {open ? '접기' : '보기'}</button>
    {open && <div className="jm-ranking-content">
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
    </div>}
  </section>
}
