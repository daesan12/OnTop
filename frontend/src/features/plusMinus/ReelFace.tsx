import { useId, type CSSProperties } from 'react'
import { JACKPOT, operatorLabel, type Operator } from './protocol'

export interface ReelView { lit: number | null; value: string | null }
/** 세 릴이 다 멈춘 직후 한 번만 보여 주는 연출. 잭팟 칸에 섰지만 숫자1이 7이 아니면 `miss`. */
export type Celebration = 'jackpot' | 'miss' | null

const TOP = { cx: 300, cy: 92 }
const RINGS = [148, 452] as const
const RY = 278
const RING = { outer: 128, inner: 78 }

// 5×7 도트 LED 글자. 그 밖의 글자(잭팟 칸)는 JP로 보여 준다.
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '−': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}
const ledText = (text: string) => [...text.replace(/-/g, '−')].every(ch => ch in GLYPHS) ? text.replace(/-/g, '−') : 'JP'

function Led({ cx, cy, text, digits, dot }: { cx: number; cy: number; text: string; digits: number; dot: number }) {
  const chars = [...ledText(text).padStart(digits, ' ')].slice(-digits)
  const x0 = cx - (digits * 6 - 2) * dot / 2, y0 = cy - 3 * dot
  return <g aria-hidden="true">
    {chars.flatMap((ch, g) => GLYPHS[ch]!.flatMap((row, y) => [...row].map((on, x) =>
      <circle key={`${g}-${y}-${x}`} cx={x0 + (g * 6 + x) * dot} cy={y0 + y * dot} r={dot * .36}
        className={on === '1' ? 'plus-minus-dot-on' : undefined} fill={on === '1' ? '#ff3b30' : '#4a1010'} />)))}
  </g>
}

const star = (x: number, y: number, r: number) => Array.from({ length: 10 }, (_, k) => {
  const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * .45 : r
  return `${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`
}).join(' ')

function NumberRing({ cx, labels, lit, value, gold, active }: {
  cx: number; labels: string[]; lit: number | null; value: string | null; gold: number; active: boolean
}) {
  const step = Math.PI * 2 / labels.length, { outer, inner } = RING
  const at = (r: number, a: number) => [cx + r * Math.cos(a), RY + r * Math.sin(a)] as const
  return <g className="plus-minus-ring" data-active={active || undefined}>
    <circle className="plus-minus-rim" cx={cx} cy={RY} r={outer + 4} fill="#2b2420" stroke="#fff3d6" strokeWidth="6" />
    {labels.map((label, i) => {
      const a0 = (i - .5) * step - Math.PI / 2, a1 = (i + .5) * step - Math.PI / 2, on = i === lit, jackpot = i === gold
      const [x1, y1] = at(outer, a0), [x2, y2] = at(outer, a1), [x3, y3] = at(inner, a1), [x4, y4] = at(inner, a0)
      const [tx, ty] = at((outer + inner) / 2, i * step - Math.PI / 2)
      return <g key={i} className="plus-minus-cell" data-cell={i} data-lit={on || undefined} data-gold={jackpot || undefined}
        style={{ '--i': i } as CSSProperties}>
        <path d={`M${x1} ${y1}A${outer} ${outer} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${inner} ${inner} 0 0 0 ${x4} ${y4}Z`}
          fill={on ? '#ffe45c' : jackpot ? '#f2a900' : '#2b2420'} stroke="#f5e6c8" strokeWidth="2" />
        <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fontSize={jackpot ? 15 : 25} fontWeight="800"
          fill={on || jackpot ? '#3a1a00' : '#ffd23f'}>{label}</text>
      </g>
    })}
    <circle cx={cx} cy={RY} r={inner} fill="#1a0606" stroke="#7d726a" strokeWidth="7" />
    <Led cx={cx} cy={RY} text={value ?? (lit === null ? '' : labels[lit]!)} digits={2} dot={8} />
  </g>
}

