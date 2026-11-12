import type { MouseEvent } from 'react'

export function JumpRopeMenu({ onStart, onOpenRanking, rankingOpen, startDisabled, status, onRetry }: {
  onStart: () => void
  onOpenRanking: (event: MouseEvent<HTMLButtonElement>) => void
  rankingOpen: boolean
  startDisabled?: boolean
  status?: string
  onRetry?: () => void
}) {
  return (
    <div className="rope-menu-layer" inert={rankingOpen}>
      <section className="rope-menu" aria-labelledby="rope-menu-title">
        <header>
          <p className="rope-menu__eyebrow" lang="en">ONTOP MINI GAME</p>
          <h2 id="rope-menu-title" className="rope-menu__title">
            <span className="rope-menu__title-call">구구구</span>{' '}
            <span className="rope-menu__title-game">줄넘기</span>
          </h2>
          <p className="rope-menu__intro">비둘기들이 당신을 시험합니다.</p>
        </header>
        <ul className="rope-menu__rules">
          <li>60초 생존</li>
          <li><kbd>SPACE</kbd> 점프</li>
          <li>MISS 3회 탈락</li>
        </ul>
        <div className="rope-menu__actions">
          <button type="button" className="rope-menu__start" onClick={onStart} disabled={startDisabled}>게임 시작</button>
          <button type="button" className="rope-menu__ranking" aria-haspopup="dialog" onClick={onOpenRanking}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v6m-4 0h8" />
            </svg>
            <span>랭킹 보기</span>
          </button>
          {status && <p className="rope-server-status" role="status">{status}</p>}
          {onRetry && <button type="button" className="rope-menu__ranking" onClick={onRetry}>기록 저장 다시 시도</button>}
        </div>
      </section>
    </div>
  )
}
