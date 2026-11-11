import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { receive, resetWorld, useSession } from '../../src/network/worldClient'
import { worldState } from '../../src/network/protocol'
import { ParkRuntime } from '../../src/park/runtime/SpringParkRuntime'
import { acquireVRProtection, vrCarryProtection } from '../../src/features/vrSession/protection'
import { inputState } from '../../src/world/inputOwnership'

const position = { x: 0, y: .84, z: 78, yaw: 0, lastInputSeq: 0, moving: false, running: false, swimming: false }
const snapshot = (version: number, avatars: { userId: string; vrActive?: unknown; interactionBusy?: boolean }[]) => ({
  channelId: 'a', version, mapVersion: EXPECTED_MAP_VERSION, avatars: avatars.map(a => ({ ...a, position, carry: null })),
})
const world = (version: number, avatars: Parameters<typeof snapshot>[1]) =>
  receive({ type: 'WORLD_STATE', requestId: null, payload: snapshot(version, avatars) })

beforeEach(() => {
  resetWorld()
  receive({ type: 'CONNECTED', requestId: null, payload: { userId: '101' } })
  receive({ type: 'CHANNEL_STATE', requestId: null, payload: { channelId: 'a', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'] } })
})
afterEach(() => { inputState.mapOpen = false; resetWorld(); vi.unstubAllGlobals() })

it('VR 전용 필드를 검증하고 일반 팝업 busy 상태를 VR 표시로 오인하지 않는다', () => {
  expect(worldState(snapshot(1, [{ userId: '102', vrActive: true }]))).not.toBeNull()
  expect(() => worldState(snapshot(1, [{ userId: '102', vrActive: 'true' }]))).toThrow()
  world(1, [{ userId: '101' }, { userId: '102', interactionBusy: true }])
  expect(useSession.getState().vrPlayers).toEqual({})
})

it('종료와 원격 퇴장을 전체 스냅샷으로 반영하고 동일 VR 상태는 참조를 재사용한다', () => {
  world(1, [{ userId: '101' }, { userId: '102', vrActive: true }])
  const players = useSession.getState().vrPlayers
  expect(players).toEqual({ '102': true })
  world(2, [{ userId: '101' }, { userId: '102', vrActive: true }])
  expect(useSession.getState().vrPlayers).toBe(players)
  world(1, [{ userId: '101' }])
  expect(useSession.getState().vrPlayers).toBe(players)
  world(3, [{ userId: '101' }, { userId: '102', vrActive: false, interactionBusy: true }])
  expect(useSession.getState().vrPlayers).toEqual({})
  world(4, [{ userId: '101' }, { userId: '102', vrActive: true }])
  world(5, [{ userId: '101' }])
  expect(useSession.getState().vrPlayers).toEqual({})
})

it('연결 해제 시 즉시 초기화하며 재접속 뒤 누락된 VR 필드를 이전 표시로 복원하지 않는다', () => {
  world(1, [{ userId: '101', vrActive: true }])
  resetWorld('reconnecting')
  expect(useSession.getState().vrPlayers).toEqual({})
})

it('팝업 busy가 유지되어도 VR 종료를 별도로 전송한다', async () => {
  vi.stubGlobal('document', { querySelector: () => null })
  world(1, [{ userId: '101' }])
  const runtime = new ParkRuntime()
  const request = vi.fn(async (_type: string, payload: Record<string, unknown>) => ({ payload: { channelId: 'a', ...payload } }))
  Reflect.set(runtime, 'active', true)
  Reflect.set(runtime, 'socket', { connected: true, request })
  const release = await acquireVRProtection(runtime)
  try {
    expect(request).toHaveBeenLastCalledWith('WORLD_INTERACTION_SET', { busy: true, vrActive: true }, ['WORLD_INTERACTION_STATE'])
    inputState.mapOpen = true
    release()
    await vi.waitFor(() => expect(request).toHaveBeenLastCalledWith('WORLD_INTERACTION_SET', { busy: true, vrActive: false }, ['WORLD_INTERACTION_STATE']))
  } finally { release() }
})

it('VR 표시 미지원 서버의 일반 busy 응답만으로 VR 진입을 승인하지 않는다', async () => {
  vi.stubGlobal('document', { querySelector: () => null })
  world(1, [{ userId: '101' }])
  const runtime = new ParkRuntime()
  Reflect.set(runtime, 'active', true)
  Reflect.set(runtime, 'report', vi.fn())
  Reflect.set(runtime, 'socket', { connected: true, request: async () => ({ payload: { channelId: 'a', busy: true } }) })
  await expect(acquireVRProtection(runtime)).rejects.toThrow('VR 플레이 보호')
  expect(vrCarryProtection.active).toBe(false)
})
