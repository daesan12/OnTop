import { useEffect, useRef, useState } from 'react'
import moleArt from './assets/mole.webp'
import { SpeedMoleTrophy } from '../speedMole/SpeedMoleRankingBoard'
import { RANKING_PAGE_SIZE, type MoleRankings } from './protocol'
import { loadMoleRankings } from './store'
import '../speedMole/speed-mole-menus.css'
import './mole-rankings.css'

const number = (value: number) => value.toLocaleString('ko-KR')

/** 한 페이지 조회. 늦게 도착한 이전 요청은 버린다. */
function useMoleRankings(refreshKey: string) {
  const [data, setData] = useState<MoleRankings | null>(null)
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const request = useRef(0)
  const load = async (from: number) => {
    const current = ++request.current
    setBusy(true); setError('')
    try { const value = await loadMoleRankings(from); if (request.current === current) { setData(value); setOffset(from) } }
    catch (e) { if (request.current === current) setError(e instanceof Error ? e.message : '랭킹을 불러오지 못했어요.') }
    finally { if (request.current === current) setBusy(false) }
  }
  useEffect(() => { void load(0); return () => { ++request.current } }, [refreshKey])
  return { data, offset, busy, error, load }
}

/** 결과 카드의 순위 요약. 방금 정산한 판이 반영된 서버 순위를 다시 읽는다. */
export function MoleRankSummary({ refreshKey, onOpen }: { refreshKey: string; onOpen: () => void }) {
  const { data, busy, error } = useMoleRankings(refreshKey)
  return <section className="mole-rank-summary" aria-label="전체 랭킹 요약">
    <div>
      <span>개인 최고 점수</span>
      <strong>{data?.me ? <>{number(data.me.rank)}<small>위</small></> : '—'}{data && <em> / {number(data.totalParticipants)}명</em>}</strong>
      <small>{busy && !data ? '순위를 확인하고 있어요' : error && !data ? '랭킹을 다시 확인해 주세요'
        : !data?.me ? '아직 등록된 최고 점수가 없어요' : `최고 ${number(data.me.score)}점 · 최대 ${number(data.me.maxCombo)}콤보`}</small>
    </div>
    <button type="button" onClick={onOpen}>랭킹 보기 ›</button>
  </section>
}

/** 스피드 두더지 명예의 전당과 같은 판에 두더지 잡기 기록을 보여 준다. */
export function MoleRankingDialog({ onClose }: { onClose: () => void }) {
  const { data, offset, busy, error, load } = useMoleRankings('dialog')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  return <dialog ref={dialog} className="speed-mole__ranking-dialog mole-ranking-dialog" aria-labelledby="mole-ranking-title"
    onCancel={event => { event.preventDefault(); onClose() }}>
    <section className="speed-records">
      <header className="speed-records__heading">
        <div className="speed-records__title"><SpeedMoleTrophy /><div><span>온탑 오락실</span><h2 id="mole-ranking-title">두더지 잡기 명예의 전당</h2></div></div>
        <button type="button" className="speed-records__close" onClick={onClose} aria-label="랭킹 닫기">×</button>
      </header>
      <div className="speed-records__body">
        <aside className="speed-records__personal" aria-label="내 최고 기록">
          <span className="speed-records__seal">나의 최고 기록</span>
          <div className="speed-records__mascot"><img src={moleArt} alt="" /></div>
          {data?.me ? <>
            <strong className="speed-records__my-score">{number(data.me.score)}<small>점</small></strong>
            <span className="speed-records__my-rank">전체 <b>{number(data.me.rank)}위</b></span>
            <dl><div><dt>최대 콤보</dt><dd>{number(data.me.maxCombo)}</dd></div><div><dt>잡은 두더지</dt><dd>{number(data.me.caught)}</dd></div></dl>
            <p>다음 한 판, 내 기록을 넘어봐요.</p>
          </> : <div className="speed-records__no-best"><strong>{busy ? '기록을 찾고 있어요' : error && !data ? '잠시 확인이 필요해요' : '첫 기록의 주인공이 되어봐요'}</strong><p>{error && !data ? '잠시 후 다시 불러와 주세요.' : '90초 도전을 끝내면\n이곳에 내 최고 기록이 남아요.'}</p></div>}
        </aside>
        <div className="speed-records__standings" aria-busy={busy}>
          <div className="speed-records__meta"><h3>전체 기록</h3><span>{data ? `${number(data.totalParticipants)}명 도전` : '전체 기간'}</span></div>
          <p className="speed-records__rule">최고 점수 순 · 동점이면 최대 콤보가 높은 순</p>
          {error && <div className="speed-records__error" role="alert"><p>{error}</p><button type="button" onClick={() => void load(offset)} disabled={busy}>다시 불러오기</button></div>}
          {busy && <p className="speed-records__loading" role="status">기록판을 불러오고 있어요…</p>}
          {data && data.items.length > 0 ? <div key={offset} className="speed-records__scroll" tabIndex={0} role="region" aria-label="전체 랭킹 목록">
            <table className="speed-records__table"><caption>두더지 잡기 전체 랭킹. 점수와 최대 콤보가 같으면 공동 순위입니다.</caption>
              <colgroup><col className="speed-records__rank-col" /><col /><col className="speed-records__score-col" /><col className="speed-records__miss-col" /></colgroup>
              <thead><tr><th scope="col">순위</th><th scope="col">도전자</th><th scope="col">최고 점수</th><th scope="col">콤보</th></tr></thead>
              <tbody>{data.items.map(item => <tr key={item.userId} data-me={item.userId === data.me?.userId} data-podium={item.rank <= 3 ? item.rank : undefined}>
                <td><span className="speed-records__place">{item.rank}</span></td>
                <th scope="row"><span className="speed-records__name" title={item.nickname}>{item.nickname}</span>{item.userId === data.me?.userId && <small className="speed-records__me">나</small>}</th>
                <td className="speed-records__score">{number(item.score)}<small>점</small></td><td>{number(item.maxCombo)}</td>
              </tr>)}</tbody>
            </table>
          </div> : !busy && !error && <div className="speed-records__empty"><SpeedMoleTrophy /><strong>{offset > 0 ? '이 페이지에는 기록이 없어요' : '아직 비어 있는 기록판'}</strong><p>{offset > 0 ? '이전 페이지에서 다른 도전자들의 기록을 확인해 주세요.' : <>첫 번째 도전을 마치고<br />명예의 전당에 이름을 남겨보세요.</>}</p></div>}
          <nav className="speed-records__pagination" aria-label="랭킹 페이지">
            <button type="button" disabled={busy || offset === 0} onClick={() => void load(Math.max(0, offset - RANKING_PAGE_SIZE))} aria-label="이전 랭킹 페이지">‹ 이전</button>
            <span>{data?.items.length ? `${offset + 1}–${Math.min(offset + data.items.length, data.totalParticipants)}번째 기록` : busy ? '불러오는 중' : error ? '조회 확인 필요' : data?.totalParticipants ? '이 페이지에는 기록이 없어요' : '기록 없음'}</span>
            <button type="button" disabled={busy || !data?.hasMore} onClick={() => void load(offset + RANKING_PAGE_SIZE)} aria-label="다음 랭킹 페이지">다음 ›</button>
          </nav>
        </div>
      </div>
      <footer className="speed-records__footer"><p>점수·최대 콤보가 같으면 공동 순위로, 먼저 달성한 기록부터 표시해요.</p><button type="button" onClick={onClose}>게임으로 돌아가기</button></footer>
    </section>
  </dialog>
}
