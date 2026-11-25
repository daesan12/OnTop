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
  for (let floor = 0; floor < 8; floor++) {
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

it('옛 경기장 응답과 중복·잘못된 번호·잘린 발판 표시는 거절한다', () => {
  expect(parseStoneState(fixture).tileLayout).toBe('HEX_AXIAL_V3')
  expect(() => parseStoneState({ ...fixture, tileLayout: undefined })).toThrow()
  expect(() => parseStoneState({ ...fixture, tileMarks: undefined })).toThrow()
  expect(() => parseStoneState({ ...fixture, tileMarks: [[0, 1000, 1], [0, 2000, 1]] })).toThrow()
  expect(() => parseStoneState({ ...fixture, tileMarks: [[1378, 1000, 1]] })).toThrow()
  expect(() => parseStoneState({ ...fixture, tileMarks: [[0, 1000, true]] })).toThrow()
  expect(() => parseStoneState({ ...fixture, tileMarks: [[0, 1000.5, 1]] })).toThrow()
})

it('관전·재접속은 한 응답만으로 모든 층을 복원하고 이전 표시를 다음 경기에 섞지 않는다', () => {
  const restored = parseStoneState({ ...fixture, tileMarks: [[0, 12000, 1], [1377, 11000, 0]] })
  expect(restored.tiles).toHaveLength(1378)
  expect(restored.tiles[0]).toMatchObject({ id: 0, floor: 0, q: -8, r: 0, breakAt: 12000, stepped: true })
  expect(restored.tiles[1377]).toMatchObject({ floor: 8, breakAt: 11000, stepped: false })
  const fresh = parseStoneState(fixture)
  expect(fresh.tiles[0]!.breakAt).toBe(Number.MAX_SAFE_INTEGER)
  expect(fresh.tiles[0]!.stepped).toBe(false)
})

it('소인원 경기의 발판 번호는 해당 크기로 복원하고 인원·크기 불일치를 거절한다', () => {
  for (const [count, size, total] of [[2, 2, 484], [3, 4, 718], [4, 4, 718], [5, 8, 1378]]) {
    const raw = { ...fixture, players: fixture.players.slice(0, count), readyUserIds: [], arenaSize: size,
      tileMarks: [[0, 12000, 1], [total! - 1, 11000, 0]] }
    const state = parseStoneState(raw)
    expect(state.tiles).toHaveLength(total!)
    expect(state.tiles.at(-1)).toMatchObject({ floor: 8, breakAt: 11000 })
    expect(state.tiles[0]!.stepped).toBe(true)
    expect(() => parseStoneState({ ...raw, arenaSize: size === 2 ? 4 : 2 })).toThrow()
    expect(() => parseStoneState({ ...raw, tileMarks: [[total, 11000, 0]] })).toThrow()
  }
})
