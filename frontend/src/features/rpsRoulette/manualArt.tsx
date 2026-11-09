import { useId } from 'react'
import { HANDS, HAND_LABEL } from './ledHands'
import { ROULETTE } from './protocol'
import { LedHand, RouletteFace } from './RouletteFace'

const Led = ({ hand }: { hand: (typeof HANDS)[number] }) => {
  const id = useId().replace(/:/g, '')
  return <svg width="96" height="96" viewBox="0 0 200 200" aria-hidden="true">
    <defs><pattern id={`${id}f`} width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.9" fill="#a3261d" /></pattern></defs>
    <circle cx="100" cy="100" r="96" fill="#2a0404" stroke="#ffd23f" strokeWidth="5" />
    <LedHand shape={hand} fill={`url(#${id}f)`} />
  </svg>
}

/** ① 기계 각 부분. */
export function RpsMachineFigure() {
  const parts = ['룰렛 30칸', '가운데 LED: 기계가 낸 손', '결과 램프', '배수 LED와 시간', '손 버튼 1·2·3', '참가비 · START · 도전 · 멈춤']
  return <div className="rps-roulette-figure">
    <div className="rps-roulette-figure-machine">
      <RouletteFace roulette={ROULETTE} litCell={15} led="SCISSORS" machineHand="SCISSORS"
        lamps={{ win: true, draw: false, lose: false, jackpot: false }} />
      <div className="rps-roulette-figure-led"><b>×2.0</b><span>● ● ○</span><span>시간 ▮▮▮▮▮▮▯▯▯▯</span></div>
      <div className="rps-roulette-figure-deck">{HANDS.map(hand => <span key={hand}>{HAND_LABEL[hand]}</span>)}</div>
    </div>
    <ol>{parts.map(part => <li key={part}>{part}</li>)}</ol>
  </div>
}

/** ② 가운데 LED에 뜨는 기계 손 세 가지. */
export function RpsHandsFigure() {
  return <div className="rps-roulette-figure rps-roulette-figure-row">
    {HANDS.map(hand => <figure key={hand}><Led hand={hand} /><figcaption>{HAND_LABEL[hand]}</figcaption></figure>)}
  </div>
}

/** ③ 도전 배수 사다리. */
export function RpsLadderFigure() {
  const steps = [['이겼다', '×1.0', '멈추면 참가비 × 칸'], ['도전 1차 성공', '×2.0', '지면 꽝'], ['도전 2차 성공', '×4.0', '바로 룰렛']]
  return <div className="rps-roulette-figure rps-roulette-figure-ladder">
    {steps.map(([title, mult, note], i) => <div key={title}>
      <b>{mult}</b><span>{title}</span><small>{note}</small>{i < steps.length - 1 && <i aria-hidden="true">→</i>}
    </div>)}
  </div>
}
