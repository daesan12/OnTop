import { useState } from 'react'
import { MenuDialog } from '../parkMenus/MenuDialog'
import closeIcon from '../parkMenus/icons/icon-close.svg'
import { RECORD_GAMES, RESULT_LABELS, type GameRecord, type RecordFilter } from './service'
import { useGameRecords } from './useGameRecords'
import './gameRecords.css'

const endedAt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export default function GameRecordsDialog({ onClose }: { onClose(): void }) {
  const [filter, setFilter] = useState<RecordFilter>('ALL')
  const feed = useGameRecords(filter), { history, stats } = feed
  return <MenuDialog label="내 전적" className="park-records-dialog" onClose={onClose}>
    <header className="park-records-header">
      <div><h2>내 전적</h2><p>공원에서 함께한 경기를 돌아보세요.</p></div>
      <button type="button" className="park-menu-icon-button" aria-label="내 전적 닫기" onClick={onClose}><img src={closeIcon} alt="" /></button>
    </header>
    <section className="park-records-stats" aria-label="게임별 전적" aria-busy={stats.loading}>
      <div className="park-records-heading"><h3>게임별 전적</h3><button className="park-records-text-button" disabled={history.loading || stats.loading} onClick={feed.refresh}>새로 조회</button></div>
      <p className="park-records-note">기권은 패배와 별도로 집계하며, 무효 경기는 전적에 포함하지 않아요.</p>
      {stats.loading && !stats.data && <p role="status" className="park-records-message">전적을 불러오고 있어요…</p>}
      {stats.error && <p className="park-records-error" role="alert">{stats.error}<button className="park-records-text-button" disabled={stats.loading} onClick={feed.retryStats}>전적 다시 조회</button></p>}
      {stats.data?.length === 0 && <p role="status" className="park-records-message">아직 집계된 전적이 없어요.</p>}
      {stats.data && stats.data.length > 0 && <ul className="park-records-stat-grid">{stats.data.map(stat => <li key={stat.gameCode} aria-label={`${RECORD_GAMES[stat.gameCode]} 전적`}>
        <h4>{RECORD_GAMES[stat.gameCode]}</h4><small>총 {stat.played.toLocaleString('ko-KR')}경기</small>
        <dl>{([['승리', stat.wins, 'WIN'], ['패배', stat.losses, 'LOSE'], ['무승부', stat.draws, 'DRAW'], ['기권', stat.forfeits, 'FORFEIT']] as const).map(([label, value, tone]) =>
          <div key={label} data-result={tone}><dt>{label}</dt><dd>{value.toLocaleString('ko-KR')}</dd></div>)}</dl>
      </li>)}</ul>}
    </section>
    <section className="park-records-history" aria-label="경기 내역" aria-busy={history.loading}>
      <h3>경기 내역</h3>
      <div className="park-records-filters" role="group" aria-label="경기 내역 게임 필터">{(['ALL', ...Object.keys(RECORD_GAMES)] as RecordFilter[]).map(code =>
        <button key={code} type="button" aria-pressed={filter === code} onClick={() => setFilter(code)}>{code === 'ALL' ? '전체' : RECORD_GAMES[code]}</button>)}</div>
      {history.loading && !history.data && <p role="status" className="park-records-message">경기 내역을 불러오고 있어요…</p>}
      {history.data?.items.length === 0 && <p role="status" className="park-records-message">{filter === 'ALL' ? '아직 종료된 경기 내역이 없어요.' : '선택한 게임의 경기 내역이 없어요.'}</p>}
      {history.data && history.data.items.length > 0 && <ol className="park-records-list" aria-label="경기 기록">{history.data.items.map(item => <RecordRow key={item.gameSessionId} item={item} />)}</ol>}
      {history.error && <p role="alert" className="park-records-error">{history.error}<button className="park-records-text-button" disabled={history.loading}
        onClick={() => { if (history.data?.hasNext) void feed.more(); else feed.retryHistory() }}>내역 다시 조회</button></p>}
      {history.data?.hasNext && <button className="park-menu-button park-records-more" disabled={history.loading} onClick={() => void feed.more()}>
        {history.loading ? '내역을 불러오는 중…' : '경기 내역 더 보기'}</button>}
      <p className="park-records-note park-records-footer">경기 결과와 정산 상태는 따로 표시해요. 종료 시각은 한국 시간 기준이에요.</p>
    </section>
  </MenuDialog>
}

function RecordRow({ item }: { item: GameRecord }) {
  return <li className="park-records-row">
    <div><strong>{RECORD_GAMES[item.gameCode]}</strong><time dateTime={item.endedAt}>{endedAt.format(new Date(item.endedAt))}</time></div>
    <div className="park-records-result"><span className="park-records-badge" data-result={item.status === 'INVALID' ? 'INVALID' : item.myResult ?? 'UNKNOWN'}>
      {item.status === 'INVALID' ? '무효' : item.myResult ? RESULT_LABELS[item.myResult] : '판정 없음'}</span>
      {item.status === 'INVALID' && item.myResult && <small>내 판정: {RESULT_LABELS[item.myResult]}</small>}</div>
    <span className="park-records-settlement" data-pending={item.settlementStatus !== 'SETTLED'}>
      {item.settlementStatus === 'SETTLED' ? item.status === 'INVALID' ? '반환 완료' : '정산 완료' : item.settlementStatus === 'PENDING' ? item.status === 'INVALID' ? '반환 대기' : '정산 대기' : '정산 미확인'}
    </span>
  </li>
}
