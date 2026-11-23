import { tableScale, tableSeats, type TableAnchor } from '../../park/tablePlacement'

/** 공원 카메라만 테이블 위로 기울인다. 별도 씬·캔버스·테이블은 만들지 않는다. */
export function secretTileCamera(anchor: TableAnchor, seatIndex: number, aspect: number) {
  const seats = tableSeats(anchor), seat = seats[seatIndex] ?? seats[0]!
  const radius = Math.max(.1, Math.hypot(seat.x, seat.z)), scale = tableScale(anchor)
  const narrow = Math.max(1, Math.sqrt(1.25 / Math.max(.35, aspect)))
  const distance = (radius + .7 * scale) * narrow
  return { position: [anchor.position[0] + seat.x / radius * distance,
    anchor.position[1] + (anchor.boardOffsetY ?? 0) + 3.15 * Math.sqrt(scale) * narrow,
    anchor.position[2] + seat.z / radius * distance] as const,
  target: [anchor.position[0], anchor.position[1] + (anchor.boardOffsetY ?? 0) + 1.1, anchor.position[2]] as const }
}
