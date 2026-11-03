import { beforeEach, expect, it } from 'vitest'
import { receive, resetWorld, useSession } from '../../src/network/worldClient'
import { worldState } from '../../src/network/protocol'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'

const pose = { lastInputSeq: 0, x: 0, y: .84, z: 34, yaw: 0, moving: false, running: false, swimming: false }
const snapshot = (version: number, active: boolean) => ({ channelId:'a', version, mapVersion:EXPECTED_MAP_VERSION,
  avatars: ['101','102'].map(userId => ({ userId, position:pose, activity:active && userId==='102' ? 'WATCHING' : null })),
  gameWatches: active ? { '102': { gameId:'game', tableId:'table' } } : {} })
const emit = (payload: ReturnType<typeof snapshot>) => receive({ type:'WORLD_STATE',requestId:null,payload })
beforeEach(() => {
  resetWorld()
  receive({ type:'CONNECTED',requestId:null,payload:{ userId:'101' } })
  receive({ type:'CHANNEL_STATE',requestId:null,payload:{ channelId:'a',name:'공원',version:1,currentUsers:2,capacity:4,userIds:['101','102'] } })
})
it('approved member presence is cleared on end and stale snapshots cannot revive it', () => {
  emit(snapshot(1,true))
  expect(useSession.getState().activities['102']).toBe('WATCHING')
  expect(Object.values(useSession.getState().gameWatches).filter(w => w.gameId==='game')).toHaveLength(1)
  emit(snapshot(2,false)); emit(snapshot(1,true))
  expect(useSession.getState().gameWatches).toEqual({})
  expect(useSession.getState().activities['102']).toBeUndefined()
})
it('leaving a channel clears approved spectator presence', () => {
  emit(snapshot(1,true))
  receive({ type:'CHANNEL_LEFT',requestId:null,payload:{ channelId:'a' } })
  expect(useSession.getState().gameWatches).toEqual({})
})
it('rejects a spectator map containing an avatar outside this world', () => {
  expect(() => worldState({ ...snapshot(1,true),gameWatches:{ '999':{ gameId:'game',tableId:'table' } } })).toThrow()
})
