import type { CSSProperties } from 'react'

/** 게임기 LED 창의 7세그먼트 숫자. 꺼진 칸도 어둡게 그려 실제 LED처럼 보이게 한다. */
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg',
  '9': 'abcdfg', '-': 'g', ' ': '',
}
// 글자 한 칸은 폭 12 × 높이 22. 기울임은 실제 LED처럼 살짝 준다.
const PATHS: Record<string, string> = {
  a: 'M2.6 1h7.8l-1.6 2H4.2z', d: 'M2.6 21h7.8l-1.6-2H4.2z', g: 'M2.4 11l1.6-1.4h5l1.6 1.4-1.6 1.4h-5z',
  f: 'M1.6 2l2 2v5.4l-2 1.4z', b: 'M10.4 2l-2 2v5.4l2 1.4z', e: 'M1.6 20l2-2v-5.4l-2-1.4z', c: 'M10.4 20l-2-2v-5.4l2-1.4z',
}

export function SevenSegment({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const cells: { char: string; dot: boolean; colon: boolean }[] = []
  for (const char of text) {
    if (char === '.' && cells.length) cells[cells.length - 1]!.dot = true
    else if (char === ':') cells.push({ char: ' ', dot: false, colon: true })
    else cells.push({ char, dot: false, colon: false })
  }
  const widths = cells.map(cell => cell.colon ? 6 : 14)
  const total = widths.reduce((a, b) => a + b, 0)
  let x = 0
  return <svg className={className} style={style} viewBox={`0 0 ${total} 22`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    {cells.map((cell, i) => {
      const at = x
      x += widths[i]!
      if (cell.colon) return <g key={i} transform={`translate(${at} 0)`}>
        <rect className="on" x="2" y="6" width="2.4" height="2.4" rx=".6" /><rect className="on" x="2" y="14" width="2.4" height="2.4" rx=".6" />
      </g>
      const lit = SEGMENTS[cell.char] ?? ''
      return <g key={i} transform={`translate(${at + 1} 0) skewX(-6)`}>
        {Object.entries(PATHS).map(([segment, d]) => <path key={segment} d={d} className={lit.includes(segment) ? 'on' : 'off'} />)}
        <circle cx="12.4" cy="20.6" r="1.2" className={cell.dot ? 'on' : 'off'} />
      </g>
    })}
  </svg>
}
