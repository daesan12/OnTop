import { MenuDialog } from '../parkMenus/MenuDialog'
import { rankingPage, selectDetailPage, useRankingPages } from './pages'
import closeIcon from '../parkMenus/icons/icon-close.svg'
import { closeRankingBoard, useRankingBoardEntry } from './model'
import { formatRankingUpdatedAt, rankingColumns } from './service'
import { useRankingBoardFeed } from './state'
import './rankingBoard.css'
import { displayNickname } from '../gameMaster/displayName'
import { RankingEmblem } from './RankingEmblem'

export function RankingBoardDialog({ refresh }: { refresh(): void }) {
  const open = useRankingBoardEntry(state => state.open)
  const snapshot = useRankingBoardFeed(state => state.snapshot)
  const loading = useRankingBoardFeed(state => state.loading)
  const error = useRankingBoardFeed(state => state.error)
  const stale = useRankingBoardFeed(state => state.stale)
  const page = useRankingPages(state => state.detailPage)
  const onPageKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.target instanceof HTMLElement && event.target.classList.contains('ranking-board-list')) {
        const list = event.target
        const scroll = event.key === 'ArrowDown' ? 40 : event.key === 'ArrowUp' ? -40
          : event.key === 'PageDown' || event.code === 'Space' && !event.shiftKey ? list.clientHeight * .85
          : event.key === 'PageUp' || event.code === 'Space' && event.shiftKey ? -list.clientHeight * .85
          : event.key === 'Home' ? -list.scrollHeight : event.key === 'End' ? list.scrollHeight : 0
        if (scroll) { event.preventDefault(); list.scrollTop += scroll; return }
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault(); event.stopPropagation()
      selectDetailPage(useRankingPages.getState().detailPage + (event.key === 'ArrowRight' ? 1 : -1))
  }
  if (!open) return null
  const columns = snapshot ? rankingPage(rankingColumns(snapshot), page) : []
  return <MenuDialog label="온탑 랭킹" className="ranking-board-dialog" backdropClassName="ranking-board-backdrop" onClose={closeRankingBoard} onOwnedKeyDown={onPageKey}>
    <header className="ranking-board-dialog__header">
      <span className="ranking-board-seal"><RankingEmblem kind="trophy" /></span>
      <div className="ranking-board-intro"><h2>온탑 랭킹</h2><p>공원과 오락실의 최고 기록을 만나보세요.</p></div>
      <button type="button" data-autofocus className="ranking-board-close" aria-label="랭킹 닫기" onClick={closeRankingBoard}>
        <img src={closeIcon} alt="" />
      </button>
    </header>
    {!snapshot && loading && <p className="ranking-board-message" role="status">랭킹을 불러오고 있어요…</p>}
    {!snapshot && error && <p className="ranking-board-message ranking-board-message--error" role="alert">{error}
      <button type="button" disabled={loading} onClick={refresh}>다시 불러오기</button></p>}
    {snapshot && <>
      {stale && <p className="ranking-board-stale" role="status">새 집계를 불러오지 못해 이전 집계를 표시하고 있어요.</p>}
      <nav className="ranking-board-pages" aria-label="랭킹 페이지">
        <button type="button" onClick={() => selectDetailPage(page - 1)} aria-label="이전 랭킹 페이지">‹</button>
        {[0, 1].map(value => <button type="button" className="ranking-board-page-tab" key={value} aria-current={value === page ? 'page' : undefined} onClick={() => selectDetailPage(value)}><small>{value + 1} / 2</small><span>{value === 0 ? '공원 · 오락실' : '도전 · 요리'}</span></button>)}
        <button type="button" onClick={() => selectDetailPage(page + 1)} aria-label="다음 랭킹 페이지">›</button>
      </nav>
      <div className="ranking-board-scroll"><div key={page} className={`ranking-board-columns ranking-board-columns--${columns.length}`} aria-label="랭킹 목록">
        {columns.map(column => <section className="ranking-board-column" key={column.key} aria-labelledby={`ranking-${column.key}`}>
          <header><span className="ranking-board-category-icon"><RankingEmblem kind={column.key} /></span><div><h3 id={`ranking-${column.key}`}>{column.title}</h3><p>{column.description}</p></div></header>
          {column.rows.length ? <ol className="ranking-board-list" tabIndex={0} aria-label={`${column.title} 순위 목록`}>
            {column.rows.map(row => <li key={row.userId} data-place={row.rank <= 3 ? row.rank : undefined}>
              <span className="ranking-board-rank" aria-label={`${row.rank}위`}>{row.rank}</span>
              <span className="ranking-board-nickname" title={row.nickname}>{row.members ? row.members.map((member, i) => <span className="ranking-board-member" key={i}><span className="ranking-board-member-name">{displayNickname(member, member.nickname)}</span>{member.vr && <small className="ranking-vr-badge">VR</small>}</span>) : displayNickname(row, row.nickname)}</span>
              <strong>{row.value}</strong>
            </li>)}
          </ol> : <p className="ranking-board-empty">아직 기록이 없습니다.</p>}
        </section>)}
      </div></div>
      <footer className="ranking-board-dialog__footer">
        <div><time dateTime={snapshot.updatedAt}>마지막 집계 {formatRankingUpdatedAt(snapshot.updatedAt)}</time><p className="ranking-board-notice">1분마다 집계 · GM은 이벤트 랭킹에서 제외</p></div>
        <span className="ranking-board-keys"><kbd>←</kbd><kbd>→</kbd> 페이지 <kbd>Esc</kbd> 닫기</span>
        <button type="button" disabled={loading} onClick={refresh}>{loading ? '불러오는 중…' : '새로 조회'}</button>
      </footer>
    </>}
  </MenuDialog>
}
