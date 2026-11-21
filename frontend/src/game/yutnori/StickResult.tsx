/** 첫 번째 윷의 평평한 면에만 빽도 표식이 새겨져 있다. */
export function stickFaces(mask: number) {
  return [0, 1, 2, 3].map(index => ({ flat: !!(mask & 1 << index), marked: index === 0 && !!(mask & 1) }))
}
export function StickResult({ mask }: { mask: number }) {
  return <span className="yut-stick-result" aria-label={stickFaces(mask).map((face, index) => `${index + 1}번 윷 ${face.flat ? '평평한 면' : '둥근 면'} 위${face.marked ? ' 빽도 표식' : ''}`).join(', ')}>
    {stickFaces(mask).map((face, index) => <i key={index} data-up={face.flat} data-marked={face.marked} aria-hidden="true">{face.marked ? '−' : face.flat ? '│' : ''}</i>)}
  </span>
}
