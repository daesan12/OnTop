import { ExtrudeGeometry, LatheGeometry, Shape, Vector2, type BufferGeometry, type Material } from 'three'
import { bishopSlit } from './bishopGeometry'

// Rounded turned-wood profiles with plinth, fillet, collar and curved stem.
const base = [[0, 0], [.25, 0], [.282, .01], [.305, .03], [.318, .055], [.32, .085],
  [.314, .11], [.298, .132], [.272, .142], [.265, .154], [.274, .169], [.277, .188],
  [.268, .208], [.242, .223], [.214, .24], [.195, .263]]
const profiles: Record<string, number[][]> = {
  P: [...base, [.16, .3], [.13, .36], [.11, .44], [.108, .49], [.14, .515], [.17, .535], [.174, .558], [.163, .582], [.115, .608], [0, .62]],
  N: [...base, [.17, .3], [.16, .34], [.2, .37], [.215, .4], [.208, .43], [.18, .45], [0, .45]],
  B: [...base, [.16, .32], [.13, .42], [.108, .56], [.102, .68], [.12, .73], [.18, .755], [.211, .78], [.21, .807], [.18, .833], [.11, .86], [0, .87]],
  R: [...base, [.19, .3], [.177, .4], [.165, .6], [.17, .69], [.2, .725], [.24, .75], [.262, .785], [.268, .85], [.261, .925], [.244, .94], [.17, .94], [.155, .91], [.155, .85], [0, .85]],
  Q: [...base, [.16, .33], [.13, .45], [.105, .65], [.103, .83], [.13, .9], [.2, .93], [.232, .955], [.236, .985], [.22, 1.015], [.145, 1.05], [.135, 1.09], [.18, 1.145], [.225, 1.22], [.22, 1.245], [.19, 1.245], [.14, 1.15], [0, 1.14]],
  K: [...base, [.165, .34], [.14, .48], [.12, .69], [.116, .87], [.137, .94], [.195, .975], [.222, 1], [.226, 1.03], [.209, 1.06], [.15, 1.095], [.139, 1.16], [.151, 1.2], [.15, 1.235], [0, 1.245]],
}
const lathe = (points: number[][]) => new LatheGeometry(points.map(([r, y]) => new Vector2(r, y)), 64)
function extrude(shape: Shape, depth: number, bevel: number) {
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 4, curveSegments: 20, steps: 1 })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

/** Shared original geometry: carved horse, solid slit mitre, curved battlements and bevelled cross. */
export function createChessPieceGeometry() {
  const bodies = Object.fromEntries(Object.entries(profiles).map(([kind, points]) => [kind, lathe(points)]))
  const horse = new Shape()
  horse.moveTo(.19, .43); horse.bezierCurveTo(.26, .64, .25, .97, .075, 1.16)
  horse.lineTo(.085, 1.31); horse.quadraticCurveTo(.03, 1.3, -.025, 1.21)
  horse.quadraticCurveTo(-.12, 1.23, -.17, 1.12)
  horse.bezierCurveTo(-.23, 1.07, -.34, 1.01, -.385, .94)
  horse.quadraticCurveTo(-.415, .89, -.365, .845)
  horse.quadraticCurveTo(-.285, .8, -.21, .835)
  horse.lineTo(-.095, .93); horse.quadraticCurveTo(-.065, .865, -.12, .76)
  horse.bezierCurveTo(-.18, .66, -.225, .53, -.18, .43); horse.closePath()
  const mane = new Shape()
  mane.moveTo(.16, .46); mane.bezierCurveTo(.3, .7, .27, .99, .08, 1.18)
  mane.lineTo(.14, 1.2); mane.quadraticCurveTo(.34, 1.02, .32, .76)
  mane.lineTo(.305, .65); mane.lineTo(.26, .62); mane.lineTo(.285, .55); mane.lineTo(.23, .52)
  mane.lineTo(.235, .46); mane.closePath()
  const head = lathe([[0, .85], [.08, .88], [.14, .94], [.19, 1.02], [.195, 1.1], [.17, 1.2], [.105, 1.32], [0, 1.43]])
  const mitre = bishopSlit(head); head.dispose()
  const tooth = new Shape()
  tooth.absarc(0, 0, .255, -.34, .34, false)
  tooth.lineTo(.165 * Math.cos(.34), .165 * Math.sin(.34))
  tooth.absarc(0, 0, .165, .34, -.34, true); tooth.closePath()
  const rookTooth = extrude(tooth, .14, .012); rookTooth.rotateX(-Math.PI / 2)
  const cross = new Shape()
  cross.moveTo(-.044, 1.23); cross.lineTo(.044, 1.23); cross.lineTo(.044, 1.405)
  cross.lineTo(.145, 1.405); cross.lineTo(.145, 1.49); cross.lineTo(.044, 1.49)
  cross.lineTo(.044, 1.56); cross.lineTo(-.044, 1.56); cross.lineTo(-.044, 1.49)
  cross.lineTo(-.145, 1.49); cross.lineTo(-.145, 1.405); cross.lineTo(-.044, 1.405); cross.closePath()
  return { bodies, horse: extrude(horse, .19, .042), mane: extrude(mane, .09, .012), mitre,
    rookTooth, cross: extrude(cross, .075, .012) }
}
export type ChessPieceGeometry = ReturnType<typeof createChessPieceGeometry>
export function disposeChessPieceGeometry(geometry: ChessPieceGeometry) {
  for (const part of [...Object.values(geometry.bodies), geometry.horse, geometry.mane, geometry.mitre, geometry.rookTooth, geometry.cross]) part.dispose()
}
function Solid({ geometry, material }: { geometry: BufferGeometry; material: Material }) {
  return <mesh geometry={geometry} material={material} castShadow receiveShadow dispose={null} />
}

