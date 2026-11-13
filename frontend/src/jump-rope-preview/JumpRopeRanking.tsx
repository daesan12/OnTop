import { useEffect, useRef, type KeyboardEvent } from 'react'
import { topJumpRopeEntries, type JumpRopeRankingState } from './jumpRopeRankingData'
import './ranking.css'

const scoreFormat = new Intl.NumberFormat('ko-KR')

export function JumpRopeRanking({ state, onClose }: {
  state: JumpRopeRankingState
  onClose: () => void
}) {
  const title = useRef<HTMLHeadingElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { title.current?.focus({ preventScroll: true }) }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }

    if (event.key !== 'Tab') return
    const first = list.current ?? closeButton.current
    const last = closeButton.current
    if (event.shiftKey && (event.target === title.current || event.target === first)) {
      event.preventDefault()
      last?.focus({ preventScroll: true })
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault()
      first?.focus({ preventScroll: true })
    }
  }

  const entries = state.kind === 'ready' ? (state.serverRanked ? state.entries : topJumpRopeEntries(state.entries)) : []
  const best = state.kind === 'ready' ? state.personalBest : undefined

  return (
    <div className="rope-ranking-layer">
      <section className="rope-ranking" role="dialog" aria-modal="true" aria-labelledby="rope-ranking-title" onKeyDown={handleKeyDown}>
        <header className="rope-ranking__titlebar">
          <h2 id="rope-ranking-title" ref={title} tabIndex={-1}>구구구 랭킹</h2>
        </header>

        {entries.length > 0 ? (
          <div className="rope-ranking__list" ref={list} tabIndex={0} role="region" aria-label="최고 점수 TOP 10">
            <table>
              <colgroup><col className="rope-ranking__rank-col" /><col /><col className="rope-ranking__score-col" /></colgroup>
              <thead><tr><th scope="col">순위</th><th scope="col">닉네임</th><th scope="col">최고 점수</th></tr></thead>
              <tbody>
                {entries.map(({ nickname, score, rank }, index) => (
                  <tr key={`${nickname}-${index}`}>
                    <td><span className="rope-ranking__place" data-place={rank ?? index + 1}>{rank ?? index + 1}</span></td>
                    <td><span className="rope-ranking__name" title={nickname}>{nickname}</span></td>
                    <td>{scoreFormat.format(score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rope-ranking__message" role="status">
            {state.kind === 'loading' ? '랭킹을 불러오는 중입니다.'
              : state.kind === 'error' ? '랭킹 정보를 가져오지 못했습니다.'
                : '아직 등록된 기록이 없습니다.'}
          </p>
        )}

        <footer className="rope-ranking__footer">
          <dl className="rope-ranking__best">
            <dt>내 최고 기록</dt>
            <dd>{best ? `${scoreFormat.format(best.score)}점${best.rank === undefined ? '' : ` · ${best.rank}위`}` : '기록 확인 불가'}</dd>
          </dl>
          <button type="button" className="rope-ranking__close" ref={closeButton} onClick={onClose}>닫기</button>
        </footer>
      </section>
    </div>
  )
}
