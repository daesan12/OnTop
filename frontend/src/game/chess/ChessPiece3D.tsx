import { ExtrudeGeometry, LatheGeometry, Shape, Vector2, type BufferGeometry, type Material } from 'three'

const base = [[0, 0], [.25, 0], [.3, .035], [.31, .09], [.285, .14], [.25, .16], [.25, .21], [.2, .25]]
const profiles: Record<string, number[][]> = {
  P: [...base, [.14, .3], [.105, .49], [.17, .53], [.17, .58], [.09, .62], [0, .62]],
  N: [...base, [.16, .32], [.2, .4], [.2, .45], [0, .45]],
  B: [...base, [.14, .36], [.095, .7], [.2, .77], [.2, .82], [.09, .87], [0, .87]],
  R: [...base, [.19, .32], [.17, .7], [.25, .75], [.26, .91], [.19, .94], [0, .94]],
  Q: [...base, [.15, .37], [.1, .87], [.23, .94], [.24, 1], [.15, 1.06], [.24, 1.25], [0, 1.25]],
  K: [...base, [.16, .38], [.115, .91], [.22, .98], [.22, 1.04], [.14, 1.11], [.15, 1.23], [0, 1.23]],
}

/** Shared, volumetric geometry. Nothing in the playing board is a sprite or billboard. */
export function createChessPieceGeometry() {
  const bodies = Object.fromEntries(Object.entries(profiles).map(([kind, points]) =>
    [kind, new LatheGeometry(points.map(([r, y]) => new Vector2(r, y)), 40)]))
  const horse = new Shape()
  horse.moveTo(.2, .43); horse.bezierCurveTo(.28, .7, .2, .99, .06, 1.13)
  horse.lineTo(.07, 1.3); horse.lineTo(-.06, 1.2); horse.lineTo(-.16, 1.23)
  horse.lineTo(-.25, 1.1); horse.lineTo(-.39, .96); horse.lineTo(-.36, .83)
  horse.lineTo(-.2, .82); horse.lineTo(-.1, .92)
  horse.bezierCurveTo(-.16, .7, -.22, .6, -.19, .43); horse.closePath()
  const mitre = new Shape()
  mitre.moveTo(-.12, .84); mitre.bezierCurveTo(-.31, .99, -.12, 1.2, 0, 1.36)
  mitre.lineTo(.09, 1.22); mitre.lineTo(-.035, 1.05); mitre.lineTo(.03, 1.02)
  mitre.lineTo(.135, 1.16); mitre.bezierCurveTo(.25, 1, .2, .91, .12, .84); mitre.closePath()
  const extrude = (shape: Shape, depth: number) => {
    const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .025,
      bevelThickness: .025, bevelSegments: 3, curveSegments: 12, steps: 1 })
    geometry.translate(0, 0, -depth / 2)
    return geometry
  }
  return { bodies, horse: extrude(horse, .25), mitre: extrude(mitre, .2) }
}
export type ChessPieceGeometry = ReturnType<typeof createChessPieceGeometry>

function Solid({ geometry, material }: { geometry: BufferGeometry; material: Material }) {
  return <mesh geometry={geometry} material={material} castShadow receiveShadow dispose={null} />
}

export function ChessPiece3D({ piece, geometry, material, detail }: {
  piece: string; geometry: ChessPieceGeometry; material: Material; detail: Material
}) {
  const kind = piece.toUpperCase()
  return <group name={`piece-${piece}`} rotation-y={piece === kind ? -.35 : Math.PI - .35}>
    <Solid geometry={geometry.bodies[kind]} material={material} />
    <mesh position={[0, .18, 0]} rotation-x={Math.PI / 2} material={detail}>
      <torusGeometry args={[.248, .012, 6, 40]} />
    </mesh>
    {kind === 'P' && <mesh position={[0, .725, 0]} material={material} castShadow><sphereGeometry args={[.185, 24, 16]} /></mesh>}
    {kind === 'N' && <>
      <Solid geometry={geometry.horse} material={material} />
      {[-1, 1].map(side => <mesh key={side} position={[-.12, 1.085, side * .145]} material={detail}><sphereGeometry args={[.026, 12, 8]} /></mesh>)}
    </>}
    {kind === 'B' && <Solid geometry={geometry.mitre} material={material} />}
    {kind === 'R' && Array.from({ length: 6 }, (_, i) => <group key={i} rotation-y={i * Math.PI / 3}>
      <mesh position={[0, .99, .2]} material={material} castShadow><boxGeometry args={[.16, .18, .15]} /></mesh>
    </group>)}
    {kind === 'Q' && <>
      {Array.from({ length: 7 }, (_, i) => <group key={i} rotation-y={i * Math.PI * 2 / 7}>
        <mesh position={[0, 1.29, .19]} material={material} castShadow><sphereGeometry args={[.065, 14, 10]} /></mesh>
      </group>)}
      <mesh position={[0, 1.36, 0]} material={material} castShadow><sphereGeometry args={[.09, 20, 12]} /></mesh>
    </>}
    {kind === 'K' && <group position={[0, 1.37, 0]}>
      <mesh material={material} castShadow><boxGeometry args={[.09, .38, .1]} /></mesh>
      <mesh position={[0, .045, 0]} material={material} castShadow><boxGeometry args={[.29, .085, .1]} /></mesh>
    </group>}
  </group>
}
