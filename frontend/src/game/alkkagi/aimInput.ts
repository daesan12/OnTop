/** 알 중심과 클릭 지점 사이의 간격을 발사 힘으로 취급하지 않는다. */
export function draggedShot(start: { x: number; y: number }, end: { x: number; y: number },
  origin: { x: number; z: number }, point: { x: number; z: number }) {
  if (Math.hypot(end.x - start.x, end.y - start.y) < 12) return null
  const dx = origin.x - point.x, dy = origin.z - point.z, length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length < .08) return null
  return { dx: dx / length, dy: dy / length, power: Math.min(1, length / 2.5) }
}
