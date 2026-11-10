import {useSyncExternalStore} from 'react'
import {ALL_RIDE_ROUTES as RIDE_ROUTES,type RideState,createRide,type RideRoute} from './rideAuditPlan'
import {parkWalkSurface} from './surfaceHeight'
export const rideAuditEnabled=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('ride-audit')==='1'
type Trial={route:RideRoute;travel:'bicycle'|'scooter';reverse?:boolean;lane?:number}
export const rideAudit={run:null as RideState|null,queue:[]as Trial[],results:[]as RideState[],generation:0,version:0}
const listeners=new Set<()=>void>()
export function publishRideAudit(){rideAudit.version++;for(const f of listeners)f()}
const subscribe=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f)}}
export function nextRide(){const next=rideAudit.queue.shift();rideAudit.run=next?createRide(next.route,next.travel,parkWalkSurface,next.reverse,next.lane):null;rideAudit.generation++;publishRideAudit()}
export function finishRide(){if(rideAudit.run)rideAudit.results.push(rideAudit.run);nextRide()}
export function RideAuditPanel({onStart}:{onStart:()=>void}){
 useSyncExternalStore(subscribe,()=>rideAudit.version)
 if(!rideAuditEnabled)return null
 const run=rideAudit.run,total=rideAudit.results.length+rideAudit.queue.length+(run?1:0)
 const start=(ids:readonly RideRoute[],lanes:readonly number[]=[0],directions:readonly boolean[]=[false,true])=>{rideAudit.results=[];rideAudit.queue=ids.flatMap(route=>(['bicycle','scooter']as const).flatMap(travel=>directions.flatMap(reverse=>lanes.map(lane=>({route,travel,reverse,lane})))));onStart();nextRide()}
 return <section className="renewal-ride-audit renewal-ui" aria-label="로컬 탈것 통행 검사"><strong>탈것 통행 검사</strong><p>기존 이동·충돌 코드로 실제 차체 폭을 양방향 검사합니다. 대여·게임 서버 연결 전 로컬 체험입니다.</p><button onClick={()=>start(['park-west','park-hill','park-lake'],[0],[false])}>입구부터 공원 전체 순환 검사</button><button className="renewal-primary" onClick={()=>start(['fountain','tower','fishing','cafe'])}>분수·전망대·낚시터·카페 주행 검사</button><button onClick={()=>start(['hill-turn-edge','hill-upper-edge','hill-landing-edge'],[-2.4,0,2.4])}>오르막 중앙·가장자리 검사</button><button onClick={()=>start(['cafe-northeast','jump-balloon'])}>새 경사 구간 왕복 검사</button><button onClick={()=>start(['mole','fishing','balloon'])}>세 구간 자전거·킥보드 검사</button><button onClick={()=>{rideAudit.queue=[];rideAudit.run=null;publishRideAudit()}}>검사 중지</button><div role="status">{run?`${run.travel==='bicycle'?'자전거':'킥보드'} · ${RIDE_ROUTES.find(r=>r.id===run.id)!.name} · ${run.lane===0?'중앙':'가장자리 '+run.lane+'m'} · ${run.distance.toFixed(1)}m 이동`:`검사 대기 · 완료 ${rideAudit.results.length}/${total}`}</div><ol>{rideAudit.results.map((r,i)=><li key={i}>{r.travel==='bicycle'?'자전거':'킥보드'} · {RIDE_ROUTES.find(p=>p.id===r.id)!.name} · {r.lane===0?'중앙':'가장자리 '+r.lane+'m'}: {r.complete?'통과':'막힘'} · {r.distance.toFixed(1)}m · 최대 경사 {Math.round(Math.atan(r.maxGrade)*180/Math.PI)}°</li>)}</ol></section>
}
