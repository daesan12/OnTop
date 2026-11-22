import { useEffect, useMemo, type RefObject } from 'react'
import {
  BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute,
  OctahedronGeometry, Shape, ShapeUtils, TorusGeometry, TubeGeometry, Vector2, Vector3, type Group,
} from 'three'
import { PropBuilder } from '../src/world/art/propGeometry'

function pendantArt() {
  const positions: number[] = [], colors: number[] = []
  const palette = ['#071a25', '#102c3b', '#1d4050', '#09202d', '#274b58', '#0c2433', '#365e6b']
  let facet = 0
  const triangle = (a: number[], b: number[], c: number[]) => {
    const rgb = new Color(palette[(facet++ * 5 + 3) % palette.length]!)
    for (const p of [a, b, c]) { positions.push(...p); colors.push(rgb.r, rgb.g, rgb.b) }
  }
  const ring = (n: number, x: number, y: number, z: number) => Array.from({ length: n }, (_, i) => {
    const a = i * Math.PI * 2 / n
    return [Math.cos(a) * x, Math.sin(a) * y, z]
  })
  const outer = ring(32, .175, .2, .065), crown = ring(16, .15, .17, .112), table = ring(8, .11, .13, .145)
  const join = (outside: number[][], inside: number[][]) => {
    for (let i = 0; i < outside.length; i++) {
      const j = Math.floor(i * inside.length / outside.length), k = Math.floor((i + 1) * inside.length / outside.length) % inside.length
      const a = outside[i]!, b = outside[(i + 1) % outside.length]!
      triangle(a, b, inside[j]!)
      if (j !== k) triangle(b, inside[k]!, inside[j]!)
    }
  }
  join(outer, crown); join(crown, table)
  for (const face of ShapeUtils.triangulateShape(table.map(p => new Vector2(p[0], p[1])), [])) {
    triangle(table[face[0]!]!, table[face[1]!]!, table[face[2]!]!)
  }
  for (let i = 0; i < outer.length; i++) triangle(outer[(i + 1) % outer.length]!, outer[i]!, [0, 0, .035])
  const gem = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setAttribute('color', new Float32BufferAttribute(colors, 3))
  gem.computeVertexNormals()

  const silver = new PropBuilder()
  silver.add('gold', new TorusGeometry(.225, .012, 8, 48), '#cbd1d1', [0, 0, .075], [.92, 1.075, 1])
  for (let i = 0; i < 18; i++) {
    const a = i * Math.PI * 2 / 18, x = Math.cos(a) * .209, y = Math.sin(a) * .244
    silver.add('gold', new CylinderGeometry(.025, .023, .015, 10), '#afb9bc', [x, y, .084], [1, 1, 1], [Math.PI / 2, 0, 0])
    silver.add('stone', new OctahedronGeometry(.023, 1), i % 4 === 0 ? '#b9cbd0' : '#edf0ed', [x, y, .108], [1, 1, 1], [0, 0, a], false, true)
  }
  silver.add('gold', new TorusGeometry(.038, .009, 7, 20), '#d0d4d3', [0, .285, .085], [.72, 1, 1])
  const chain = new CatmullRomCurve3([
    new Vector3(-.25, .33, -.02), new Vector3(-.21, .43, .04), new Vector3(-.13, .43, .1),
    new Vector3(0, .321, .1), new Vector3(.13, .43, .1), new Vector3(.21, .43, .04), new Vector3(.25, .33, -.02),
  ])
  silver.add('gold', new TubeGeometry(chain, 60, .004, 5, false), '#c1c6c5')
  for (let i = 0; i < 36; i++) {
    const p = chain.getPoint(i / 35)
    silver.add('gold', new TorusGeometry(.01, .003, 5, 8), '#d8dcd9', p.toArray(), [1, 1, 1], [i % 2 ? .7 : -.15, 0, i * .3])
  }
  const shape = new Shape().moveTo(0, -.385)
  shape.bezierCurveTo(-.1, -.3, -.34, -.26, -.35, -.02)
    .bezierCurveTo(-.39, .17, -.25, .445, 0, .445)
    .bezierCurveTo(.25, .445, .39, .17, .35, -.02)
    .bezierCurveTo(.34, -.26, .1, -.3, 0, -.385)
  const bust = new ExtrudeGeometry(shape, { depth: .13, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .012, bevelThickness: .012, curveSegments: 24 })
  bust.translate(0, 0, -.1)
  const outline = new CatmullRomCurve3(shape.getSpacedPoints(72).map(p => new Vector3(p.x, p.y, .045)), true)
  const piping = new TubeGeometry(outline, 100, .006, 5, true)
  return { gem, silver: silver.finish(), bust, piping }
}

/** The reference pendant rests on a matte necklace stand inside the existing glass case. */
export function DiamondPendant({ at, reference }: { at: readonly [number, number, number]; reference: RefObject<Group | null> }) {
  const art = useMemo(pendantArt, [])
  useEffect(() => () => {
    art.gem.dispose(); art.bust.dispose(); art.piping.dispose()
    Object.values(art.silver).forEach(geometry => geometry?.dispose())
  }, [art])
  return <group name="interior-diamond-pendant-display" position={[...at]} rotation={[0, Math.PI - .2, 0]}>
    <group rotation={[-.16, 0, 0]}>
      <mesh name="pendant-velvet-stand" geometry={art.bust} dispose={null}><meshStandardMaterial color="#454a53" roughness={1} metalness={0} /></mesh>
      <mesh geometry={art.piping} dispose={null}><meshStandardMaterial color="#1e252d" roughness={.9} /></mesh>
      <group ref={reference} name="interior-diamond-pendant">
        <mesh geometry={art.gem} dispose={null}><meshPhysicalMaterial vertexColors side={2} roughness={.16} metalness={.15} clearcoat={1} clearcoatRoughness={.08} /></mesh>
        {Object.entries(art.silver).map(([finish, geometry]) => <mesh key={finish} geometry={geometry} dispose={null}>
          <meshStandardMaterial vertexColors roughness={finish === 'stone' ? .14 : .26} metalness={finish === 'stone' ? .2 : .8} />
        </mesh>)}
      </group>
    </group>
  </group>
}
