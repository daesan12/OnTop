export type HudJudgement = 'perfect' | 'good' | 'miss'
export const hudFeedbackMs = 750

const feedbackText = {
  perfect: { label: 'PERFECT', message: '구구굿!' },
  good: { label: 'GOOD', message: '제법인데?' },
  miss: { label: 'MISS', message: '푸드덕ㅋㅋ' },
}

const comboMarks = 'M20 39 7 32m17 0-8-10m3 26-9 4m129-19 14-10m-11 21 10 1M34 65q47-13 96-5'

function TimerRays({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <svg className="rope-hud__timer-rays" data-mirrored={mirrored} viewBox="0 0 34 54" aria-hidden="true">
      <path d="m11 3 20 14-5 6L5 12zM2 25l24 4-1 7H1zM7 49l20-9 4 6-19 8z" />
    </svg>
  )
}

export function JumpRopeHud({ seconds, score, combo, chances, judgement, note, feedbackKey, sample }: {
  seconds: number
  score: number
  combo: number
  chances: number
  judgement?: HudJudgement
  note?: string
  feedbackKey?: string
  sample: boolean
}) {
  const feedback = judgement && feedbackText[judgement]
  const comboTier = combo >= 10 ? 'hot' : combo >= 5 ? 'streak' : 'base'

  return (
    <div className="rope-hud" aria-label="줄넘기 HUD">
      <div className="rope-hud__stats">
        <div className="rope-hud__card rope-hud__side rope-hud__score">
          <svg className="rope-hud__icon" viewBox="1 3 30 29" aria-hidden="true">
            <path d="M8 7h16v8a8 8 0 0 1-16 0zm6 14h4v5h4v3H10v-3h4z" />
            <path d="M8 10H3c0 5 3 8 7 8m14-8h5c0 5-3 8-7 8" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinejoin="round" />
          </svg>
          <dl>
            <dt>점수</dt>
            <dd key={score} data-scored={score > 0}>{score.toLocaleString('ko-KR')}</dd>
          </dl>
        </div>
        <dl className="rope-hud__card rope-hud__timer" data-urgent={seconds <= 10}>
          <dt>남은 시간</dt>
          <dd>
            <TimerRays />
            <span>{seconds}<small>초</small></span>
            <TimerRays mirrored />
          </dd>
        </dl>
        <div className="rope-hud__card rope-hud__side rope-hud__chances">
          <svg className="rope-hud__icon" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 28C12 24 2 17 2 11.6 2 3.8 11.3 1 16 7.6 20.7 1 30 3.8 30 11.6 30 17 20 24 16 28Z" />
          </svg>
          <dl>
            <dt>남은 기회</dt>
            <dd>
              <span>{chances}<small>/3</small></span>
              <span key={chances} className="rope-hud__slots" aria-hidden="true">
                {[0, 1, 2].map(index =>
                  <span key={index} data-filled={index < chances} data-spent={index === chances} />,
                )}
              </span>
            </dd>
          </dl>
        </div>
      </div>
      <dl className="rope-hud__combo" data-tier={comboTier}>
        <dt>PERFECT 콤보</dt>
        <dd>
          <svg className="rope-hud__combo-marks" viewBox="0 0 160 70" aria-hidden="true">
            <path d={comboMarks} />
            <path d={comboMarks} />
          </svg>
          <span className="rope-hud__combo-value"><small aria-hidden="true">×</small>{combo}</span>
        </dd>
      </dl>
      <div className="rope-hud__footer">
        <span className="rope-hud__place">{sample ? 'HUD 시안' : '탑골공원 놀이마당'}</span>
        <output className="rope-hud__feedback" aria-live="polite">
          {feedback && (
            <span key={feedbackKey ?? judgement} className="rope-hud__verdict" data-judgement={judgement}>
              <strong>{feedback.label}</strong><span>{feedback.message}</span>
            </span>
          )}
          {!feedback && note && <span className="rope-hud__note">{note}</span>}
        </output>
      </div>
    </div>
  )
}
