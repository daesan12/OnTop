export type OutlinePoint = readonly [number, number]

/** Tangent quarter circles retain the straight sides of the park. */
export function roundedSquare(half: number, radius: number, segments = 20,fullness = 0): OutlinePoint[] {
  const r = Math.max(0, Math.min(half, radius)), c = half - r
  return [[c,c],[-c,c],[-c,-c],[c,-c]].flatMap(([x,z], corner) =>
    Array.from({length: segments + 1}, (_,i) => {
      const a = corner * Math.PI / 2 + i * Math.PI / (segments * 2)
      const broad=r+Math.min(r*.065,1.5)*fullness*Math.sin(a*2)**2
      return [x! + Math.cos(a)*broad,z! + Math.sin(a)*broad] as const
    }),
  )
}

export function insideRoundedSquare(x:number,z:number,half:number,radius:number) {
  return Math.abs(x)<=half && Math.abs(z)<=half &&
    Math.hypot(Math.max(0,Math.abs(x)-(half-radius)),Math.max(0,Math.abs(z)-(half-radius)))<=radius
}
