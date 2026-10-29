/** Wrap measured graphemes instead of squeezing a whole Korean sentence into one line. */
export function wrapMemoText(text: string, measure: (text: string) => number, width: number, maxLines = 5) {
  const segments = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text.replace(/\r\n?/g, '\n'))].map(s => s.segment)
  const lines: string[] = []
  let line = '', truncated = false
  for (let i = 0; i < segments.length; i++) {
    const grapheme = segments[i]!
    if (grapheme !== '\n' && (measure(line + grapheme) <= width || !line)) { line += grapheme; continue }
    lines.push(line); line = grapheme === '\n' ? '' : grapheme
    if (lines.length === maxLines) { truncated = true; break }
  }
  if (!truncated && lines.length < maxLines) lines.push(line)
  if (truncated) {
    let last = lines[maxLines - 1]!
    const graphemes = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(last)].map(s => s.segment)
    while (graphemes.length && measure(graphemes.join('') + '…') > width) graphemes.pop()
    last = graphemes.join('') + '…'; lines[maxLines - 1] = last
  }
  return lines
}
