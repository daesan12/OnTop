import { useId } from 'react'
import { FRUIT_LABEL, type FruitCard as Card } from './protocol'
import { FRUIT_LAYOUT, FRUIT_SCALE, FRUIT_STYLE, FruitShape } from './FruitArt'

/** White card, rounded corners, large outlined fruits placed like the physical deck. The same SVG is reusable as a 3D texture source. */
export function FruitCard({ card, size = 'normal' }: { card: Card; size?: 'normal' | 'small' }) {
  // The fruit name keeps ids distinct even when cards are rendered as separate roots (e.g. texture snapshots).
  const id = useId().replace(/:/g, ''), style = FRUIT_STYLE[card.fruit], gradient = `hg-${card.fruit}-${id}`
  return <svg className="hg-card hg-card-face" data-fruit={card.fruit} data-count={card.count} data-size={size}
    viewBox="0 0 100 150" role="img" aria-label={`${FRUIT_LABEL[card.fruit]} ${card.count}개`}>
    <defs>
      <radialGradient id={gradient} cx="35%" cy="30%" r="75%">
        <stop offset="0" stopColor={style.light} /><stop offset="1" stopColor={style.dark} />
      </radialGradient>
    </defs>
    <rect x="1" y="1" width="98" height="148" rx="9" className="hg-card-paper" />
    {FRUIT_LAYOUT[card.count]!.map(([x, y], i) => <g key={i} transform={`translate(${x} ${y}) scale(${FRUIT_SCALE[card.fruit]})`}>
      <FruitShape fruit={card.fruit} fill={`url(#${gradient})`} />
    </g>)}
  </svg>
}

/** Placement of the large line-art fruits on the back; they run off the edges like a printed pattern. */
const BACK_PATTERN: { fruit: Card['fruit']; x: number; y: number; scale: number; rotate: number }[] = [
  { fruit: 'PLUM', x: 6, y: 22, scale: 1.4, rotate: -10 },
  { fruit: 'STRAWBERRY', x: 64, y: 30, scale: 1.55, rotate: 4 },
  { fruit: 'BANANA', x: 50, y: 62, scale: 1.45, rotate: -90 },
  { fruit: 'LIME', x: 100, y: 76, scale: 1.2, rotate: 0 },
  { fruit: 'STRAWBERRY', x: 22, y: 94, scale: 1.4, rotate: -4 },
  { fruit: 'PLUM', x: 66, y: 102, scale: 1.4, rotate: 12 },
  { fruit: 'BANANA', x: 66, y: 142, scale: 1.3, rotate: -70 },
  { fruit: 'LIME', x: 12, y: 142, scale: 1.25, rotate: 0 },
]
/** Pink line-art back with a white border. Colours are also attributes so the 3D pile can draw it as a texture without CSS. */
export function CardBack({ size = 'normal' }: { size?: 'normal' | 'small' }) {
  const clip = `hg-back-${useId().replace(/:/g, '')}`
  return <svg className="hg-card hg-card-back" data-size={size} viewBox="0 0 100 150" aria-hidden="true">
    <defs><clipPath id={clip}><rect x="5" y="5" width="90" height="140" rx="6" /></clipPath></defs>
    <rect x="1" y="1" width="98" height="148" rx="9" className="hg-back-border" fill="#fff" stroke="#d9d4cc" strokeWidth="1.2" />
    <rect x="5" y="5" width="90" height="140" rx="6" className="hg-back-paper" fill="#f5dde5" />
    <g clipPath={`url(#${clip})`} className="hg-back-art" color="#ad2f67">
      {BACK_PATTERN.map((p, i) => <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.rotate}) scale(${p.scale})`}>
        <FruitShape fruit={p.fruit} outline />
      </g>)}
    </g>
  </svg>
}
