/** Real pips, shared by the HUD and the scorebook; no font-dependent dice glyphs. */
export const DIE_PIPS: Record<number, readonly number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
}
export function DiceFace({ value }: { value: number }) {
  return <span className="dice-face" role="img" aria-label={`${value}눈`} data-face={value}>
    {Array.from({ length: 9 }, (_, i) => <i key={i} data-pip={DIE_PIPS[value]?.includes(i) || undefined} />)}
  </span>
}
export function DiceFaces({ values }: { values: readonly number[] }) {
  return <span className="dice-faces">{values.map((value, i) => <DiceFace key={i} value={value} />)}</span>
}
