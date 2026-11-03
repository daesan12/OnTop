import { FIRST_REEL, OPERATOR_REEL, SECOND_REEL } from './protocol'
import { ReelFace } from './ReelFace'

/** ① 기계 각 부분. */
export function PlusMinusMachineFigure() {
  const parts = ['왼쪽 원판: 숫자1', '위쪽 파란 원: 더하기·빼기 불빛과 받는 냥', '오른쪽 원판: 숫자2 (금색 잭팟 칸)', '아래 LED: 계산식과 안내', '1번 정지 · 2번 정지 · 3번 정지', '파란 몸통 START: 30냥 넣고 시작']
  return <div className="plus-minus-figure">
    <div className="plus-minus-figure-machine">
      <ReelFace firstReel={FIRST_REEL} operatorReel={OPERATOR_REEL} secondReel={SECOND_REEL} plays="9/10" balance="190냥" payout="120"
        reels={[{ lit: 0, value: '7' }, { lit: 0, value: '+' }, { lit: SECOND_REEL.indexOf(5), value: '5' }]} />
      <div className="plus-minus-figure-led">7 + 5 = 12 → 120냥</div>
      <div className="plus-minus-figure-deck">{['1번 정지', '2번 정지', '3번 정지'].map(label => <span key={label}>{label}</span>)}</div>
    </div>
    <ol>{parts.map(part => <li key={part}>{part}</li>)}</ol>
  </div>
}

/** ② 계산 예시. */
export function PlusMinusExamplesFigure() {
  const rows: [string, string, boolean][] = [
    ['8 + 9 = 17', '170냥', false], ['3 + 2 = 5', '50냥', false], ['2 − 1 = 1', '10냥', false],
    ['4 − 4 = 0', '꽝', true], ['1 − 6 = −5', '꽝', true], ['7 + JACKPOT', '500냥', false], ['5 − JACKPOT', '꽝', true],
  ]
  return <ul className="plus-minus-figure plus-minus-figure-examples">
    {rows.map(([formula, payout, lost]) => <li key={formula} data-lost={lost || undefined}><span>{formula}</span><b>{payout}</b></li>)}
  </ul>
}
