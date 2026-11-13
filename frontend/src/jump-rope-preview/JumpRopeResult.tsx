import { useEffect, useId, useRef, type MouseEventHandler, type ReactNode } from 'react'
import type { RoundEndReason, RoundStats } from './jumpRopeRules'

const verdicts = [['perfect', 'PERFECT'], ['good', 'GOOD'], ['miss', 'MISS']] as const

function VictoryCrest() {
  return (
    <svg className="rope-result__crest" viewBox="0 0 108 57" aria-hidden="true">
      <path className="rope-result__crest-rays" d="m18 20-6-8m3 17-10-5m85-4 6-8m-3 17 10-5" />
      <path className="rope-result__crest-cup" d="M29 13H16c0 19 8 26 19 26h38c11 0 19-7 19-26H79M30 8Q54 1 78 8v11c0 15-9 23-20 25v6h10v5H40v-5h10v-6c-11-2-20-10-20-25Z" />
      <path className="rope-result__crest-star" d="m54 13 3.5 7.3 8.1 1.1-5.8 5.8 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.8 8.1-1.1Z" />
    </svg>
  )
}

function ResultPigeon({ mood, side }: { mood: 'snicker' | 'resigned'; side: 'middle' | 'left' | 'right' }) {
  const snicker = mood === 'snicker'
  return (
    <svg className="rope-result__pigeon" data-side={side} viewBox="0 0 104 84" aria-hidden="true">
      <g transform={side === 'right' ? 'translate(104) scale(-1 1)' : undefined}>
        <path fill="#596773" d="m28 56-15 5L3 51l18-2 13 4Z" />
        <path fill="#82909a" stroke="#2f403f" strokeWidth="2.2" d="M14 56c4-13 19-22 36-19 11 2 22 10 24 19 2 11-8 18-21 19-20 3-45-6-39-19Z" />
        <path fill="#bbc0c1" d="m41 44 21 6 9 11-11 9-15 1-11-10Z" />
        <path fill="#646f80" d="M34 48c-9 0-19 7-19 14 1 9 16 10 29 6l-2-8 5-3-6-7Z" />
        <path fill="#9aa4ae" d="m17 60 10-9 12 1-7 8-7 4Z" />
        <path fill={snicker ? '#82778e' : side === 'left' ? '#758980' : '#8a7e90'} d="m38 38 26-2 4 13-11 9-18-7Z" />
        <g transform={snicker ? 'rotate(-9 57 38)' : 'rotate(29 55 40)'}>
          <path fill="#65737e" stroke="#2f403f" strokeWidth="2.1" d="M33 31C34 17 47 9 60 11c14 2 25 13 24 26-2 12-12 18-25 18-15 0-27-8-26-24Z" />
          <path fill="#89959e" d="m36 28 9-11 14-4 14 7-13 1-11 8Z" />
          {snicker ? <>
            <path d="m48 31 7 1-5 4m24-9-7 3 6 3" fill="none" stroke="#23312f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path fill="#46312e" stroke="#2a3837" strokeWidth="1.5" d="m58 41 25-4c-2 9-7 15-14 13-5 0-9-3-11-9Z" />
            <path fill="#b77e68" d="M66 47q5-5 11-4l-4 5Z" />
          </> : <>
            <path d="M49 35q4 3 9 1m8 1q4 3 8 1" fill="none" stroke="#263633" strokeWidth="2.4" strokeLinecap="round" />
            <path fill="#aa8860" d="m66 45 14-2-6 6Z" />
          </>}
          <path fill="#d5b68a" d="M57 39c5-4 14-7 22-6l9 6-10 3-15 1Z" />
        </g>
        <path d="m40 73-2 5m16-5 1 5m-20 0h7m10 0h7" stroke="#956e61" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  )
}

