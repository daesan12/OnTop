export type HudJudgement = 'perfect' | 'good' | 'miss'

const feedbackText = {
  perfect: { label: 'PERFECT', message: '구구굿!' },
  good: { label: 'GOOD', message: '제법인데?' },
  miss: { label: 'MISS', message: '푸드덕ㅋㅋ' },
}

export function JumpRopeHud({ seconds, score, combo, chances, judgement, note }: {
  seconds: number
  score: number
  combo: number
  chances: number
  judgement?: HudJudgement
  note?: string
}) {
  const feedback = judgement && feedbackText[judgement]

  return (
    <div className="rope-hud" aria-label="줄넘기 HUD">
      <div className="rope-hud__stats">
        <dl className="rope-hud__card rope-hud__score">
          <div><dt>점수</dt><dd>{score}</dd></div>
          <div><dt>COMBO</dt><dd>×{combo}</dd></div>
        </dl>
        <dl className="rope-hud__card rope-hud__timer">
          <dt>남은 시간</dt>
          <dd>{seconds}<small>초</small></dd>
        </dl>
        <dl className="rope-hud__card rope-hud__chances">
          <dt>남은 기회</dt>
          <dd>
            <span className="rope-hud__feathers" aria-hidden="true">
              {[0, 1, 2].map(index => (
                <svg key={index} viewBox="0 0 20 22" data-filled={index < chances}>
                  <path d="M17 2C9 2 4 6 4 13c0 2 1 3 3 3 6 0 10-6 10-14Z" />
                  <path d="m3 20 8-10" fill="none" />
                </svg>
              ))}
            </span>
            <span>{chances}/3</span>
          </dd>
        </dl>
      </div>
      <div className="rope-hud__footer">
        <span className="rope-hud__place">탑골공원 놀이마당</span>
        <output className="rope-hud__feedback" data-judgement={judgement} aria-live="polite">
          {feedback ? <><strong>{feedback.label}</strong> {feedback.message}</> : note}
        </output>
      </div>
    </div>
  )
}
