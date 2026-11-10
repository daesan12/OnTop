import {it,expect} from 'vitest'
import {RenewalPrediction} from '../../src/park-renewal/runtime/RenewalPrediction'
import {heightAt,insidePark} from '../../src/park-renewal/plan'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
const stop={dx:0,dz:0,run:false,jump:false}
it('새 광장의 높이를 유지하면서 이동하고 정지한다',()=>{
 const sim=new RenewalPrediction();sim.reset({x:0,y:heightAt(0,55)+.8,z:55,yaw:Math.PI},0,true)
 for(let i=0;i<20;i++)sim.step({...stop,dz:-1},.05)
 expect(sim.pose().z).toBeLessThan(51);expect(sim.pose().y).toBeCloseTo(parkWalkSurface(0,sim.pose().z)+.8,2)
 sim.stopHorizontal();const z=sim.pose().z;sim.step(stop,.05);expect(sim.pose().z).toBe(z)
})
it('외곽을 향해 이동해도 공원 경계를 통과하지 않는다',()=>{
 const sim=new RenewalPrediction();sim.reset({x:96,y:heightAt(96,0)+.8,z:0,yaw:Math.PI/2},0,true)
 for(let i=0;i<100;i++)sim.step({...stop,dx:1,run:true},.05)
 expect(insidePark(sim.pose().x,sim.pose().z,.65)).toBe(true);expect(insidePark(sim.pose().x+1,sim.pose().z,.65)).toBe(false)
})
it('점프 후 같은 광장 바닥에 다시 착지한다',()=>{
 const sim=new RenewalPrediction(),y=parkWalkSurface(0,55)+.8;sim.reset({x:0,y,z:55,yaw:0},0,true)
 sim.step({...stop,jump:true},.05);expect(sim.pose().y).toBeGreaterThan(y)
 for(let i=0;i<60;i++)sim.step(stop,.05)
 expect(sim.pose().y).toBeCloseTo(y,2);expect(sim.groundedForLocomotion()).toBe(true)
})
