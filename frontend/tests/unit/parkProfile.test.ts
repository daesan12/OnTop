import {expect,it} from 'vitest'
import {LocalMovementPrediction,type PredictionSimulation} from '../../src/network/localMovementPrediction'
import {worldState} from '../../src/network/protocol'
const pose={x:0,y:100,z:0,yaw:0}
const motion={epoch:1,tick:0,appliedInputSeq:0,inputAgeMs:0,velocityY:-50,grounded:false,inputActive:true,profile:'PARK_V1' as const,authority:'CLIENT_VALIDATED' as const}
it('uses the server profile even without local flags or settings',async()=>{
 let now=0,p={...pose},profile:unknown
 const sim:PredictionSimulation={setMotionProfile(value){profile=value},reset(value){p={...value}},step(_i,dt){p.y-=50*dt},pose(){return {...p}},setChairs(){},dispose(){}}
 const predictor=new LocalMovementPrediction(async()=>sim,()=>now);predictor.reconcile('park',pose,motion,true,0);await predictor.prepare()
 const target={...pose};predictor.sample(0,target);now=100;predictor.sample(now,target)
 expect(target.y).toBeCloseTo(95);expect(profile).toBe('PARK_V1')
 predictor.reconcile('park',p,{...motion,tick:1,authority:undefined},true,now)
 expect(predictor.ready).toBe(false);expect(predictor.positionMode).toBe(false);expect(predictor.positionReport(1,{dx:0,dz:0,run:false,jump:false})).toBeUndefined()
 predictor.reconcile('park',p,{...motion,epoch:2,tick:2},true,now)
 expect(predictor.ready).toBe(true);expect(predictor.positionMode).toBe(true)
})
it('keeps legacy motion compatible and rejects invalid profile contracts',()=>{
 const frame=(m:unknown)=>({channelId:'one',version:1,mapVersion:'hash',avatars:[{userId:'a',position:{lastInputSeq:0,x:0,y:.8,z:0,yaw:0,moving:false,running:false,swimming:false},motion:m}]})
 expect(()=>worldState(frame(motion))).not.toThrow()
 expect(()=>worldState(frame({...motion,profile:undefined}))).not.toThrow()
 expect(()=>worldState(frame({...motion,profile:123}))).toThrow()
})

it('caps a stalled frame instead of replaying one whole second of movement',async()=>{
 let now=0,p={x:0,y:.8,z:0,yaw:0}
 const sim:PredictionSimulation={reset(value){p={...value}},step(i,dt){p.x+=i.dx*8*dt},pose(){return {...p}},setChairs(){},dispose(){}}
 const predictor=new LocalMovementPrediction(async()=>sim,()=>now)
 predictor.reconcile('park',p,{...motion,velocityY:0,grounded:true},true,0);await predictor.prepare()
 const run={dx:1,dz:0,run:true,jump:false};predictor.intend(run,0)
 now=100;expect(predictor.positionReport(1,run,now)?.x).toBeCloseTo(.8)
 now=1100;expect(predictor.positionReport(2,run,now)?.x).toBeCloseTo(1.6)
})

it('keeps a one-shot jump on fresh reports until the server confirms an accepted sequence',async()=>{
 let now=0,p={x:0,y:.8,z:0,yaw:0},jumps=0
 const sim:PredictionSimulation={reset(v){p={...v}},step(i){if(i.jump)jumps++},pose(){return {...p}},setChairs(){},dispose(){}}
 const predictor=new LocalMovementPrediction(async()=>sim,()=>now)
 predictor.reconcile('park',p,{...motion,velocityY:0,grounded:true},true,0);await predictor.prepare()
 const input={dx:0,dz:0,run:false,jump:true};predictor.intend(input,0);predictor.sentInput(1,0,input)
 expect(predictor.positionReport(1,input)?.jump).toBe(true);expect(jumps).toBe(0)
 predictor.reject(1);now=60
 expect(predictor.positionReport(2,{...input,jump:false})?.jump).toBe(true);expect(jumps).toBe(1)
 predictor.reconcile('park',p,{...motion,tick:1,appliedInputSeq:2,velocityY:0,grounded:true},true,now)
 now=120;expect(predictor.positionReport(3,{...input,jump:false})?.jump).toBe(false);expect(jumps).toBe(1)
 predictor.positionReport(4,input);predictor.suspend()
 expect(predictor.positionReport(5,{...input,jump:false})).toBeUndefined()
})
