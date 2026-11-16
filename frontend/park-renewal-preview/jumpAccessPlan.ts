import {site,NODES,distanceToSegment,type Point} from './plan.ts'
import {JUMP_PADS,JUMP_START} from './jump10Plan.ts'
export const JUMP_GATE={a:NODES.jump!,b:[JUMP_PADS[0]!.x,JUMP_PADS[0]!.z]as Point,width:5.5}
export function jumpFenceOpening(x:number,z:number){const stele=site('stele');return distanceToSegment(x,z,JUMP_GATE.a,JUMP_GATE.b)<JUMP_GATE.width/2||Math.hypot(x-JUMP_START.x,z-JUMP_START.z)<3||Math.hypot(x-stele.x,z-stele.z)<3.8||distanceToSegment(x,z,[stele.x,stele.z],NODES.jumpApproach!)<2.4}
