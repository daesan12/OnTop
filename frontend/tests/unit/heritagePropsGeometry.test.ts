import { expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { mailboxArt } from '../../src/world/art/mailboxGeometry'
import { notesBoardArt } from '../../src/world/art/notesBoardGeometry'

for (const [name, art, half, height, budget] of [
  ['mailbox', mailboxArt, [.46,.40],1.8,12000],
  ['notes', notesBoardArt, [.65,.48],1.72,18000],
] as const) it(`${name} detail stays finite and inside the existing collider with a cheaper distant LOD`,()=>{
  const triangles:number[]=[]
  for(const model of [art.near,art.far]) {
    const bounds=new Box3(),point=new Vector3();let count=0
    expect(Object.keys(model).length).toBeLessThanOrEqual(7)
    for(const geometry of Object.values(model)) {
      const positions=geometry.getAttribute('position')
      for(let i=0;i<positions.count;i++) {
        point.fromBufferAttribute(positions,i)
        expect(point.toArray().every(Number.isFinite)).toBe(true)
        bounds.expandByPoint(point)
      }
      count+=(geometry.index?.count??positions.count)/3
    }
    expect(bounds.min.x).toBeGreaterThanOrEqual(-half[0]-.001);expect(bounds.max.x).toBeLessThanOrEqual(half[0]+.001)
    expect(bounds.min.z).toBeGreaterThanOrEqual(-half[1]-.001);expect(bounds.max.z).toBeLessThanOrEqual(half[1]+.001)
    expect(bounds.min.y).toBeGreaterThanOrEqual(-.001);expect(bounds.max.y).toBeLessThanOrEqual(height+.001)
    triangles.push(count)
  }
  expect(triangles[0]!).toBeLessThan(budget)
  expect(triangles[1]!).toBeLessThan(triangles[0]!*.7)
})
