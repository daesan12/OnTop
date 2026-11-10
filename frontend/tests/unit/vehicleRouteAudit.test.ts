import {it,expect,afterAll} from 'vitest'
import {writeFileSync} from 'node:fs'
import {Box3,Vector3} from 'three'
import {factory} from '../../src/park-renewal/assetFactories'
import {RIDE_ROUTES,createRide,stepRide} from '../../src/park-renewal/rideAuditPlan'
import {TRAVEL_PROFILES} from '../../src/park-renewal/travelMotion'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
const measurements:unknown[]=[]
afterAll(()=>writeFileSync('tests/park-detail-220/evidence/vehicle-route-audit.json',JSON.stringify({checkedAt:new Date().toISOString(),base:'0c337594eaa22b7a3d10a801f0faef5e9889e80c',measurements},null,2)))
it('탈것 통행 검사 폭과 길이가 실제 로컬 에셋보다 작지 않음',()=>{for(const [travel,kind]of[['bicycle','ebike'],['scooter','kickboard']]as const){const size=new Box3().setFromObject(factory(kind)).getSize(new Vector3()),p=TRAVEL_PROFILES[travel];expect(p.halfWidth*2).toBeGreaterThan(size.x);expect(p.halfLength*2).toBeGreaterThan(size.z)}})
for(const travel of['bicycle','scooter']as const)for(const route of RIDE_ROUTES)it(`${travel}: ${route.name} 양방향·좌우 차선에서 차체 전체가 통과`,()=>{
 for(const reverse of[false,true])for(const lane of[-1.2,0,1.2]){const s=createRide(route.id,travel,parkWalkSurface,reverse,lane);for(let i=0;i<10000&&!s.complete&&!s.blocked;i++)stepRide(s,1/60,parkWalkSurface);measurements.push({route:route.id,travel,reverse,lane,distance:s.distance,complete:s.complete,blocked:s.blocked,grade:s.maxGrade,steepest:s.steepest,roll:s.maxRoll,rollPoint:s.rollPoint});expect(s.blocked,JSON.stringify(s)).toBe(false);expect(s.complete,JSON.stringify(s)).toBe(true);expect(s.maxGrade).toBeLessThan(Math.tan(20*Math.PI/180));expect(s.maxRoll).toBeLessThan(Math.tan(12*Math.PI/180))}
},15000)
