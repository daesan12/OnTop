import { afterEach, expect, it } from 'vitest'
import { receive, resetWorld, clearChannel, useSession } from '../../src/network/worldClient'
import { worldState } from '../../src/network/protocol'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

const position = { x: 0, y: .8, z: 34, yaw: 0, lastInputSeq: 0, moving: false, running: false, swimming: false }
const snapshot = (version: number, activity?: unknown) => ({ channelId: 'park', version, mapVersion: EXPECTED_MAP_VERSION,
  avatars: [{ userId: '101', position }, { userId: '102', position, activity }] })
function begin() {
  resetWorld()
  receive({ type: 'CONNECTED', requestId: null, payload: { userId: '101' } })
  receive({ type: 'CHANNEL_STATE', requestId: null,
    payload: { channelId: 'park', name: '공원', capacity: 16, currentUsers: 2, version: 1, userIds: ['101', '102'] } })
}
afterEach(() => resetWorld())

it('accepts only supported public activity while remaining compatible with older snapshots', () => {
  expect(worldState(snapshot(1, 'BUNGEOPPANG')).avatars[1]!.activity).toBe('BUNGEOPPANG')
  expect(() => worldState(snapshot(1))).not.toThrow()
  expect(() => worldState(snapshot(1, '<script>fake status</script>'))).toThrow()
})
it('projects remote activity, ignores stale or foreign-channel updates, and clears an ended round', () => {
  begin()
  receive({ type: 'WORLD_STATE', requestId: null, payload: snapshot(2, 'BUNGEOPPANG') })
  expect(useSession.getState().activities).toEqual({ '102': 'BUNGEOPPANG' })
  receive({ type: 'WORLD_STATE', requestId: null, payload: snapshot(1, null) })
  receive({ type: 'WORLD_STATE', requestId: null, payload: { ...snapshot(3, null), channelId: 'other' } })
  expect(useSession.getState().activities).toEqual({ '102': 'BUNGEOPPANG' })
  expect(useSession.getState().messages).toEqual([])
  receive({ type: 'WORLD_STATE', requestId: null, payload: snapshot(3, null) })
  expect(useSession.getState().activities).toEqual({})
})
it('drops activity when an avatar leaves, the map is incompatible or the channel is cleared', () => {
  begin()
  const world = (payload: ReturnType<typeof snapshot>) => receive({ type: 'WORLD_STATE', requestId: null, payload })
  world(snapshot(1, 'BUNGEOPPANG'))
  world({ ...snapshot(2, 'BUNGEOPPANG'), avatars: [] })
  expect(useSession.getState().activities).toEqual({})
  world({ ...snapshot(3, 'BUNGEOPPANG'), mapVersion: 'other-map' })
  expect(useSession.getState().activities).toEqual({})
  world(snapshot(4, 'BUNGEOPPANG')); clearChannel()
  expect(useSession.getState().activities).toEqual({})
})
