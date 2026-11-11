import {beforeEach,expect,it} from 'vitest'
import {acceptPatrol,resetWorldAi,useWorldAi} from '../../src/features/ai/worldAi'
import {NpcMotion} from '../../src/features/ai/npcMotion'
beforeEach(resetWorldAi)
it('keeps waiting-position snapshots visible and stationary until response resumes',()=>{
 const npc={id:'police',name:'한순경',action:'WAITING_POSITION',x:4,y:0,z:2,yaw:0,moving:false,warp:0}
 expect(acceptPatrol({version:1,npcs:[npc]})).toBe(true)
 expect(useWorldAi.getState().npcs[0]).toMatchObject({action:'WAITING_POSITION',moving:false})
 const motion=new NpcMotion();motion.push(npc,100);motion.push(npc,200)
 expect(motion.sample(1000)).toMatchObject({x:4,z:2,warp:0})
 expect(acceptPatrol({version:2,npcs:[{...npc,action:'RESPOND',moving:true,x:5}]})).toBe(true)
 expect(useWorldAi.getState().npcs[0]).toMatchObject({action:'RESPOND',moving:true,x:5})
})
