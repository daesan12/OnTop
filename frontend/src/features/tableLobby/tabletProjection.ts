/** Project real HTML onto the 3D screen. Coordinates stay in CSS pixels, independent of DPR. */
export const TABLET = { width: 1.65, height: 1.03125, pixelsX: 1280, pixelsY: 800, y: 1.65, tilt: -0.12 } as const
export const tabletProjection = { element: null as HTMLElement | null, amount: 0 }
export function screenTransform(points: readonly { x: number; y: number }[]) {
  const w = TABLET.pixelsX, h = TABLET.pixelsY
  const source = [[0, 0], [w, 0], [0, h], [w, h]]
  const a: number[][] = []
  source.forEach(([x, y], i) => {
    const p = points[i]!
    a.push([x!, y!, 1, 0, 0, 0, -p.x * x!, -p.x * y!, p.x])
    a.push([0, 0, 0, x!, y!, 1, -p.y * x!, -p.y * y!, p.y])
  })
  for (let c = 0; c < 8; c++) {
    let pivot = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[pivot]![c]!)) pivot = r
    ;[a[c], a[pivot]] = [a[pivot]!, a[c]!]
    const n = a[c]![c]!
    if (Math.abs(n) < 1e-10) return ''
    for (let j = c; j < 9; j++) a[c]![j] = a[c]![j]! / n
    for (let r = 0; r < 8; r++) if (r !== c) {
      const m = a[r]![c]!
      for (let j = c; j < 9; j++) a[r]![j] = a[r]![j]! - m * a[c]![j]!
    }
  }
  const [aa, b, c, d, e, f, g, hh] = a.map(row => row[8]!)
  return `matrix3d(${aa},${d},0,${g},${b},${e},0,${hh},0,0,1,0,${c},${f},0,1)`
}
