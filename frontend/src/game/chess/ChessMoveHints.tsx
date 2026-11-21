import { useEffect, useMemo } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { chessMoveHints, type BoardPoint, type MovePath } from './moveHints'

const colors = { move: new Color('#23754e'), jump: new Color('#336b9e'), castle: new Color('#99702c'), capture: new Color('#ca642b') }
const noRaycast = () => {}

/** Two merged ground meshes for all arrows, including dashed jumps, so long queen rays stay inexpensive. */
export function chessArrowGeometry(paths: MovePath[]) {
  const outline: number[] = [], fill: number[] = [], vertexColors: number[] = [], seen = new Set<string>()
  const triangle = (out: number[], a: BoardPoint, b: BoardPoint, c: BoardPoint, color?: Color) => {
    const ordered = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x) > 0 ? [a, c, b] : [a, b, c]
    for (const p of ordered) { out.push(p.x, 0, p.z); if (color) vertexColors.push(color.r, color.g, color.b) }
  }
  const bar = (out: number[], a: BoardPoint, b: BoardPoint, width: number, color?: Color) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < .01) return
    const x = -(b.z - a.z) / length * width / 2, z = (b.x - a.x) / length * width / 2
    const aa = { x: a.x + x, z: a.z + z }, ab = { x: a.x - x, z: a.z - z }
    const ba = { x: b.x + x, z: b.z + z }, bb = { x: b.x - x, z: b.z - z }
    triangle(out, aa, ba, bb, color); triangle(out, aa, bb, ab, color)
  }
  for (const path of paths) {
    const lineColor = colors[path.kind === 'jump' ? 'jump' : path.kind === 'castle' ? 'castle' : 'move']
    const last = path.points.length - 2, stop = path.target.capture ? .43 : .13
    for (let i = 0; i <= last; i++) {
      const a = path.points[i], b = path.points[i + 1], length = Math.hypot(b.x - a.x, b.z - a.z)
      if (!length) continue
      const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length
      const start = i === 0 ? .4 : 0, end = length - (i === last ? stop + .18 : 0)
      const key = `${a.x},${a.z}/${b.x},${b.z}/${path.kind}`
      if (!seen.has(key)) {
        seen.add(key)
        const step = path.kind === 'ray' ? Math.max(length, 1) : .26
        for (let offset = start; offset < end; offset += step) {
          const finish = Math.min(end, offset + (path.kind === 'ray' ? length : .16))
          const p = { x: a.x + dx * offset, z: a.z + dz * offset }, q = { x: a.x + dx * finish, z: a.z + dz * finish }
          bar(outline, p, q, .085); bar(fill, p, q, .042, lineColor)
        }
      }
      if (i === last) {
        const tip = { x: b.x - dx * stop, z: b.z - dz * stop }
        const head = (out: number[], size: number, color?: Color) => {
          const base = { x: tip.x - dx * .23 * size, z: tip.z - dz * .23 * size }
          triangle(out, tip, { x: base.x - dz * .13 * size, z: base.z + dx * .13 * size },
            { x: base.x + dz * .13 * size, z: base.z - dx * .13 * size }, color)
        }
        head(outline, 1.22); head(fill, 1, path.target.capture ? colors.capture : lineColor)
      }
    }
  }
  const make = (positions: number[]) => new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3))
  return { outline: make(outline), fill: make(fill).setAttribute('color', new Float32BufferAttribute(vertexColors, 3)) }
}

export function ChessMoveHints({ board, selected, destinations }: { board: string; selected: string; destinations: string[] }) {
  // Public session updates can recreate the array without changing any legal destination.
  const destinationKey = destinations.join(',')
  const hints = useMemo(() => chessMoveHints(board, selected, destinationKey.split(',')), [board, selected, destinationKey])
  const arrows = useMemo(() => chessArrowGeometry(hints.paths), [hints])
  useEffect(() => () => { arrows.outline.dispose(); arrows.fill.dispose() }, [arrows])
  if (!hints.targets.length) return null
  return <group name="chess-move-hints">
    <mesh geometry={arrows.outline} position-y={.097} raycast={noRaycast} renderOrder={6}>
      <meshBasicMaterial color="#fff1d2" depthWrite={false} />
    </mesh>
    <mesh geometry={arrows.fill} position-y={.101} raycast={noRaycast} renderOrder={7}>
      <meshBasicMaterial vertexColors depthWrite={false} />
    </mesh>
    {hints.targets.map(target => <group key={target.square} name={`chess-move-target-${target.square}`} position={[target.index % 8 - 3.5, .073, 3.5 - Math.floor(target.index / 8)]}>
      <mesh rotation-x={-Math.PI / 2} raycast={noRaycast} renderOrder={2}>
        <planeGeometry args={[.92, .92]} /><meshBasicMaterial color={target.capture ? '#eaa26b' : '#6bc596'} transparent opacity={.32} depthWrite={false} />
      </mesh>
      <mesh position-y={.012} rotation-x={-Math.PI / 2} raycast={noRaycast} renderOrder={3}>
        {target.capture ? <ringGeometry args={[.575, .66, 4, 1, Math.PI / 4]} /> : <circleGeometry args={[.105, 24]} />}
        <meshBasicMaterial color={target.capture ? '#ce662b' : '#23754e'} depthWrite={false} />
      </mesh>
    </group>)}
  </group>
}