export function ChessPiece3D({ piece, geometry, material, detail, eye, mane }: {
  piece: string; geometry: ChessPieceGeometry; material: Material; detail: Material; eye: Material; mane: Material
}) {
  const kind = piece.toUpperCase()
  return <group name={'piece-' + piece} rotation-y={piece === kind ? -.35 : Math.PI - .35}>
    <Solid geometry={geometry.bodies[kind]} material={material} />
    <mesh position={[0, .174, 0]} rotation-x={Math.PI / 2} material={detail}>
      <torusGeometry args={[.276, .008, 6, 64]} />
    </mesh>
    {kind === 'P' && <mesh position={[0, .73, 0]} material={material} castShadow><sphereGeometry args={[.188, 32, 24]} /></mesh>}
    {kind === 'N' && <>
      <Solid geometry={geometry.horse} material={material} /><Solid geometry={geometry.mane} material={mane} />
      {[-1, 1].map(side => <group key={side}>
        <mesh position={[-.095, 1.085, side * .14]} material={detail}><sphereGeometry args={[.026, 16, 12]} /></mesh>
        <mesh position={[-.095, 1.085, side * .158]} material={eye}><sphereGeometry args={[.017, 16, 12]} /></mesh>
        <mesh position={[-.315, .923, side * .13]} scale={[1.3, .6, .6]} material={eye}><sphereGeometry args={[.016, 12, 8]} /></mesh>
      </group>)}
    </>}
    {kind === 'B' && <group rotation-y={-Math.PI / 2}><Solid geometry={geometry.mitre} material={material} /></group>}
    {kind === 'R' && Array.from({ length: 6 }, (_, i) => <group key={i} rotation-y={i * Math.PI / 3} position={[0, .995, 0]}>
      <Solid geometry={geometry.rookTooth} material={material} />
    </group>)}
    {kind === 'Q' && <>
      {Array.from({ length: 7 }, (_, i) => <group key={i} rotation-y={i * Math.PI * 2 / 7}>
        <mesh position={[0, 1.285, .205]} rotation-x={.2} material={material} castShadow><coneGeometry args={[.045, .16, 16]} /></mesh>
        <mesh position={[0, 1.365, .221]} material={detail} castShadow><sphereGeometry args={[.032, 16, 12]} /></mesh>
      </group>)}
      <mesh position={[0, 1.4, 0]} material={material} castShadow><sphereGeometry args={[.075, 24, 16]} /></mesh>
    </>}
    {kind === 'K' && <Solid geometry={geometry.cross} material={material} />}
  </group>
}
