import { afterEach, expect, it } from 'vitest'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { localMovement } from '../../src/network/localMovementPrediction'
import { avatars, authoritativePose, receive, resetWorld, sampleAvatar, useSession } from '../../src/network/worldClient'

afterEach(() => resetWorld())
const position = { lastInputSeq: 0, x: -2.025, y: .8, z: 34, yaw: 0, moving: false, running: false, swimming: false }
const motion = { epoch: 0, tick: 1, appliedInputSeq: 0, inputAgeMs: 250, velocityY: 0, grounded: true, inputActive: false }
it('wires real own-avatar prediction into the presenter without changing official or remote positions', async () => {
  resetWorld('connected')
  useSession.setState({ sessionId: '101', roomId: 'one', mapCompatible: true, mapVersion: EXPECTED_MAP_VERSION })
  receive({ type: 'WORLD_STATE', requestId: null, payload: { channelId: 'one', version: 1,
    mapVersion: EXPECTED_MAP_VERSION, avatars: [{ userId: '101', position, motion },
      { userId: '102', position: { ...position, x: 5 } }] } })
  await localMovement.prepare()
  expect(localMovement.ready).toBe(true)
  const start = performance.now()
  localMovement.intend({ dx: 1, dz: 0, run: false, jump: false }, start)
  localMovement.sentInput(1, start)
  const predicted = sampleAvatar(avatars.get('101')!, start + 17, { ...position })
  expect(predicted.x).toBeGreaterThan(position.x + .05)
  expect(authoritativePose('101')!.x).toBe(position.x)
  expect(avatars.get('101')!.current.x).toBe(position.x)
  expect(sampleAvatar(avatars.get('102')!, start + 17, { ...position }).x).toBe(5)
})
it('disables prediction immediately for a server-approved activity and incompatible maps', async () => {
  resetWorld('connected')
  useSession.setState({ sessionId: '101', roomId: 'one', mapCompatible: true })
  const state = (version: number, activity: string | null, mapVersion = EXPECTED_MAP_VERSION) => receive({
    type: 'WORLD_STATE', requestId: null, payload: { channelId: 'one', version, mapVersion,
      avatars: [{ userId: '101', position, motion: { ...motion, tick: version }, activity }] } })
  state(1, null); await localMovement.prepare()
  expect(localMovement.ready).toBe(true)
  state(2, 'BUNGEOPPANG'); expect(localMovement.ready).toBe(false)
  state(3, null); expect(localMovement.ready).toBe(true)
  state(4, null, 'different'); expect(localMovement.ready).toBe(false)
})


it('keeps the real presenter and reporting path active for a server-directed PARK_V1 follower',async()=>{
  resetWorld('connected');useSession.setState({sessionId:'101',roomId:'one',mapCompatible:true,mapVersion:EXPECTED_MAP_VERSION})
  receive({type:'WORLD_STATE',requestId:null,payload:{channelId:'one',version:1,mapVersion:EXPECTED_MAP_VERSION,
    avatars:[{userId:'101',position,motion:{...motion,epoch:10,profile:'PARK_V1',authority:'CLIENT_VALIDATED',
      steering:{dx:1,dz:0,run:true,targetX:10,targetZ:34}}}]}})
  await localMovement.prepare();avatars.get('101')!.followTargetId='102'
  const start=performance.now();localMovement.intend({dx:0,dz:0,run:false,jump:false},start)
  const displayed=sampleAvatar(avatars.get('101')!,start+120,{...position})
  expect(localMovement.ready).toBe(true);expect(displayed.x).toBeGreaterThan(position.x+.1)
  expect(localMovement.positionReport(1,{dx:0,dz:0,run:false,jump:false},start+130)).toMatchObject({manual:false,run:true})
  expect(authoritativePose('101')!.x).toBe(position.x)
})