/** 기계 정면 판. 서버가 정한 칸과 연출 중인 불빛만 받아 그리며 결과를 계산하지 않는다. */
export function ReelFace({ firstReel, operatorReel, secondReel, reels, plays, balance, payout, active = -1, celebrate = null }: {
  firstReel: readonly number[]; operatorReel: readonly Operator[]; secondReel: readonly number[]
  reels: readonly [ReelView, ReelView, ReelView]
  /** 왼쪽 위 `9/10`, 오른쪽 위 `190냥`, 가운데 위 LED `120` */
  plays: string; balance: string; payout: string
  /** 지금 누를 수 있는 정지 버튼(0~2), 없으면 -1 */
  active?: number; celebrate?: Celebration
}) {
  const id = useId().replace(/:/g, '')
  // 원판·패널을 피한 빈 자리에 흩뿌린다. [x, y, 크기, 흰 별]
  const stars = ([[30, 128, 12, false], [120, 124, 7, true], [196, 150, 9, false], [404, 150, 8, true], [480, 124, 7, false],
    [570, 130, 12, true], [300, 196, 11, false], [300, 248, 7, true], [14, 228, 7, true], [586, 236, 8, false],
    [20, 392, 11, false], [580, 398, 10, true], [238, 412, 8, true], [362, 414, 10, false], [210, 112, 5, true], [390, 112, 5, false]] as const)
  const step = Math.PI * 2 / operatorReel.length
  const lamp = (r: number, i: number, offset = 0) => [TOP.cx + r * Math.cos((i + offset) * step - Math.PI / 2),
    TOP.cy + r * Math.sin((i + offset) * step - Math.PI / 2)] as const
  return <svg className="plus-minus-face" viewBox="0 0 600 430" role="img" aria-label="더하기 빼기 판" data-celebrate={celebrate ?? undefined}>
    <defs>
      <radialGradient id={`${id}b`} cx=".5" cy=".5" r=".5"><stop offset=".7" stopColor="#2a6fe0" /><stop offset="1" stopColor="#164aa8" /></radialGradient>
      <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fb0ff" /><stop offset="1" stopColor="#1d6ae0" /></linearGradient>
    </defs>
    {stars.map(([x, y, r, white], i) => <polygon key={i} className="plus-minus-star" points={star(x, y, r)}
      fill={white ? '#fff6dc' : '#ffe14a'} opacity=".85" style={{ '--i': i } as CSSProperties} />)}

    {([[18, '남은 판', plays], [404, '보유', balance]] as const).map(([x, label, value], i) => <g key={label}>
      <rect x={x} y="24" width="178" height="78" rx="16" fill="#4a2c14" stroke="#ffd27a" strokeWidth="3" />
      {i === 0
        ? <g fill="none" stroke="#ffd23f" strokeWidth="4"><rect x={x + 18} y="48" width="44" height="30" rx="5" />
          <path d={`M${x + 32} 48v30`} strokeDasharray="4 4" /></g>
        : <g><circle cx={x + 40} cy="63" r="20" fill="#ffd23f" stroke="#c78a00" strokeWidth="3" />
          <rect x={x + 33} y="56" width="14" height="14" fill="#4a2c14" /></g>}
      <text x={x + 120} y="47" textAnchor="middle" dominantBaseline="central" fontSize="16" fontWeight="700" fill="#f5e6c8">{label}</text>
      <text x={x + 120} y="78" textAnchor="middle" dominantBaseline="central" fontSize={value.length > 6 ? 21 : 29} fontWeight="800" fill="#fff0c2">{value}</text>
    </g>)}

    <g className="plus-minus-ring" data-active={active === 1 || undefined}>
      <circle className="plus-minus-rim" cx={TOP.cx} cy={TOP.cy} r="84" fill={`url(#${id}b)`} stroke="#fff3d6" strokeWidth="6" />
      {operatorReel.map((_, i) => { const [x, y] = lamp(68, i, .5)
        return <polygon key={i} points={star(x, y, 7)} fill="#ffffff" /> })}
      {operatorReel.map((sign, i) => { const [x, y] = lamp(68, i), on = i === reels[1].lit
        return <g key={i} className="plus-minus-lamp" data-cell={i} data-lit={on || undefined}>
          <circle cx={x} cy={y} r="12" fill={on ? '#ffe45c' : '#0f3a8f'} stroke="#fff3d6" strokeWidth="2" />
          <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="18" fontWeight="800"
            fill={on ? '#c4121c' : '#cfe0ff'}>{operatorLabel(sign)}</text>
        </g> })}
      <circle cx={TOP.cx} cy={TOP.cy} r="52" fill="#1a0606" stroke="#7d726a" strokeWidth="5" />
      <Led cx={TOP.cx} cy={TOP.cy - 4} text={payout} digits={3} dot={4.6} />
      <text x={TOP.cx} y={TOP.cy + 32} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill="#ffcf4a">받는 냥</text>
    </g>

    <NumberRing cx={RINGS[0]} labels={firstReel.map(String)} lit={reels[0].lit} value={reels[0].value} gold={-1} active={active === 0} />
    <NumberRing cx={RINGS[1]} labels={secondReel.map(value => value === JACKPOT ? '잭팟' : String(value))} lit={reels[2].lit}
      value={reels[2].value} gold={secondReel.indexOf(JACKPOT)} active={active === 2} />

    <path className="plus-minus-arrow" data-active={active === 1 || undefined}
      d="M300 300L338 352H316V428H284V352H262Z" fill={`url(#${id}a)`} stroke="#fff3d6" strokeWidth="4" strokeLinejoin="round" />

    {celebrate === 'jackpot' && <g className="plus-minus-banner">
      <rect x="150" y="180" width="300" height="76" rx="16" fill="#e8322a" stroke="#ffe066" strokeWidth="5" />
      <text x="300" y="207" textAnchor="middle" dominantBaseline="central" fontSize="34" fontWeight="900" fill="#ffe066"
        stroke="#8a0d12" strokeWidth="5" paintOrder="stroke" letterSpacing="2">JACKPOT!</text>
      <text x="300" y="240" textAnchor="middle" dominantBaseline="central" fontSize="18" fontWeight="800" fill="#fff6dc">대박 500냥</text>
    </g>}
  </svg>
}
