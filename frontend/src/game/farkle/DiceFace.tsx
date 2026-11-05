/** Real pips, shared by the HUD and the scorebook; no font-dependent dice glyphs. */
export const DIE_PIPS: Record<number, readonly number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
}
export function DiceFace({ value }: { value: number }) {
  return <span className="dice-face" role="img" aria-label={`${value}눈`} data-face={value}>
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {DIE_PIPS[value]?.map(pip => <circle key={pip} data-pip cx={20 + pip % 3 * 30} cy={20 + Math.floor(pip / 3) * 30} r="9" />)}
    </svg>
  </span>
}
export function DiceFaces({ values }: { values: readonly number[] }) {
  return <span className="dice-faces">{values.map((value, i) => <DiceFace key={i} value={value} />)}</span>
}
