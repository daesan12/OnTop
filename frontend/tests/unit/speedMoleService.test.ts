import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { speedMoleRandom, SpeedMoleRound } from '../../src/features/speedMole/game'
import { SpeedMoleService } from '../../src/features/speedMole/service'
import { openSpeedMole, closeSpeedMole, useSpeedMole } from '../../src/features/speedMole/store'
import { playArcadeGame, useArcade } from '../../src/features/arcade/store'
import { RestError } from '../../src/network/restError'
import { inputState } from '../../src/world/inputOwnership'

describe('speed mole server/client contract', () => {
  it('uses the same unsigned seeded replacement vector as Java, without waiting for animations', () => {
    const round = new SpeedMoleRound(0,speedMoleRandom(1))
    expect(round.targets.map(t=>t.hole)).toEqual([1,3,5,6])
    const taps=[1,3,5,6,0,2,7,4,1,5,2,3]
    taps.forEach((h,i)=>expect(round.strike(h,i*100).kind).toBe('hit'))
    expect(round.targets.map(t=>t.hole)).toEqual([6,7,0,5]); expect(round.score).toBe(12)
  })
  it('sends only tap evidence and the same round on a completion retry, never a client score', async () => {
    const result={id:'7',rulesVersion:1,score:1,hits:1,misses:0,completedAt:'2030-01-01T00:01:03Z',calculatedReward:0,reward:0,todayEarned:0,dailyCap:1000}
    const request=vi.fn().mockResolvedValue(result), service=new SpeedMoleService(request)
    await service.complete('7',[{hole:1,at:0}]); await service.complete('7',[{hole:1,at:0}])
    expect(request.mock.calls[0]).toEqual(request.mock.calls[1])
    expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({taps:[{hole:1,at:0}]})
  })
  it('accepts the 5-points-per-coin reward and rejects the old 40-point one', async () => {
    const result={id:'7',rulesVersion:1,score:24,hits:24,misses:0,completedAt:'2030-01-01T00:01:03Z',calculatedReward:4,reward:4,todayEarned:4,dailyCap:1000}
    const request=vi.fn().mockResolvedValue(result), service=new SpeedMoleService(request)
    await expect(service.complete('7',[])).resolves.toEqual(result)
    request.mockResolvedValue({...result,calculatedReward:0,reward:0,todayEarned:0})
    await expect(service.complete('7',[])).rejects.toThrow('저장 응답')
  })
  it('does not replace a failed server start with an unranked local game', async () => {
    const request=vi.fn().mockRejectedValue({code:'SPEED_MOLE_UNAVAILABLE'}), service=new SpeedMoleService(request)
    await expect(service.start('same_key')).rejects.toThrow('준비되지')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('rejects a mismatched rules version and malformed saved score', async () => {
    const request=vi.fn().mockResolvedValue({id:'7',seed:1,rulesVersion:2,durationMs:60000,serverNow:'2030-01-01',startedAt:'2030-01-01'})
    const service=new SpeedMoleService(request)
    await expect(service.start('x')).rejects.toThrow('규칙')
    request.mockResolvedValue({id:'7',rulesVersion:1,score:99,hits:1,misses:0,completedAt:'2030-01-01'})
    await expect(service.complete('7',[])).rejects.toThrow('저장 응답')
  })
  it('has a bounded page query and returns the personal best separately', async () => {
    const data={rulesVersion:1,period:'ALL_TIME',totalParticipants:0,offset:20,limit:20,items:[],me:null,hasMore:false}
    const request=vi.fn().mockResolvedValue(data)
    expect(await new SpeedMoleService(request).rankings(20)).toEqual(data)
    expect(request.mock.calls[0]![0]).toBe('/api/v1/minigames/speed-mole/rankings?limit=20&offset=20')
  })
})

describe('speed mole park ownership', () => {
  beforeEach(()=>{vi.stubGlobal('window',Object.assign(new EventTarget(),{location:{hostname:'localhost'}}));vi.stubGlobal('document',{pointerLockElement:null});inputState.minigameOpen=false;useSpeedMole.setState({open:false})})
  afterEach(()=>{closeSpeedMole();useArcade.setState({open:false});vi.unstubAllGlobals();vi.unstubAllEnvs()})
  it('holds movement while open, avoids duplicate starts and releases only its own flag',()=>{
    inputState.chatOpen=true
    openSpeedMole();openSpeedMole()
    expect(useSpeedMole.getState().open).toBe(true);expect(inputState.minigameOpen).toBe(true)
    closeSpeedMole();closeSpeedMole()
    expect(useSpeedMole.getState().open).toBe(false);expect(inputState.minigameOpen).toBe(false);expect(inputState.chatOpen).toBe(true)
    inputState.chatOpen=false
  })
  it.each([
    ['disabled', new RestError(503, 'SPEED_MOLE_UNAVAILABLE', 'unavailable'), '기록 서버가 아직 준비되지 않았어요.'],
    ['missing route', new RestError(404, 'HTTP_ERROR', 'not found'), '서버 응답을 확인하지 못했어요.'],
    ['database/server failure', new RestError(500, 'HTTP_ERROR', 'internal error'), '서버 응답을 확인하지 못했어요.'],
    ['network failure', new TypeError('Failed to fetch'), '서버 응답을 확인하지 못했어요.'],
  ])('allows leaving after a %s start failure without a local round', async (_name, failure, message) => {
    const request = vi.fn().mockRejectedValue(failure)
    openSpeedMole()
    await expect(new SpeedMoleService(request).start('same_key')).rejects.toThrow(message)
    expect(useSpeedMole.getState().open).toBe(true)
    // The failed start stays in the guide; closing must preserve unrelated input ownership.
    inputState.chatOpen = true
    closeSpeedMole()
    expect(useSpeedMole.getState().open).toBe(false)
    expect(inputState.minigameOpen).toBe(false)
    expect(inputState.chatOpen).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    inputState.chatOpen = false
  })
  it.each(['on-top.world','www.on-top.world','dev.on-top.world'])('opens the real arcade flow on %s in a production build',hostname=>{
    vi.stubEnv('DEV',false)
    vi.stubGlobal('window',Object.assign(new EventTarget(),{location:{hostname}}))
    useArcade.setState({open:true,selected:'speed-mole'})
    playArcadeGame()
    expect(useArcade.getState().open).toBe(false)
    expect(useSpeedMole.getState().open).toBe(true)
    expect(inputState.minigameOpen).toBe(true)
    closeSpeedMole()
    expect(inputState.minigameOpen).toBe(false)
  })
})
