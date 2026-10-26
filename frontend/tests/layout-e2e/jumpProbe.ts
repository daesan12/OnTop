import { _roots } from '@react-three/fiber'
import { jumpSession,landJumpPad,stepJump } from '../../src/layout-preview/jumpSimulation'
import { JUMP_PADS,JUMP_GATES,JUMP_FINISH } from '../../src/layout-preview/jumpCourse'
import { jumpVisualState } from '../../src/layout-preview/PreviewJumpCourse'
export function jumpProbe(){
  const scene=_roots.get(document.querySelector('canvas')!)?.store.getState().scene
  const fades:number[]=[]
  scene?.getObjectByName('layout-vr-jump-course')?.traverse(o=>{const m=o as import('three').InstancedMesh;if(m.isInstancedMesh&&m.geometry.hasAttribute('aFade'))fades.push(...Array.from(m.geometry.getAttribute('aFade').array))})
  return {maxFade:Math.max(...fades),x:jumpSession.x,y:jumpSession.y,z:jumpSession.z,vy:jumpSession.vy,grounded:jumpSession.grounded,active:jumpSession.active,pad:jumpSession.pad?.id,
    coins:jumpSession.coins,today:jumpSession.today,result:jumpSession.result,hits:jumpSession.hits.length,visual:{...jumpVisualState},
    firstPad:{x:JUMP_PADS[0]!.x,z:JUMP_PADS[0]!.z},pads:JUMP_PADS.length,gates:JUMP_GATES.length,models:['stone','gomoku','fish','cloud','lantern','kite','lily','gate'].map(t=>!!scene?.getObjectByName('layout-jump-theme-'+t))}
}
/** Local authoritative-event fixture for HUD/FX verification; not imported by the application. */
export function stageLandingFixture(stage:number){jumpSession.time+=1;landJumpPad(jumpSession,JUMP_PADS.find(p=>p.stage===stage)!)}
export function completeJumpFixture(){
  landJumpPad(jumpSession,JUMP_PADS[0]!);for(const g of JUMP_GATES){jumpSession.time+=1;landJumpPad(jumpSession,g)}
  landJumpPad(jumpSession,JUMP_PADS.at(-1)!);Object.assign(jumpSession,{x:JUMP_FINISH.x,z:JUMP_FINISH.z,y:.1,vy:-3,grounded:false,pad:null});stepJump(jumpSession,.1,{x:0,z:0})
}
