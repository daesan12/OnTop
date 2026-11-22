import {afterEach,expect,it} from 'vitest'
import {balloonCollisionWarning,type Flight,type FlightMap} from '../../src/features/balloon/flight'
import {clearRemoteBalloons,receiveRemoteBalloon,sampleRemoteBalloon,sampleRemoteBalloonWarningInput} from '../../src/features/balloon/remoteRide'

afterEach(clearRemoteBalloons)

const map: FlightMap = {
  dock:{x:0,y:4,z:0},dockExit:{x:0,y:4,z:4},inside:()=>true,
  floor:x=>x>=8&&x<=16?25:0,landing:()=>null,
}
const envelope=(x:number,aboard=true)=>({channelId:'one',pilotId:'101',flight:{position:{x,y:22,z:0},aboard}})

it.each([80,250,400])('패킷 간격 %sms에서 보간이 멈춰도 동승자 접근 경고가 깜빡이지 않는다',interval=>{
  receiveRemoteBalloon(envelope(0),'one','202',1000)
  receiveRemoteBalloon(envelope(interval/100),'one','202',1000+interval)
  for(let elapsed=0;elapsed<interval;elapsed+=16){
    const now=1000+interval+elapsed
    const flight:Flight={phase:'flying',position:sampleRemoteBalloon('101',now)!,seconds:60,atBoundary:false}
    expect(balloonCollisionWarning(flight,sampleRemoteBalloonWarningInput('101',now),map)).toBe(true)
  }
})

it('정지 패킷과 오래된 이동은 예측을 멈추고 다음 비행에 이전 속도를 섞지 않는다',()=>{
  receiveRemoteBalloon(envelope(0),'one','202',1000)
  receiveRemoteBalloon(envelope(2.5),'one','202',1250)
  expect(sampleRemoteBalloonWarningInput('101',1400).x).toBe(1)
  expect(sampleRemoteBalloonWarningInput('101',1851)).toEqual({x:0,z:0,lift:0})
  receiveRemoteBalloon(envelope(2.5),'one','202',1500)
  expect(sampleRemoteBalloonWarningInput('101',1501)).toEqual({x:0,z:0,lift:0})
  receiveRemoteBalloon(envelope(2.5,false),'one','202',1600)
  receiveRemoteBalloon(envelope(0),'one','202',1700)
  expect(sampleRemoteBalloonWarningInput('101',1701)).toEqual({x:0,z:0,lift:0})
  clearRemoteBalloons()
  expect(sampleRemoteBalloonWarningInput('101',1800)).toEqual({x:0,z:0,lift:0})
})
