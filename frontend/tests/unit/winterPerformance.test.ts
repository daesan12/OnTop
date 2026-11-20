import { describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { localSnowballAim, localSnowballDistance, PreparedSnowballAim } from '../../src/features/winter/localAim'
import { RoofSnowCache } from '../../src/features/winter/RoofSnowCache'
import { snowRoofGeometry } from '../../src/features/winter/roofSnow'

const origin = { x: 0, y: 1, z: 0 }
const aim = localSnowballAim('park', 'self', origin, 0, 16, [])

describe('겨울 미리보기 비용과 수명', () => {
  it('소지·대기 중에는 서버 조회가 없고 준비 동작 하나에 한 번만 요청한다', async () => {
    const prepared = new PreparedSnowballAim(), request = vi.fn(async () => aim)
    prepared.reset('self/park')
    for (let frame = 0; frame < 600; frame++) prepared.prepare('', request)
    expect(request).not.toHaveBeenCalled()
    for (let frame = 0; frame < 30; frame++) prepared.prepare('throw-1', request)
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(1)
    expect(prepared.aim).toEqual(aim)
    prepared.prepare('', request); prepared.prepare('throw-2', request)
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('늦게 온 응답과 실패가 채널 전환·다음 준비 동작의 표적을 덮어쓰지 않는다', async () => {
    const prepared = new PreparedSnowballAim()
    let resolve!: (value: typeof aim) => void
    prepared.reset('self/park'); prepared.prepare('old', () => new Promise(r => { resolve = r }))
    prepared.reset('self/other'); resolve(aim); await Promise.resolve()
    expect(prepared.aim).toBeNull()
    prepared.prepare('new', async () => { throw Error('offline') })
    await Promise.resolve(); await Promise.resolve()
    expect(prepared.aim).toBeNull()
  })
  it('로컬 물리의 첫 벽까지만 표시하고 그 뒤의 캐릭터는 표적으로 잡지 않는다', () => {
    const distance = localSnowballDistance(origin, 0, (_, to) => to.z === 5 ? .4 : 1, () => -10)
    expect(distance).toBeCloseTo(4.7)
    expect(localSnowballAim('park', 'self', origin, 0, distance,
      [{ userId: 'behind', position: { x: 0, y: 1.5, z: 7 } }]).hitUserId).toBe('')
    const target = localSnowballAim('park', 'self', origin, 0, distance,
      [{ userId: 'near', position: { x: .3, y: 1.5, z: 3 } }])
    expect(target.distance).toBe(3); expect(target.hitUserId).toBe('near')
    expect(target.endY).toBeGreaterThan(origin.y)
    expect(localSnowballDistance(origin, 0, () => undefined, () => 2)).toBe(0)
  })
  it('초기 지붕은 한 번만 만들고 대기 중에는 씬·건물 트리를 다시 탐색하지 않는다', () => {
    const scene = new Group(), roof = new Group(), original = new BoxGeometry(4, 4, 4)
    const material = new MeshBasicMaterial(), mesh = new Mesh(original, material)
    roof.name = 'facility-pavilion'; mesh.position.y = 2; roof.add(mesh); scene.add(roof)
    const build = vi.fn(snowRoofGeometry), cache = new RoofSnowCache(scene, [], build)
    expect(cache.processOne()).toBe(true)
    const sceneScan = vi.spyOn(scene, 'traverse'), roofScan = vi.spyOn(roof, 'traverse')
    for (let frame = 0; frame < 100; frame++) expect(cache.processOne()).toBe(false)
    expect(build).toHaveBeenCalledTimes(1)
    expect(sceneScan).not.toHaveBeenCalled(); expect(roofScan).not.toHaveBeenCalled()
    const snow = roof.getObjectByName('winter-roof-snow') as Mesh
    expect(snow.geometry.getAttribute('position').count).toBe(6)
    cache.show(false); expect(snow.visible).toBe(false)
    cache.show(true); expect(snow.visible).toBe(true)
    cache.dispose(); original.dispose(); material.dispose()
  })
  it('늦은 건물과 geometry 교체·보호영역 변경을 갱신하고 제거 후에는 자원을 정리한다', () => {
    const scene = new Group(), roof = new Group(), material = new MeshBasicMaterial()
    const cache = new RoofSnowCache(scene, [], snowRoofGeometry)
    expect(cache.processOne()).toBe(false)
    roof.name = 'facility-cafe'; scene.add(roof)
    expect(cache.processOne()).toBe(true)
    const original = new BoxGeometry(4, 4, 4), replacement = new BoxGeometry(4, 6, 4)
    const mesh = new Mesh(original, material); mesh.position.y = 2; roof.add(mesh)
    expect(cache.processOne()).toBe(true)
    const oldSnow = roof.getObjectByName('winter-roof-snow') as Mesh, disposed = vi.spyOn(oldSnow.geometry, 'dispose')
    mesh.geometry = replacement
    expect(cache.processOne()).toBe(true); expect(disposed).toHaveBeenCalledTimes(1)
    const newSnow = roof.getObjectByName('winter-roof-snow') as Mesh
    expect(newSnow.geometry.getAttribute('position').getY(0)).toBeCloseTo(5.055)
    cache.protect([{ x: 0, z: 0, radius: 5, topY: 8 }]); cache.processOne()
    const protectedSnow = roof.getObjectByName('winter-roof-snow') as Mesh
    expect(protectedSnow.geometry.getAttribute('position').count).toBe(0)
    const removed = vi.spyOn(protectedSnow.geometry, 'dispose')
    scene.remove(roof); expect(removed).toHaveBeenCalledTimes(1)
    expect(cache.processOne()).toBe(false)
    scene.add(roof); expect(cache.processOne()).toBe(true)
    cache.dispose(); expect(roof.getObjectByName('winter-roof-snow')).toBeUndefined()
    scene.remove(roof); scene.add(roof)
    expect(cache.processOne()).toBe(false)
    original.dispose(); replacement.dispose(); material.dispose()
  })
})
