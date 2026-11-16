import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { tableState, tableSummary, worldState } from '../../src/network/protocol'
import { tableSeats, TABLE_SEATS } from '../../src/config/table-seats'
import { readFileSync } from 'node:fs'
import type { PhysicalBox } from '../../src/map/park/physics'
import { furnitureLandingPosition } from '../../src/network/furnitureLanding'

const room = (count = 8) => ({ tableId: 'stone', version: 1, capacity: count, minimumPlayers: 2,
  seats: Array.from({ length: count }, (_, index) => ({ seatNumber: index + 1, userId: String((index + 1) * 101), ready: true })),
  allReady: true, selectorUserId: '101', gameCode: 'STONE_RUMBLE', targetScore: null,
  betAmountPerPlayer: 0, gameId: null, selectedPlayers: count, startMode: 'MANUAL' })
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('공원 돌탑 로비', () => {
  let rules: typeof import('../../src/features/tableLobby/tabletModel')
  beforeAll(async () => {
    // 같은 feature flag의 순수 인원 규칙은 새 맵/월드 모듈을 인원마다 다시 로드하지 않는다.
    vi.stubEnv('VITE_STONE_RUMBLE_ENABLED', 'true'); vi.resetModules()
    rules = await import('../../src/features/tableLobby/tabletModel')
  }, 30000)
  it.each([2, 3, 4, 5, 6, 7, 8])('%d인 정원과 모든 준비를 읽고 방장만 시작한다', count => {
    const { manualStartAllowed, approvedChairCount } = rules
    const state = tableState(room(count))
    expect(approvedChairCount(state, count)).toBe(count)
    expect(manualStartAllowed(state, '101', count)).toBe(true)
    expect(manualStartAllowed(state, '202', count)).toBe(false)
    expect(manualStartAllowed({ ...state, allReady: false }, '101', count)).toBe(false)
    expect(manualStartAllowed({ ...state, seats: state.seats.slice(0, -1) }, '101', count)).toBe(false)
  })

  it('게임 선택과 전체 판돈 검증은 돌탑만 여덟명으로 확장한다', async () => {
    vi.stubEnv('VITE_STONE_RUMBLE_ENABLED', 'true'); vi.resetModules()
    const { TABLE_GAMES, gameSelection } = await import('../../src/features/tableLobby/model')
    expect(TABLE_GAMES.find(game => game.code === 'STONE_RUMBLE')?.capacity).toBe(8)
    expect(TABLE_GAMES.find(game => game.code === 'ONE_CARD')?.capacity).toBe(4)
    expect(gameSelection('STONE_RUMBLE', 0)).toEqual({ gameCode: 'STONE_RUMBLE', betAmountPerPlayer: 0 })
    expect(() => gameSelection('STONE_RUMBLE', Math.floor(Number.MAX_SAFE_INTEGER / 8) + 1)).toThrow()
    expect(() => tableState({ ...room(8), gameCode: 'ONE_CARD' })).toThrow()
    expect(() => tableState(room(9))).toThrow()
    expect(() => tableSummary({ ...room(), occupiedSeats: 8, availableSeats: 0, joinable: false, status: 'WAITING', chairCount: 8 })).not.toThrow()
  })

  it('세계의 5~8번 좌석은 승인된 돌탑 정원과 함께 전달되어야 한다', () => {
    const payload = { channelId: 'channel', version: 1, mapVersion: 'map', tables: [{ tableId: 'stone', anchorId: 'table-1', chairCount: 8, gameCode: 'STONE_RUMBLE' }],
      avatars: [{ userId: '808', position: { lastInputSeq: 0, x: 0, y: .8, z: 0, yaw: 0, moving: false, running: false, swimming: false }, tableSeat: { tableId: 'stone', seatNumber: 8 } }] }
    expect(worldState(payload).avatars[0]?.tableSeat?.seatNumber).toBe(8)
    expect(() => worldState({ ...payload, tables: [] })).toThrow()
    expect(() => worldState({ ...payload, tables: [{ ...payload.tables[0], gameCode: 'ONE_CARD' }] })).toThrow()
  })

  it('기존 네 좌석은 보존하고 모서리에 네 자리를 추가한다', () => {
    const anchor = { id: 'table-1', position: [0, 0, 0] as [number, number, number], pavilionId: 'P1',
      assetId: 'fixture/table', spectatorRadius: 8, seatAnchors: TABLE_SEATS.map(seat => [seat.x, 0, seat.z] as [number, number, number]) }
    expect(tableSeats(anchor)).toEqual(TABLE_SEATS)
    const seats = tableSeats(anchor, 8)
    expect(seats).toHaveLength(8)
    expect(seats.slice(0, 4)).toEqual(TABLE_SEATS)
    expect(new Set(seats.map(seat => `${seat.x}/${seat.z}`)).size).toBe(8)
    expect(seats.every(seat => [seat.x, seat.z, seat.yaw].every(Number.isFinite))).toBe(true)
    const map = JSON.parse(readFileSync(new URL('../../generated/park-renewal/server-map.json', import.meta.url), 'utf8'))
    const boxes = (map.data.physics.boxes as PhysicalBox[]).filter(box => box.id.startsWith('table-17-'))
    expect(boxes.filter(box => box.id.includes('-chair-'))).toHaveLength(8)
    expect(boxes.at(-1)?.id).toBe('table-17-chair-7')
    const extra = boxes.at(-1)!, pose = { x: extra.center[0], y: extra.center[1], z: extra.center[2] }
    expect(furnitureLandingPosition(pose, [extra], .8, .4, new Map([['table-17', 4]]))).toEqual(pose)
    expect(furnitureLandingPosition(pose, [extra], .8, .4, new Map([['table-17', 8]]))).not.toEqual(pose)
  })
})
