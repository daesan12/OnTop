import { describe, expect, it, vi } from 'vitest'
import { Bone, BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene, Skeleton, SkinnedMesh, Vector3, WebGLCoordinateSystem, type WebGLRenderer } from 'three'
import { snapshotParkBackground } from '../../src/game/stone-rumble/snapshotParkBackground'
import { StoneParkBackdrop } from '../../src/game/stone-rumble/StoneParkBackdrop'

describe('돌탑 공원 배경 재사용', () => {
  it('이미 로딩된 기하와 재질을 공유하고 원본 계층을 보존한다', () => {
    const source = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial()
    const original = new Mesh(geometry, material); source.add(original)
    const snapshot = snapshotParkBackground(source), mesh = snapshot.children[0] as Mesh
    expect(mesh).not.toBe(original); expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material)
    expect(original.parent).toBe(source); expect(source.children).toEqual([original])
    expect(snapshot.userData.stoneParkSnapshot).toBe(true)
    geometry.dispose(); material.dispose()
  })
  it('부모 변환과 숨김·레이어를 보존하고 사본 이동이 원본에 반영되지 않는다', () => {
    const parent = new Group(), source = new Group(), hidden = new Group()
    parent.position.set(7, 3, -5); parent.rotation.y = .4; source.position.set(2, 4, 1)
    hidden.visible = false; hidden.layers.set(3); source.add(hidden); parent.add(source)
    const snapshot = snapshotParkBackground(source)
    expect(snapshot.getWorldPosition(new Vector3()).distanceTo(source.getWorldPosition(new Vector3()))).toBeLessThan(1e-8)
    expect(snapshot.children[0]!.visible).toBe(false); expect(snapshot.children[0]!.layers.mask).toBe(hidden.layers.mask)
    snapshot.position.x += 100; expect(source.position.x).toBe(2)
  })
  it('스킨이 있는 장식도 원본 뼈를 변경하지 않는 사본을 사용한다', () => {
    const source = new Group(), bone = new Bone(), geometry = new BoxGeometry(), material = new MeshStandardMaterial()
    const original = new SkinnedMesh(geometry, material); original.add(bone); original.bind(new Skeleton([bone])); source.add(original)
    const mesh = snapshotParkBackground(source).children[0] as SkinnedMesh
    expect(mesh.skeleton).not.toBe(original.skeleton); expect(mesh.skeleton.bones[0]).not.toBe(bone)
    expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material)
    geometry.dispose(); material.dispose(); original.skeleton.dispose(); mesh.skeleton.dispose()
  })
})

describe('돌탑 공원 배경 캐시', () => {
  it('준비할 때만 공원 전 방향을 그리고 컨텍스트 복구 시 다시 찍는다', () => {
    const park = new Scene()
    const renderer = {
      autoClear: false,
      coordinateSystem: WebGLCoordinateSystem,
      xr: { enabled: false },
      getRenderTarget: () => null,
      getActiveCubeFace: () => 0,
      getActiveMipmapLevel: () => 0,
      setRenderTarget: vi.fn(),
      render: vi.fn(),
    }
    const backdrop = new StoneParkBackdrop()
    const prepare = () => backdrop.prepare(renderer as unknown as WebGLRenderer, park)

    prepare()
    prepare()
    expect(renderer.render).toHaveBeenCalledTimes(6)
    expect(backdrop.scene.background).toBeTruthy()
    expect(renderer.autoClear).toBe(false)

    backdrop.invalidate()
    prepare()
    expect(renderer.render).toHaveBeenCalledTimes(12)
    backdrop.dispose()
  })
})
