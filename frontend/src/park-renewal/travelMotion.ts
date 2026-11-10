import {SITES,heightAt,facilityFootprint,type Point} from './plan.ts'
import {facilityYaw} from './facilityPlacement'
import {ARCADE_SCALE} from './assetSizing'
import {clearMotionSegment} from './motionPlan.ts'
import {horrorState,HORROR,inHorror} from './horrorPlan.ts'
import {site} from './plan.ts'
import mapping from '../../generated/park-renewal/mapping.json'
import type {MappedAnchor} from './mapping/types'
import {renewalSolidBoxes,renewalRoundTables,blocksSolidPoint} from './solidCollision'
import {parkWalkSurface} from './surfaceHeight'
import {MOVEMENT} from '../config'
const solids=renewalSolidBoxes(mapping.coordinates as unknown as MappedAnchor[]),roundTables=renewalRoundTables(mapping.coordinates as unknown as MappedAnchor[])
export type Travel='walk'|'bicycle'|'scooter'
export const TRAVEL_PROFILES={walk:{speed:4.5,halfWidth:0,halfLength:0},bicycle:{speed:10,halfWidth:.45,halfLength:1.05},scooter:{speed:12,halfWidth:.4,halfLength:.85}} as const
export function cafeBlocksTravel(x:number,z:number){
 const s=site('cafe'),yaw=facilityYaw(s),dx=x-s.x,dz=z-s.z,lx=Math.cos(yaw)*dx-Math.sin(yaw)*dz,lz=Math.sin(yaw)*dx+Math.cos(yaw)*dz
 // Approved cafe GLB bounds after fitApprovedObject(SHOOTING_SIZE): body and terrace,
 // not the roof-centred circle that extended into the empty approach. Counter stays solid.
 return lx>-.95&&lx<4.5&&lz> -2.4&&lz<3.25||lx> -4.7&&lx<-.7&&lz> -2.5&&lz<2.4
}
const rentals=SITES.filter(s=>s.asset==='pair').map(s=>({x:s.x,z:s.z,...facilityFootprint(s)}))
/** The paired canopy is wide and shallow; a circular proxy blocked its empty approach. */
export function rentalBlocksTravel(x:number,z:number){return rentals.some(s=>{const dx=x-s.x,dz=z-s.z,c=Math.cos(s.yaw),v=Math.sin(s.yaw);return Math.abs(c*dx-v*dz)<s.half[0]+.15&&Math.abs(v*dx+c*dz)<s.half[1]+.15})}
export function facilityBlocksTravel(x:number,z:number,y:number){if(cafeBlocksTravel(x,z)||rentalBlocksTravel(x,z))return true;const a=SITES.find(s=>s.id==='arcade')!,yaw=facilityYaw(a),dx=x-a.x,dz=z-a.z,lx=Math.cos(yaw)*dx-Math.sin(yaw)*dz,lz=Math.sin(yaw)*dx+Math.cos(yaw)*dz,hx=9*ARCADE_SCALE[0],hz=6*ARCADE_SCALE[2];if(Math.abs(lx)<hx+.25&&Math.abs(lz)<hz+.25)return Math.abs(lx)>hx-.25||lz< -hz+.25||lz>hz-.25&&Math.abs(lx)>1.1;return !(horrorState.open&&y<HORROR.floor+HORROR.height&&inHorror(x,z))&&SITES.some(s=>s.radius&&!s.kind&&s.asset!=='pair'&&!['cafe','arcade','plaza','fitness','fishing','dock','tower','jump','balloon','island-pavilion','pavilion'].includes(s.id)&&!s.id.startsWith('rest-')&&Math.hypot(x-s.x,z-s.z)<(s.id==='fountain'?6.7:Math.min(s.radius*.55,7)))}
/** Swept centre and vehicle envelope, shared by keyboard movement and the local ride audit. */
export function canTravel(from:Point,to:Point,y:number,travel:Travel,yaw:number){
 const length=Math.hypot(to[0]-from[0],to[1]-from[1]),samples=Math.max(1,Math.ceil(length/.1))
 for(let i=1;i<=samples;i++){
  const x=from[0]+(to[0]-from[0])*i/samples,z=from[1]+(to[1]-from[1])*i/samples
  if(blocksSolidPoint(solids,x,z,y)||roundTables.some(t=>y<t.top&&y+1.6>t.bottom&&Math.hypot(x-t.x,z-t.z)<t.radius+MOVEMENT.radius))return false
  // A tall platform side is not a step. Do not teleport the predictor through
  // its face, then fight the authoritative correction on the next packet.
  if(parkWalkSurface(x,z,y)-y>.35)return false
 }
 const p=TRAVEL_PROFILES[travel],c=Math.cos(yaw),s=Math.sin(yaw),offsets=travel==='walk'?[[0,0]]:[[-p.halfWidth,-p.halfLength],[p.halfWidth,-p.halfLength],[-p.halfWidth,0],[p.halfWidth,0],[-p.halfWidth,p.halfLength],[p.halfWidth,p.halfLength],[0,0]]
 for(const [side,front]of offsets){const x=side!*c+front!*s,z=-side!*s+front!*c,a:Point=[from[0]+x,from[1]+z],b:Point=[to[0]+x,to[1]+z];if(horrorState.inside&&travel!=='walk')return false;if(SITES.some(t=>t.id==='tower'&&Math.hypot(b[0]-t.x,b[1]-t.z)<4.9&&y<heightAt(t.x,t.z)+39.8)||facilityBlocksTravel(...b,y)||!clearMotionSegment(a,b,y))return false}
 return true
}
