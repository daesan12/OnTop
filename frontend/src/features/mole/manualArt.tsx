import { SPRITES } from './stage'
import { KEYS } from './protocol'

/** ① 구멍과 키 배치. 아랫줄은 반 칸 오른쪽이다. */
export function MoleKeysFigure() {
  return <div className="mole-figure">
    <div className="mole-figure-board" aria-label="구멍 키 배치">
      {[0, 1].map(row => <div key={row} className="mole-figure-row" data-row={row}>
        {KEYS.slice(row * 4, row * 4 + 4).map(key => <span key={key}>{key}</span>)}
      </div>)}
    </div>
  </div>
}

/** ② 두더지 종류. */
export function MoleKindsFigure() {
  const kinds = [['NORMAL', '일반', '+10'], ['GOLD', '금색', '+30'], ['RAPID', '헬멧 연타', '2~5회 20~60'],
    ['DECOY', '고슴도치', '치면 −20']] as const
  return <ul className="mole-figure mole-figure-kinds">
    {kinds.map(([kind, name, points]) => <li key={kind}>
      <img src={SPRITES[kind]} alt="" /><span>{name}</span><b>{points}</b>
    </li>)}
  </ul>
}