function ResultCardStains() {
  const rough = useId()
  return (
    <svg className="rope-result__card-stains" viewBox="0 0 260 260" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id={rough} x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency=".075" numOctaves="3" seed="19" result="edge" />
          <feDisplacementMap in="SourceGraphic" in2="edge" scale="5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${rough})`}>
        <path fill="#786446" opacity=".42" d="M0 0h81c-4 7-19 10-31 13-5 4-8 14-17 15-8-1-7 6-12 16L9 70 8 48 0 40ZM260 96v54l-8 10-5-19c-6-9-19-8-13-17 6-8 17-10 26-28ZM0 217c6 14 25 15 29 23 5 6 10 5 19 9l-20 11H0Z" />
        <path fill="#625031" opacity=".94" d="M0 0h68c-4 8-17 7-24 10-5 3-4 9-11 12-7 4-11-3-15 5-4 6-3 17-7 21-3 3-6-3-6-10L0 31ZM260 111v31l-6 5-3-11-13-7 5-7 10-4ZM0 229c7 10 20 7 24 18 1 4 8 3 13 8l-14 5H0Z" />
        <path fill="#99805a" opacity=".59" d="M7 7q20-5 42-4L27 8 15 16 7 26Zm245 119 8-9v10l-6 7ZM3 236q12 4 17 11l-16-6Z" />
        <path fill="#56482d" opacity=".72" d="m26 31 5 1-2 6-3-1Zm-7 17 3 3-1 5-3-2Zm218 94 4 1 1 5-4-2ZM29 236l4 1 2 4-5-1Z" />
      </g>
    </svg>
  )
}

export function JumpRopeResult({ reason, stats, reward, onQuit, onRestart, onOpenRanking, rankingOpen, status, onRetry, restartDisabled }: {
  reason: RoundEndReason
  stats?: Pick<RoundStats, 'score' | 'counts'>
  reward?: number | null
  onQuit: () => void
  onRestart: () => void
  onOpenRanking: MouseEventHandler<HTMLButtonElement>
  rankingOpen?: boolean
  status?: string
  onRetry?: () => void
  restartDisabled?: boolean
}) {
  const completed = reason === 'time'
  let rewardLine: ReactNode = null
  if (reward !== undefined && !completed) {
    rewardLine = '3회 MISS로 엽전이 지급되지 않았어요.'
  } else if (typeof reward === 'number') {
    rewardLine = <>획득 엽전 <strong>{reward > 0 ? '+' : ''}{reward.toLocaleString('ko-KR')}냥</strong></>
  }
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [])

  return (
    <div className="rope-result-layer" inert={rankingOpen}>
      <section className="rope-result" data-outcome={completed ? 'complete' : 'failed'} aria-labelledby="rope-result-title">
        {!completed && <ResultCardStains />}
        <div className="rope-result__ornaments" aria-hidden="true">
          {completed ? <><ResultPigeon mood="resigned" side="left" /><VictoryCrest /><ResultPigeon mood="resigned" side="right" /></>
            : <ResultPigeon mood="snicker" side="middle" />}
        </div>
        <header className="rope-result__hero">
          <h2 id="rope-result-title" ref={headingRef} tabIndex={-1} className="rope-result__title">
            {completed ? <><span>비둘기들이</span>{' '}<span>인정한 인간</span></> : '게임 오버'}
          </h2>
        </header>
        <dl className="rope-result__score">
          <dt>최종 점수</dt>
          <dd><span>{stats?.score.toLocaleString('ko-KR') ?? '—'}</span></dd>
        </dl>
        <div className="rope-result__details">
          <dl className="rope-result__verdicts">
            {verdicts.map(([kind, label]) => (
              <div key={kind}><dt>{label}</dt><dd>{stats ? `${stats.counts[kind]}회` : '—'}</dd></div>
            ))}
          </dl>
          {rewardLine && <p className="rope-result__reward">{rewardLine}</p>}
        </div>
        {status && <p className="rope-server-status" role="status">{status}</p>}
        {onRetry && <button type="button" className="rope-result__quit" onClick={onRetry}>기록 저장 다시 시도</button>}
        <div className="rope-result__actions">
          <button type="button" className="rope-result__quit" onClick={onQuit}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4H5v16h7m-2-8h11m-4-4 4 4-4 4" /></svg>
            그만하기
          </button>
          <button type="button" className="rope-result__restart" onClick={onRestart} disabled={restartDisabled}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 9a8 8 0 1 0 .2 5M20 4v5h-5" /></svg>
            다시 시작
          </button>
          <button type="button" className="rope-result__ranking" aria-haspopup="dialog" onClick={onOpenRanking}>
            랭킹 보기
          </button>
        </div>
      </section>
    </div>
  )
}
