import { useEffect, useRef } from 'react'
import type { GameState } from './game'
import { currentCard } from './game'
import { OrderDisplay, SkewerPreview } from './OrderDisplay'
import { nextRoundLabel, roundOutcome } from './presentation'

export function ArrowIcon() { return <svg className="sk-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg> }

export function RoundPanel({ state, next }: { state: GameState; next: () => void }) {
  const outcome = roundOutcome(state)
  const card = currentCard(state)
  const nextLabel = nextRoundLabel(state)
  return <section className={`sk-round-panel ${outcome.success ? 'sk-round-success' : 'sk-round-review'}`} aria-labelledby="sk-round-title">
    <div className="sk-outcome-mark" aria-hidden="true"><svg viewBox="0 0 48 48">{outcome.success ? <path d="m12 24 8 8 16-18" /> : <><circle cx="24" cy="24" r="15" /><path d="M24 15v11m0 7v.5" /></>}</svg></div>
    <h2 id="sk-round-title" tabIndex={-1}>{outcome.title}</h2><p className="sk-outcome-detail">{outcome.detail}</p>
    {card.kind === 'order' ? <div className="sk-comparison"><OrderDisplay recipe={card.recipe} actual={state.skewer} showSteps={false} />
      <figure className="sk-actual-example"><figcaption>내가 만든 꼬치</figcaption><SkewerPreview ids={state.skewer} label="내가 만든 꼬치" /></figure>
    </div> : null}
    <div className="sk-round-score"><span>현재 점수</span><strong>{state.score}<small>점</small></strong></div>
    <button className="sk-primary" onClick={next}>{nextLabel}<ArrowIcon /></button>
    <p className="sk-panel-note">{nextLabel === '최종 결과 보기' ? '마지막 주문까지 수고했어요. 오늘의 기록을 확인해보세요.' : card.kind === 'order' ? '다음 주문에서는 끝 재료부터 빼서 다시 사용할 수 있어요.' : '새 주문을 준비해볼까요?'}</p>
  </section>
}

export function PauseDialog({ resume }: { resume: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close() }, [])
  return <dialog className="sk-pause-dialog" ref={dialog} aria-labelledby="sk-pause-title" onCancel={event => { event.preventDefault(); resume() }}>
    <h2 id="sk-pause-title">잠시 쉬어가세요</h2><p>꼬치와 남은 시간을 그대로 보관했어요.<br />준비되면 이어서 만들어볼까요?</p><button className="sk-primary" autoFocus onClick={resume}>계속 만들기<ArrowIcon /></button>
  </dialog>
}
