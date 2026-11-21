import { useEffect, useMemo, type RefObject } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, OctahedronGeometry, TorusGeometry, type Group } from 'three'
import { PropBuilder } from '../src/world/art/propGeometry'

/** 첨부한 푸른 하트 보석의 테이블·크라운·거들·파빌리온을 각각 삼각 면으로 만든다. */
export function heartDiamondGeometry() {
  const positions: number[] = [], colors: number[] = [], count = 40
  const palette = ['#061d57', '#0c3881', '#195da8', '#537fc0', '#103571', '#96b9df', '#182b67', '#d4e4f3']
  const edge = Array.from({ length: count }, (_, i) => {
    const t = i / count * Math.PI * 2
    return [16 * Math.sin(t) ** 3 / 18, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 18 + .1] as const
  })
  const triangle = (a: number[], b: number[], c: number[], color: string) => {
    const rgb = new Color(color)
    for (const p of [a, b, c]) { positions.push(...p.map(v => v * .38)); colors.push(rgb.r, rgb.g, rgb.b) }
  }
  for (let i = 0; i < count; i++) {
    const a = edge[i]!, b = edge[(i + 1) % count]!
    const outerA = [a[0], a[1], 0], outerB = [b[0], b[1], 0]
    const innerA = [a[0] * .65, a[1] * .65, .25], innerB = [b[0] * .65, b[1] * .65, .25]
    triangle([0, .04, .27], innerA, innerB, palette[(i * 3) % palette.length]!)
    triangle(innerA, outerA, outerB, palette[(i + 2) % palette.length]!)
    triangle(innerA, outerB, innerB, palette[(i + 5) % palette.length]!)
    triangle(outerB, outerA, [0, -.1, -.48], palette[(i + 1) % 4]!)
  }
  const gem = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setAttribute('color', new Float32BufferAttribute(colors, 3))
  gem.computeVertexNormals(); gem.computeBoundingSphere()
  const setting = new PropBuilder()
  for (const [x, y] of edge) setting.add('gold', new OctahedronGeometry(.024, 0), '#e1eaf3', [x * .408, y * .408, -.006])
  setting.add('gold', new TorusGeometry(.19, .018, 8, 32), '#c4ccd5', [0, -.05, -.13], [1, 1, 1], [Math.PI / 2, 0, 0])
  return { gem, setting: setting.finish() }
}

export function HeartDiamond({ at, reference }: { at: readonly [number, number, number]; reference: RefObject<Group | null> }) {
  const art = useMemo(heartDiamondGeometry, [])
  useEffect(() => () => { art.gem.dispose(); for (const geometry of Object.values(art.setting)) geometry?.dispose() }, [art])
  return <group ref={reference} position={[...at]} name="interior-heart-diamond">
    <mesh geometry={art.gem} dispose={null}><meshStandardMaterial vertexColors side={2} roughness={.16} metalness={.22} emissive="#102660" emissiveIntensity={.5} /></mesh>
    {Object.entries(art.setting).map(([finish, geometry]) => <mesh key={finish} geometry={geometry} dispose={null}>
      <meshStandardMaterial vertexColors roughness={.16} metalness={.65} emissive="#b4c2d4" emissiveIntensity={.2} />
    </mesh>)}
  </group>
}
