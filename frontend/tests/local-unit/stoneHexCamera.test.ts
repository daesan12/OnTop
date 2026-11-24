import { expect, it } from 'vitest'
import { advanceStoneCamera, createStoneCamera, stoneMovement, turnStoneCamera, STONE_CAMERA_MAX_PITCH, STONE_CAMERA_MIN_PITCH } from '../../src/game/stone-rumble/camera'
import { STONE_FLOOR_RADII, STONE_TILE_COUNTS, STONE_TILE_SIZE, stoneTileAt, stoneTileRing, stoneTileX, stoneTileZ } from '../../src/game/stone-rumble/layout'
import { parseStoneState } from '../../src/game/stone-rumble/protocol'
import fixture from '../fixtures/stone-rumble-eight.json'

it('육각 발판의 중심과 여섯 이웃은 서버와 같은 2.6m 간격으로 연결된다', () => {
  const neighbors = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]
  for (const [q, r] of neighbors) {
    expect(Math.hypot(stoneTileX(q!, r!), stoneTileZ(r!))).toBeCloseTo(STONE_TILE_SIZE, 12)
  }
  for (let floor = 0; floor < 3; floor++) {
    const radius = STONE_FLOOR_RADII[floor]!
    let count = 0
    for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
      if (stoneTileRing(q, r) > radius) continue
      expect(stoneTileAt(stoneTileX(q, r), stoneTileZ(r))).toEqual({ q, r })
      count++
    }
    expect(count).toBe(STONE_TILE_COUNTS[floor])
  }
})

it('기울어진 육각 경계 양쪽과 사각 격자의 옛 모서리를 구별한다', () => {
  const x = stoneTileX(0, 1), z = stoneTileZ(1)
  expect(stoneTileAt(x * .49, z * .49)).toEqual({ q: 0, r: 0 })
  expect(stoneTileAt(x * .51, z * .51)).toEqual({ q: 0, r: 1 })
  expect(stoneTileAt(1.2, 1.2)).toEqual({ q: 0, r: 1 })
})

it('키를 누른 채 카메라를 돌리면 이동은 현재 화면을 따르고 대각선 속도는 일정하다', () => {
  expect(stoneMovement(0, -1, 0)).toEqual({ x: 0, z: -1 })
  expect(stoneMovement(0, -1, Math.PI / 2).x).toBeCloseTo(-1)
  expect(stoneMovement(0, -1, Math.PI / 2).z).toBeCloseTo(0)
  expect(Math.hypot(...Object.values(stoneMovement(1, -1, .7)))).toBeCloseTo(1)
  expect(stoneMovement(0, 0, .7)).toEqual({ x: 0, z: 0 })
})

it('카메라는 아래층을 내려다볼 수 있고 극점 반전과 프레임 지연의 급회전을 제한한다', () => {
  const camera = createStoneCamera()
  turnStoneCamera(camera, 100, 10000)
  expect(camera.yaw).toBeCloseTo(-.3)
  expect(camera.pitch).toBe(STONE_CAMERA_MAX_PITCH)
  advanceStoneCamera(camera, 1 / 60)
  expect(camera.renderedYaw).toBeLessThan(0)
  expect(camera.renderedPitch).toBeGreaterThan(.46)
  turnStoneCamera(camera, 0, -10000)
  expect(camera.pitch).toBe(STONE_CAMERA_MIN_PITCH)
  camera.yaw = Math.PI
  const previous = camera.renderedYaw
  advanceStoneCamera(camera, 10)
  expect(Math.abs(camera.renderedYaw - previous)).toBeLessThanOrEqual(.6 + 1e-9)
})

it('옛 사각 경기장 응답과 중복·누락·경기장 밖 육각 발판은 화면에 섞지 않는다', () => {
  expect(parseStoneState(fixture).tileLayout).toBe('HEX_AXIAL_V1')
  expect(() => parseStoneState({ ...fixture, tileLayout: undefined })).toThrow()
  expect(() => parseStoneState({ ...fixture, tiles: fixture.tiles.slice(1) })).toThrow()
  expect(() => parseStoneState({ ...fixture, tiles: fixture.tiles.map((tile, i) => i ? tile : fixture.tiles[1]) })).toThrow()
  expect(() => parseStoneState({ ...fixture, tiles: fixture.tiles.map((tile, i) => i ? tile : { ...tile, q: 8, r: 8 }) })).toThrow()
})
