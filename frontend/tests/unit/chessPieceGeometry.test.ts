import { afterAll, describe, expect, it } from 'vitest'
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, SphereGeometry, Vector3, type BufferGeometry } from 'three'
import { createChessPieceGeometry, disposeChessPieceGeometry } from '../../src/game/chess/ChessPiece3D'

const geometry = createChessPieceGeometry()
const triangles = (part: BufferGeometry) => (part.index?.count ?? part.getAttribute('position').count) / 3
afterAll(() => disposeChessPieceGeometry(geometry))

describe('체스 기물 입체 에셋', () => {
  it('모든 메시의 위치·법선·UV가 유효하고 한 칸의 폭과 킹 높이 예산을 지킨다', () => {
    for (const part of [...Object.values(geometry.bodies), geometry.horse, geometry.mane, geometry.mitre, geometry.rookTooth, geometry.cross]) {
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = part.getAttribute(name)
        expect(attribute.count).toBeGreaterThan(0)
        expect([...attribute.array].every(Number.isFinite)).toBe(true)
      }
      part.computeBoundingBox()
      expect(part.boundingBox!.min.x).toBeGreaterThan(-.5)
      expect(part.boundingBox!.max.x).toBeLessThan(.5)
      expect(part.boundingBox!.max.y).toBeLessThan(1.6)
      expect(part.boundingBox!.min.y).toBeGreaterThan(-.1)
    }
  })
  it('비숍 홈은 실제로 뚫려 있고 옆 머리에는 표면이 남는다', () => {
    const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(geometry.mitre, material)
    const through = (x: number, y: number) => new Raycaster(new Vector3(x, y, 1), new Vector3(0, 0, -1)).intersectObject(mesh)
    expect(through(.08, 1.25)).toHaveLength(0)
    expect(through(.08, 1.09).length).toBeGreaterThan(0)
    material.dispose()
  })
  it('비숍 홈의 안쪽도 닫힌 면이 있어 속이 빈 껍질이 아니다', () => {
    const material = new MeshBasicMaterial(), mesh = new Mesh(geometry.mitre, material)
    const hits = new Raycaster(new Vector3(0, 1.17, 0), new Vector3(1, -1, 0).normalize()).intersectObject(mesh)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].distance).toBeGreaterThan(.015)
    expect(hits[0].distance).toBeLessThan(.03)
    material.dispose()
  })
  it('32개 세트의 주요 조각과 장식이 삼각형 25만 개 예산 안에 들어간다', () => {
    const sphere = new SphereGeometry(1, 32, 24)
    const counts: Record<string, number> = { P: 16, N: 4, B: 4, R: 4, Q: 2, K: 2 }
    const bodies = Object.entries(geometry.bodies).reduce((sum, [kind, part]) => sum + counts[kind] * triangles(part), 0)
    const sculpted = 4 * (triangles(geometry.horse) + triangles(geometry.mane) + triangles(geometry.mitre))
      + 24 * triangles(geometry.rookTooth) + 2 * triangles(geometry.cross)
    // Pawn heads plus a conservative allowance for crown/eyes, and the 32 thin base rings.
    const ornaments = 16 * triangles(sphere) + 16000 + 32 * 64 * 6 * 2
    expect(bodies + sculpted + ornaments).toBeLessThan(250000)
    sphere.dispose()
  })
})
