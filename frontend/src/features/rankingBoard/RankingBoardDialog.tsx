import { MenuDialog } from '../parkMenus/MenuDialog'
import closeIcon from '../parkMenus/icons/icon-close.svg'
import { closeRankingBoard, useRankingBoardEntry } from './model'
import { formatRankingUpdatedAt, rankingColumns } from './service'
import { useRankingBoardFeed } from './state'
import './rankingBoard.css'
import { displayNickname } from '../gameMaster/displayName'

export function RankingBoardDialog({ refresh }: { refresh(): void }) {
  const open = useRankingBoardEntry(state => state.open)
  const snapshot = useRankingBoardFeed(state => state.snapshot)
  const loading = useRankingBoardFeed(state => state.loading)
  const error = useRankingBoardFeed(state => state.error)
  const stale = useRankingBoardFeed(state => state.stale)
  if (!open) return null
  const columns = snapshot ? rankingColumns(snapshot) : []
  return <MenuDialog label="온탑 랭킹" className="ranking-board-dialog" backdropClassName="ranking-board-backdrop" onClose={closeRankingBoard}>
    <header className="ranking-board-dialog__header">
      <div><h2>온탑 랭킹</h2><p>서버가 열린 순간부터 쌓인 기록을 1분 단위로 집계해요.</p></div>
      <button type="button" data-autofocus className="park-menu-icon-button" aria-label="랭킹 닫기" onClick={closeRankingBoard}>
        <img src={closeIcon} alt="" />
      </button>
    </header>
    {!snapshot && loading && <p className="ranking-board-message" role="status">랭킹을 불러오고 있어요…</p>}
    {!snapshot && error && <p className="ranking-board-message ranking-board-message--error" role="alert">{error}
      <button type="button" disabled={loading} onClick={refresh}>다시 불러오기</button></p>}
    {snapshot && <>
      {stale && <p className="ranking-board-stale" role="status">새 집계를 불러오지 못해 이전 집계를 표시하고 있어요.</p>}
      <div className="ranking-board-scroll"><div className="ranking-board-columns" aria-label="랭킹 목록">
        {columns.map(column => <section className="ranking-board-column" key={column.key} aria-labelledby={`ranking-${column.key}`}>
          <header><h3 id={`ranking-${column.key}`}>{column.title}</h3><p>{column.description}</p></header>
          {column.rows.length ? <ol>
            {column.rows.map(row => <li key={row.userId}>
              <span className="ranking-board-rank" aria-label={`${row.rank}위`}>{row.rank}</span>
              <span className="ranking-board-nickname" title={displayNickname(row, row.nickname)}>{displayNickname(row, row.nickname)}</span>
              <strong>{row.value}</strong>
            </li>)}
          </ol> : <p className="ranking-board-empty">아직 기록이 없습니다.</p>}
        </section>)}
      </div></div>
      <footer className="ranking-board-dialog__footer">
        <time dateTime={snapshot.updatedAt}>마지막 집계 {formatRankingUpdatedAt(snapshot.updatedAt)}</time>
        <button type="button" disabled={loading} onClick={refresh}>{loading ? '불러오는 중…' : '새로 조회'}</button>
      </footer>
    </>}
  </MenuDialog>
}
