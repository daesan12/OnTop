export const REST_FURNITURE_VERTICAL_SCALE = .72
export const SPECTATOR_BENCH_HEIGHTS = { main: .7, rest: .583 } as const

// Local dimensions of the two pavilion models. Their front entrances leave a bay open.
export const PAVILION_BENCH_LAYOUTS = {
  main: { openSide: 4, radius: 4.97, width: 4.1, depth: .9, floor: 2.6 },
  rest: { openSide: 0, radius: 2.12 * Math.cos(Math.PI / 8), width: 1.67, depth: .49, floor: .572 },
} as const

export function pavilionBenchSegments(kind: keyof typeof PAVILION_BENCH_LAYOUTS) {
  const layout = PAVILION_BENCH_LAYOUTS[kind]
  return Array.from({ length: 8 }, (_, side) => {
    const yaw = side * Math.PI / 4
    return { side, yaw, x: layout.radius * Math.sin(yaw), z: layout.radius * Math.cos(yaw),
      width: layout.width, depth: layout.depth, floor: layout.floor, seatHeight: SPECTATOR_BENCH_HEIGHTS[kind] }
  }).filter(segment => segment.side !== layout.openSide)
}
