import type { Fruit } from './protocol'

/**
 * Original OnTop fruit drawings in the board-game card style: bold dark outline, flat colour with one soft
 * gradient and a highlight. Each fruit is drawn around (0,0) in roughly a 36-unit box so the same paths serve the
 * card face (filled) and the pink card back (outline only). No photo or traced artwork is used.
 */
export const FRUIT_STYLE: Record<Fruit, { light: string; dark: string; line: string }> = {
  STRAWBERRY: { light: '#ff6b55', dark: '#c81e1c', line: '#3a0d07' },
  BANANA: { light: '#fff27a', dark: '#f2bd16', line: '#4a3600' },
  LIME: { light: '#e4f58c', dark: '#9fcf3c', line: '#2f4a10' },
  PLUM: { light: '#a65ad8', dark: '#4b1478', line: '#1e0630' },
}
const STRAWBERRY = 'M0 18C-8 14-15 5-15-4C-15-10-10-13.5-4-12.8C-2-12.5 2-12.5 4-12.8C10-13.5 15-10 15-4C15 5 8 14 0 18Z'
const STRAWBERRY_LEAVES = 'M0-11.5L-12-15L-5-16.5L-8.5-21.5L-1.5-17.5L0-23L1.5-17.5L8.5-21.5L5-16.5L12-15Z'
const STRAWBERRY_SEEDS: [number, number][] = [[-8, -6], [-1, -8], [7, -6], [-10, 1], [-3, 0], [4, 0], [10, 1], [-6, 7], [1, 7], [7, 7], [-2, 13]]
const BANANA = 'M4.5-18.5C-12-11.5-14.5 11 4 20C6.6 21 7.8 18.4 6.2 16.4C-1.5 9-1.8-8.5 7.6-14.8C9.1-15.9 7.6-19 4.5-18.5Z'
const PLUM_SUTURE = 'M2.5-13.5C-4-6-4.5 6 1 15'

export function FruitShape({ fruit, fill, outline = false }: { fruit: Fruit; fill?: string; outline?: boolean }) {
  const s = FRUIT_STYLE[fruit], line = outline ? 'currentColor' : s.line, body = outline ? 'none' : fill ?? s.dark
  const stroke = { stroke: line, strokeWidth: 1.5, strokeLinejoin: 'round' as const }
  if (fruit === 'STRAWBERRY') return <g>
    <path d={STRAWBERRY} fill={body} {...stroke} />
    {STRAWBERRY_SEEDS.map(([x, y]) => <ellipse key={`${x},${y}`} cx={x} cy={y} rx=".75" ry="1.15"
      fill={outline ? 'currentColor' : '#ffe39a'} stroke="none" />)}
    {!outline && <ellipse cx="-7.5" cy="-5" rx="2.6" ry="5" transform="rotate(-25 -7.5 -5)" fill="#fff" opacity=".35" />}
    <path d={STRAWBERRY_LEAVES} fill={outline ? 'none' : '#3f9b2f'} {...stroke} />
  </g>
  if (fruit === 'BANANA') return <g>
    <path d={BANANA} fill={body} {...stroke} />
    {!outline && <path d="M1-12.5C-6.5-6-6.8 7.5 1.6 14.2" fill="none" stroke="#fffbd0" strokeWidth="2.4" strokeLinecap="round" opacity=".85" />}
    {!outline && <path d="M-6.5-4C-7.5 1-7 5-5 8.5" fill="none" stroke="#c99a0a" strokeWidth="1" strokeLinecap="round" opacity=".6" />}
    <path d="M4.5-18.5L5.6-22.2L9.6-21.2L7.6-14.8" fill={outline ? 'none' : '#6b4e1e'} {...stroke} />
    {!outline && <circle cx="5.2" cy="18" r="1.3" fill="#3d2a08" />}
  </g>
  if (fruit === 'LIME') return <g transform="rotate(-28)">
    <path d="M15.2-2.6C18.4-3 19.6 2.6 15.4 2.8" fill={outline ? 'none' : s.dark} {...stroke} />
    <ellipse rx="16" ry="12.2" fill={body} {...stroke} />
    {!outline && <ellipse cx="-6" cy="-5.2" rx="5.5" ry="2.4" fill="#fff" opacity=".5" />}
    {!outline && [[-2, 3], [4, -2], [7, 5], [-8, 4], [1, 8]].map(([x, y]) =>
      <circle key={`${x},${y}`} cx={x} cy={y} r=".55" fill={s.line} opacity=".25" />)}
  </g>
  return <g>
    <path d="M1.2-14.5C1-18 2.4-20.5 4.8-22.4" fill="none" stroke={outline ? 'currentColor' : '#6b4a2a'} strokeWidth="2" strokeLinecap="round" />
    <ellipse cy="1.5" rx="15" ry="16" fill={body} {...stroke} />
    <path d={PLUM_SUTURE} fill="none" stroke={outline ? 'currentColor' : s.line} strokeWidth="1.2" opacity={outline ? 1 : .55} />
    {!outline && <ellipse cx="-7" cy="-4" rx="2.6" ry="5.2" transform="rotate(20 -7 -4)" fill="#fff" opacity=".38" />}
  </g>
}

/** Card face is 100 × 150. Counts follow the physical cards: 1 centre, 2/3 down the diagonal, 4 corners, 5 corners + centre. */
export const FRUIT_LAYOUT: Record<number, [number, number][]> = {
  1: [[50, 75]],
  2: [[28, 34], [72, 116]],
  3: [[27, 32], [50, 75], [73, 118]],
  4: [[26, 36], [74, 36], [26, 114], [74, 114]],
  5: [[26, 30], [74, 30], [50, 75], [26, 120], [74, 120]],
}
/**
 * Per fruit, matching the printed deck: round lime and plum take ~42% of the card width, the tall strawberry and
 * banana ~30% of its height, so three on the diagonal and five with a centre fruit do not overlap.
 */
export const FRUIT_SCALE: Record<Fruit, number> = { STRAWBERRY: 1.15, BANANA: 1.25, LIME: 1.38, PLUM: 1.28 }
