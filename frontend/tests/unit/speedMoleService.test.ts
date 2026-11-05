import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { speedMoleRandom, SpeedMoleRound } from '../../src/features/speedMole/game'
import { SpeedMoleService } from '../../src/features/speedMole/service'
import { openSpeedMole, closeSpeedMole, useSpeedMole } from '../../src/features/speedMole/store'
import { speedMoleTrialEnabled } from '../../src/features/speedMole/trial'
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
    const result={id:'7',rulesVersion:1,score:1,hits:1,misses:0,completedAt:'2030-01-01T00:01:03Z',calculatedReward:0,reward:0,todayEarned:0,dailyCap:500}
    const request=vi.fn().mockResolvedValue(result), service=new SpeedMoleService(request)
    await service.complete('7',[{hole:1,at:0}]); await service.complete('7',[{hole:1,at:0}])
    expect(request.mock.calls[0]).toEqual(request.mock.calls[1])
    expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({taps:[{hole:1,at:0}]})
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
  afterEach(()=>{closeSpeedMole();vi.unstubAllGlobals()})
  it('holds movement while open, avoids duplicate starts and releases only its own flag',()=>{
    inputState.chatOpen=true
    openSpeedMole();openSpeedMole()
    expect(useSpeedMole.getState().open).toBe(true);expect(inputState.minigameOpen).toBe(true)
    closeSpeedMole();closeSpeedMole()
    expect(useSpeedMole.getState().open).toBe(false);expect(inputState.minigameOpen).toBe(false);expect(inputState.chatOpen).toBe(true)
    inputState.chatOpen=false
  })
  it('enables deployed dev while keeping deployed production out of the entry',()=>{
    expect(speedMoleTrialEnabled('dev.on-top.world',false)).toBe(true)
    expect(speedMoleTrialEnabled('on-top.world',false)).toBe(false)
    expect(speedMoleTrialEnabled('localhost',false)).toBe(false)
    expect(speedMoleTrialEnabled('localhost',true)).toBe(true)
    vi.stubGlobal('window',Object.assign(new EventTarget(),{location:{hostname:'on-top.world'}}))
    openSpeedMole();expect(useSpeedMole.getState().open).toBe(false)
  })
})
