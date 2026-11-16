import {beforeEach,expect,it} from 'vitest'
import {NpcMotion} from '../../src/features/ai/npcMotion'
import {acceptCompanionActors,acceptCompanions,resetCompanionActors,useCompanions} from '../../src/features/ai/companions'
beforeEach(resetCompanionActors)
it('renders uniform motion between 10Hz snapshots at display frame rate',()=>{
 const m=new NpcMotion();for(let t=0;t<=1000;t+=100)m.push({x:t/1000*1.4,y:0,z:0,yaw:0},t)
 const points:number[]=[];for(let t=200;t<=1000;t+=1000/60)points.push(m.sample(t)!.x)
 const steps=points.slice(1).map((x,i)=>x-points[i]!)
 expect(Math.min(...steps)).toBeGreaterThan(.02);expect(Math.max(...steps)-Math.min(...steps)).toBeLessThan(.00001)
})
it('holds bounded prediction instead of jumping backward during a delayed packet',()=>{
 const m=new NpcMotion();m.push({x:0,y:0,z:0,yaw:0},0);m.push({x:.14,y:0,z:0,yaw:0},100)
 expect(m.sample(351)!.x).toBeCloseTo(m.sample(350)!.x);expect(m.sample(2000)!.x).toBeCloseTo(.28)
})
it('snaps teleports and chair transitions without flying across the map',()=>{
 const m=new NpcMotion();m.push({x:0,y:0,z:0,yaw:0,warp:0},0);m.push({x:80,y:10,z:0,yaw:0,warp:1},100)
 expect(m.sample(100)!.x).toBe(80)
 m.push({x:-10,y:0,z:34,yaw:0,warp:1,seated:true},200);expect(m.sample(200)!.x).toBe(-10)
})
it('snaps a second recovery warp from outside the map without retaining airborne prediction',()=>{
 const m=new NpcMotion()
 m.push({x:0,y:0,z:0,yaw:0,warp:0},0)
 m.push({x:300,y:30,z:0,yaw:0,warp:1},100)
 m.push({x:301,y:29,z:0,yaw:0,warp:1},200)
 m.push({x:0,y:0,z:0,yaw:0,warp:2},300)
 expect(m.sample(300)).toMatchObject({x:0,y:0,z:0,warp:2})
 m.push({x:.1,y:0,z:0,yaw:0,warp:2},400)
 expect(m.sample(600)!.y).toBe(0)
 expect(m.sample(600)!.x).toBeLessThan(1)
})
it('takes the short rotation through the angle boundary',()=>{
 const m=new NpcMotion();m.push({x:0,y:0,z:0,yaw:3.1},0);m.push({x:1,y:0,z:0,yaw:-3.1},100)
 expect(Math.abs(m.sample(200)!.yaw)).toBeCloseTo(Math.PI)
})
it('an older HTTP status cannot overwrite a newer socket actor snapshot',()=>{
 const npc={id:'omok-one',channelId:'one',name:'박영감',role:'GUIDE',x:4,y:0,z:0,yaw:0,moving:true,seated:false}
 expect(acceptCompanionActors({version:20,actors:[npc]})).toBe(true)
 acceptCompanions({actors:[{...npc,x:1}],actorVersion:19,practice:null,waitSeconds:4,autoPaused:false,reply:'',engine:'RAPFI',mode:'FIXED',commentary:[]})
 expect(useCompanions.getState().actors[0]?.x).toBe(4);expect(useCompanions.getState().waitSeconds).toBe(4)
 resetCompanionActors();expect(acceptCompanionActors({version:0,actors:[npc]})).toBe(true)
})
