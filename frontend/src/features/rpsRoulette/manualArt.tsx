import { useId } from 'react'
import { HANDS, HAND_LABEL } from './ledHands'
import { ROULETTE } from './protocol'
import { LedHand, RouletteFace } from './RouletteFace'

/** 설명서 목록 썸네일. 실제 게임 판 컴포넌트와 같은 손·칸 구성을 쓴다. */
export function RpsRouletteArt() {
  return <svg className="manual-art art-rps-roulette" viewBox="0 0 240 150" aria-hidden="true">
    <rect width="240" height="150" fill="#1f3fae" />
    <rect x="70" y="8" width="100" height="134" rx="8" fill="#151515" stroke="#ececec" strokeWidth="3" />
    <svg x="76" y="14" width="88" height="96" viewBox="0 0 400 440">
      <RouletteFace roulette={ROULETTE} litCell={0} led="PAPER" machineHand={null}
        lamps={{ win: true, draw: false, lose: false, jackpot: true }} />
    </svg>
    {[96, 120, 144].map(x => <circle key={x} cx={x} cy="124" r="7" fill="#f4f4f4" stroke="#b9b9b9" strokeWidth="2" />)}
  </svg>
}

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
      <div className="rps-roulette-figure-led"><b>×1.5</b><span>● ● ○</span><span>시간 ▮▮▮▮▮▮▯▯▯▯</span></div>
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
  const steps = [['이겼다', '×1.0', '멈추면 참가비 × 칸'], ['도전 1차 성공', '×1.5', '지면 꽝'], ['도전 2차 성공', '×2.0', '바로 룰렛']]
  return <div className="rps-roulette-figure rps-roulette-figure-ladder">
    {steps.map(([title, mult, note], i) => <div key={title}>
      <b>{mult}</b><span>{title}</span><small>{note}</small>{i < steps.length - 1 && <i aria-hidden="true">→</i>}
    </div>)}
  </div>
}
