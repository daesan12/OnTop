import moleArt from '../mole/assets/mole.webp'
import type { SpeedMoleRankings as Rankings } from './service'

export function SpeedMoleTrophy() {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M14 8h20v12c0 7-4 11-10 11s-10-4-10-11V8Z" fill="currentColor" /><path d="M14 12H7v5c0 7 5 9 10 9M34 12h7v5c0 7-5 9-10 9M24 31v8M16 41h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="m24 12 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L24 12Z" fill="#254c39" /></svg>
}

/** Pure presentation: ranking positions and personal best always come from the server. */
export function SpeedMoleRankingBoard({ data, busy, error, offset, onLoad, onClose }: {
  data: Rankings | null; busy: boolean; error: string; offset: number
  onLoad: (offset: number) => void; onClose: () => void
}) {
  return <section className="speed-records">
    <header className="speed-records__heading">
      <div className="speed-records__title"><SpeedMoleTrophy /><div><span>온탑 오락실</span><h2 id="speed-mole-ranking-title">스피드 두더지 잡기 명예의 전당</h2></div></div>
      <button type="button" className="speed-records__close" onClick={onClose} aria-label="랭킹 닫기">×</button>
    </header>
    <div className="speed-records__body">
      <aside className="speed-records__personal" aria-label="내 최고 기록">
        <span className="speed-records__seal">나의 최고 기록</span>
        <div className="speed-records__mascot"><img src={moleArt} alt="" /></div>
        {data?.me ? <>
          <strong className="speed-records__my-score">{data.me.score.toLocaleString('ko-KR')}<small>점</small></strong>
          <span className="speed-records__my-rank">전체 <b>{data.me.rank.toLocaleString('ko-KR')}위</b></span>
          <dl><div><dt>성공</dt><dd>{data.me.hits.toLocaleString('ko-KR')}회</dd></div><div><dt>실수</dt><dd>{data.me.misses.toLocaleString('ko-KR')}회</dd></div></dl>
          <p>다음 한 판, 내 기록을 넘어봐요.</p>
        </> : <div className="speed-records__no-best"><strong>{busy ? '기록을 찾고 있어요' : error && !data ? '잠시 확인이 필요해요' : '첫 기록의 주인공이 되어봐요'}</strong><p>{error && !data ? '잠시 후 다시 불러와 주세요.' : '60초 도전을 끝내면\n이곳에 내 최고 기록이 남아요.'}</p></div>}
      </aside>
      <div className="speed-records__standings" aria-busy={busy}>
        <div className="speed-records__meta"><h3>전체 기록</h3><span>{data ? `${data.totalParticipants.toLocaleString('ko-KR')}명 도전` : '전체 기간'}</span></div>
        <p className="speed-records__rule">최고 점수 순 · 동점이면 실수가 적은 순</p>
        {error && <div className="speed-records__error" role="alert"><p>{error}</p><button type="button" onClick={() => onLoad(offset)} disabled={busy}>다시 불러오기</button></div>}
        {busy && <p className="speed-records__loading" role="status">기록판을 불러오고 있어요…</p>}
        {data && data.items.length > 0 ? <div key={offset} className="speed-records__scroll" tabIndex={0} role="region" aria-label="전체 랭킹 목록">
          <table className="speed-records__table"><caption>스피드 두더지 잡기 전체 랭킹. 점수와 실수가 같으면 공동 순위입니다.</caption>
            <colgroup><col className="speed-records__rank-col" /><col /><col className="speed-records__score-col" /><col className="speed-records__miss-col" /></colgroup>
            <thead><tr><th scope="col">순위</th><th scope="col">도전자</th><th scope="col">최고 점수</th><th scope="col">실수</th></tr></thead>
            <tbody>{data.items.map(item => <tr key={item.userId} data-me={item.userId === data.me?.userId} data-podium={item.rank <= 3 ? item.rank : undefined}>
              <td><span className="speed-records__place">{item.rank}</span></td>
              <th scope="row"><span className="speed-records__name" title={item.nickname}>{item.nickname}</span>{item.userId === data.me?.userId && <small className="speed-records__me">나</small>}</th>
              <td className="speed-records__score">{item.score.toLocaleString('ko-KR')}<small>점</small></td><td>{item.misses.toLocaleString('ko-KR')}<small>회</small></td>
            </tr>)}</tbody>
          </table>
        </div> : !busy && !error && <div className="speed-records__empty"><SpeedMoleTrophy /><strong>{offset > 0 ? '이 페이지에는 기록이 없어요' : '아직 비어 있는 기록판'}</strong><p>{offset > 0 ? '이전 페이지에서 다른 도전자들의 기록을 확인해 주세요.' : <>첫 번째 도전을 마치고<br />명예의 전당에 이름을 남겨보세요.</>}</p></div>}
        <nav className="speed-records__pagination" aria-label="랭킹 페이지">
          <button type="button" disabled={busy || offset === 0} onClick={() => onLoad(Math.max(0, offset - 20))} aria-label="이전 랭킹 페이지">‹ 이전</button>
          <span>{data?.items.length ? `${offset + 1}–${Math.min(offset + data.items.length, data.totalParticipants)}번째 기록` : busy ? '불러오는 중' : error ? '조회 확인 필요' : data?.totalParticipants ? '이 페이지에는 기록이 없어요' : '기록 없음'}</span>
          <button type="button" disabled={busy || !data?.hasMore} onClick={() => onLoad(offset + 20)} aria-label="다음 랭킹 페이지">다음 ›</button>
        </nav>
      </div>
    </div>
    <footer className="speed-records__footer"><p>점수·실수가 같으면 공동 순위로, 먼저 완료한 기록부터 표시해요.</p><button type="button" onClick={onClose}>게임으로 돌아가기</button></footer>
  </section>
}
