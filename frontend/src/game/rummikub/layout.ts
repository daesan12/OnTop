/** 작은 조합은 같은 줄에 두고, 공개 판이 받침대를 침범하지 않도록 전체 배율을 제한한다. */
export function layoutMelds(lengths: number[]) {
  const widths = lengths.map(n => n * .212 + .14)
  const available = Math.max(2.2, ...widths)
  const rows: { items: { index: number; width: number }[]; width: number }[] = []
  widths.forEach((width, index) => {
    let row = rows.at(-1)
    if (!row || row.width + .1 + width > available) { row = {items: [], width: 0}; rows.push(row) }
    if (row.items.length) row.width += .1
    row.items.push({index, width}); row.width += width
  })
  const scale = Math.min(1, 2.2 / available, .74 / Math.max(.74, (rows.length - 1) * .32))
  const positions = lengths.map(() => ({x: 0, z: 0}))
  rows.forEach((row, line) => {
    let cursor = -row.width / 2
    row.items.forEach(item => {
      positions[item.index] = {x: cursor + item.width / 2 + .07, z: line * .32}
      cursor += item.width + .1
    })
  })
  return {scale, positions}
}
