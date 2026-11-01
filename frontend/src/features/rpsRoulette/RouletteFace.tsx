import { useId } from 'react'
import { LED_SHAPES, type Hand, type LedShape } from './ledHands'

export interface FaceLamps { win: boolean; draw: boolean; lose: boolean; jackpot: boolean }
const CX = 200, CY = 250, STEP_OFFSET = Math.PI / 2
const point = (r: number, a: number) => [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const
const segmentFill = (value: number, i: number) => value === 10 ? '#ffd23f' : i % 2 ? '#7aa33a' : '#f7a8b8'

/** 점선 LED 손. 같은 경로를 설명서·버튼에서도 쓴다. */
export function LedHand({ shape, fill, stroke = '#ff4a3d', width = 4.6, dotted = true }: {
  shape: LedShape; fill?: string; stroke?: string; width?: number; dotted?: boolean
}) {
  const path = LED_SHAPES[shape]
  return <g transform={path.transform} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round"
    strokeLinejoin="round" strokeDasharray={dotted ? '0 7' : undefined}>
    <path d={path.outline} fill={fill ?? 'none'} fillRule="evenodd" />
    {path.detail && <path d={path.detail} />}
  </g>
}

/** 버튼과 설명서에 쓰는 실선 손 아이콘. */
export function HandIcon({ hand, size = 34, color = '#9a2a2a' }: { hand: Hand; size?: number; color?: string }) {
  return <svg className="rps-roulette-hand-icon" width={size} height={size} viewBox="20 20 160 175" aria-hidden="true">
    <LedHand shape={hand} stroke={color} width={10} dotted={false} />
  </svg>
}

/** 기계 정면 판. 상태만 받아 그리며 결과를 계산하지 않는다. */
export function RouletteFace({ roulette, litCell, led, lamps, machineHand, title = '가위바위보 룰렛' }: {
  roulette: readonly number[]; litCell: number | null; led: LedShape; lamps: FaceLamps; machineHand: Hand | null; title?: string
}) {
  const id = useId().replace(/:/g, '')
  const step = Math.PI * 2 / roulette.length
  let star = ''
  for (let i = 0; i < roulette.length * 2; i++) {
    const [x, y] = point(i % 2 ? 150 : 172, i * step / 2 - STEP_OFFSET)
    star += `${x.toFixed(1)},${y.toFixed(1)} `
  }
  const banners: [keyof FaceLamps, string, number, number, number][] = [
    ['draw', '비겼다', 66, 116, -38], ['win', '이겼다', 334, 116, 38], ['lose', '졌다', 62, 392, 38], ['jackpot', '대박', 338, 392, -38],
  ]
  const icons: [Hand, number, number, string, string][] = [
    ['ROCK', 32, 250, '#ffd23f', '#b3121c'], ['SCISSORS', 200, 86, '#e8322a', '#ffe066'], ['PAPER', 368, 250, '#3f7fd9', '#ffe066'],
  ]
  return <svg className="rps-roulette-face" viewBox="0 0 400 440" role="img" aria-label={`${title} 판`}>
    <defs>
      <pattern id={`${id}g`} width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.5" fill="#5c1212" /></pattern>
      <pattern id={`${id}f`} width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.9" fill="#a3261d" /></pattern>
      <clipPath id={`${id}c`}><circle cx="100" cy="100" r="92" /></clipPath>
    </defs>
    <rect x="2" y="2" width="396" height="436" rx="6" fill="#1f3fae" stroke="#f2f2f2" strokeWidth="4" />
    <text x="200" y="50" textAnchor="middle" className="rps-roulette-title" fill="#ffd23f" stroke="#b3121c" strokeWidth="5"
      paintOrder="stroke" fontSize="34" fontWeight="800" letterSpacing="3">{title}</text>
    <polygon points={star} fill="#ffd23f" stroke="#b3121c" strokeWidth="2" />
    {roulette.map((value, i) => {
      const a0 = (i - .5) * step - STEP_OFFSET, a1 = (i + .5) * step - STEP_OFFSET, lit = i === litCell
      const [x1, y1] = point(146, a0), [x2, y2] = point(146, a1), [x3, y3] = point(96, a1), [x4, y4] = point(96, a0)
      const [tx, ty] = point(121, i * step - STEP_OFFSET), deg = i * 360 / roulette.length
      const rotate = deg > 90 && deg < 270 ? deg + 180 : deg
      return <g key={i} data-cell={i} data-lit={lit || undefined}>
        <path d={`M${x1} ${y1}A146 146 0 0 1 ${x2} ${y2}L${x3} ${y3}A96 96 0 0 0 ${x4} ${y4}Z`}
          fill={lit ? '#fff27a' : segmentFill(value, i)} stroke={lit ? '#ff3b30' : '#fff'} strokeWidth={lit ? 4 : 2} />
        <text x={tx} y={ty} transform={`rotate(${rotate} ${tx} ${ty})`} textAnchor="middle" dominantBaseline="central"
          fontSize={value >= 4 ? 22 : 19} fontWeight="800" fill={lit ? '#e8322a' : '#c4121c'}>{value}</text>
      </g>
    })}
    <circle cx={CX} cy={CY} r="92" fill="#2a0404" stroke="#ffd23f" strokeWidth="4" />
    <g transform={`translate(${CX - 92} ${CY - 92}) scale(.92)`}>
      <circle cx="100" cy="100" r="92" fill={`url(#${id}g)`} />
      <g clipPath={`url(#${id}c)`}><LedHand shape={led} fill={`url(#${id}f)`} /></g>
    </g>
    {icons.map(([hand, x, y, bg, fg]) => <g key={hand} data-on={machineHand === hand || undefined}>
      <circle cx={x} cy={y} r="26" fill={bg} stroke={machineHand === hand ? '#ffe066' : '#b3121c'} strokeWidth={machineHand === hand ? 6 : 3} />
      <svg x={x - 17} y={y - 17} width="34" height="34" viewBox="20 20 160 175"><LedHand shape={hand} stroke={fg} width={11} dotted={false} /></svg>
    </g>)}
    {banners.map(([key, label, x, y, deg]) => <g key={key} transform={`translate(${x} ${y}) rotate(${deg})`} data-on={lamps[key] || undefined}>
      <rect x="-50" y="-18" width="100" height="36" rx="4" fill={lamps[key] ? '#e8322a' : '#7a1a14'}
        stroke={lamps[key] ? '#ffe066' : '#2a0a06'} strokeWidth="3" />
      <text textAnchor="middle" dominantBaseline="central" fontSize="19" fontWeight="800" fill={lamps[key] ? '#ffe066' : '#c98b3a'}>{label}</text>
    </g>)}
  </svg>
}
