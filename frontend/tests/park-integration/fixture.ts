import type {Page,WebSocketRoute} from '@playwright/test'
import {PARK_DATA} from '../../src/map/park'
import {PARK_MAP_VERSION} from '../../src/map/park/generated/mapVersion'
import bindingsFile from '../../public/park-bindings.generated.frontend-test.json' with {type:'json'}
import {facilityCatalog as originalCatalog} from '../fixtures/facilityCatalog'
import type {FacilityDefinition,FacilityLease} from '../../src/features/facilities/protocol'
import type {MapIdentity} from '../../src/network/mapContract'
import {disabledJumpmapStatus} from '../fixtures/jumpmap'
import type {NoteTopic} from '../../src/features/notes/topics'

export const identity={mapId:'park',schemaVersion:2,mapVersion:PARK_MAP_VERSION}
const data=PARK_DATA
const facilities:FacilityDefinition[]=[
  ...data.interactions.benches.map(b=>({facilityId:b.id,kind:b.kind,center:{x:b.position[0],y:b.position[1]+.8,z:b.position[2],yaw:b.yaw},radius:b.radius,heightTolerance:b.heightTolerance,seats:b.seats.map(s=>s.use),exit:b.seats[0]!.exit})),
  ...[...data.interactions.fitness,...data.interactions.telescopes].map(b=>({facilityId:b.id,kind:b.kind,center:{x:b.position[0],y:b.position[1]+.8,z:b.position[2],yaw:b.yaw},radius:b.radius,heightTolerance:b.heightTolerance,seats:[b.use],exit:b.exit})),
].sort((a,b)=>a.facilityId.localeCompare(b.facilityId))
export const generatedFacilityCatalog = { ...originalCatalog, mapVersion: PARK_MAP_VERSION, facilities }

/** Browser-only wire simulation: production contains no mock login, physics or transport bypass. */
export async function parkFixture(page:Page,options:{holdConfirmation?:boolean;serverMap?:MapIdentity;omitMap?:boolean;fitnessRewardsEnabled?:boolean;environmentEpochMs?:number;clientPositions?:boolean;carrySupported?:boolean;denyInteraction?:boolean}={}) {
  // All 18 canonical IDs remain aligned with the latest generated bindings.
  const bindings=bindingsFile.bindings.filter(b=>b.channelId==='channel-1')
  await page.route('**/park-bindings.generated.frontend-test.json',route=>route.fulfill({json:{...bindingsFile,bindings}}))
  const requests:{type:string;payload:Record<string,unknown>;requestId:string}[]=[]
  const restRequests:{path:string;method:string;body:Record<string,unknown>}[]=[]
  const notes:{id:string;text:string;createdAt:string;category:NoteTopic}[]=[]
  let notesRevision=0
  let interactionBusy=false,vrActive=false
  let motionEpoch=1,motionTick=0,grounded=true,velocityY=0
  let socket:WebSocketRoute,confirmationId='',version=0,channelVersion=0,facilityVersion=0,lease:FacilityLease|undefined,seated='',watched=''
  const fourPlayerTables=new Set<string>()
  const position={x:data.physics.spawn.position[0],y:data.physics.spawn.position[1],z:data.physics.spawn.position[2],yaw:Math.PI,moving:false,running:false,swimming:false,lastInputSeq:0}
  const emit=(type:string,payload:object,id:string|null=null)=>socket.send(JSON.stringify({type,payload,requestId:id}))
  const world=(id:string|null=null)=>emit('WORLD_STATE',{channelId:'channel-1',version:++version,mapVersion:identity.mapVersion,avatars:[{userId:'101',position:{...position},...(options.carrySupported?{carry:null,interactionBusy,vrActive}:{}),...(options.clientPositions?{motion:{epoch:motionEpoch,tick:++motionTick,appliedInputSeq:position.lastInputSeq,inputAgeMs:0,velocityY,grounded,inputActive:true,authority:'CLIENT_VALIDATED',profile:'PARK_V1'}}:{})}]},id)
  const occupancy=(id:string|null=null)=>emit('WORLD_FACILITY_STATE',{channelId:'channel-1',version:++facilityVersion,mapVersion:identity.mapVersion,occupancies:lease?[lease]:[]},id)
  const table=(id:string,requestId:string|null,type='TABLE_STATE')=>emit(type,{tableId:id,version:++version,capacity:4,minimumPlayers:2,seats:Array.from({length:4},(_,n)=>({seatNumber:n+1,userId:n===0&&seated===id?'101':null,ready:false})),allReady:false,selectorUserId:seated?'101':null,gameCode:fourPlayerTables.has(id)?'DICE':null,targetScore:null,betAmountPerPlayer:null,gameId:null},requestId)
  await page.route('**/api/v1/**',async route=>{
    const url=new URL(route.request().url()),p=url.pathname
    const method=route.request().method(),requestBody=method==='POST'?(route.request().postDataJSON()??{}):{}
    restRequests.push({path:p,method,body:requestBody})
    if(p==='/api/v1/minigames/jumpmap/tips'&&method==='POST'){
      await route.fulfill({json:{seenTips:requestBody.tips??[]}});return
    }
    if(p==='/api/v1/minigames/jumpmap/status'&&method==='GET'){
      await route.fulfill({json:disabledJumpmapStatus('channel-1',identity.mapVersion)});return
    }
    if(p==='/api/v1/notes'&&method==='POST'){
      const note={id:String(notes.length+1),text:String(requestBody.text),createdAt:new Date().toISOString(),category:(requestBody.category??'free') as NoteTopic};notes.push(note)
      emit('NOTES_CHANGED',{revision:String(++notesRevision)})
      await route.fulfill({json:{note,nextAllowedAt:new Date(Date.now()+60000).toISOString()}});return
    }
    if(p==='/api/v1/feedback'&&method==='POST'){
      await route.fulfill({json:{receiptId:'1',acceptedAt:new Date().toISOString(),nextAllowedAt:new Date(Date.now()+60000).toISOString()}});return
    }
    if(p==='/api/v1/rankings/park'&&method==='GET'){
      await route.fulfill({json:{
        balance:[{rank:1,userId:'101',nickname:'새 맵 검증',coinBalance:12580},{rank:1,userId:'102',nickname:'공동 일등',coinBalance:12580},{rank:3,userId:'103',nickname:'세 번째',coinBalance:7200}],
        mole:[
          {rank:1,userId:'104',nickname:'두더지 장인',score:2981,maxCombo:14,completedAt:'2026-11-02T05:31:00Z'},
          {rank:2,userId:'106',nickname:'두더지 도전자',score:2500,maxCombo:12,completedAt:'2026-11-02T05:31:15Z'},
        ],
        speedMole:[
          {rank:1,userId:'105',nickname:'스피드 고수',score:132,misses:3,completedAt:'2026-11-02T05:31:30Z'},
          {rank:1,userId:'107',nickname:'공동 고수',score:132,misses:3,completedAt:'2026-11-02T05:31:45Z'},
        ],
        updatedAt:'2026-11-02T05:32:00Z',
      }});return
    }
    const body=p==='/api/v1/auth/refresh'?{accessToken:'park-fixture'}:p==='/api/v1/users/me'?{userId:101,nickname:'새 맵 검증',characterGender:'MALE'}:p==='/api/v1/auth/websocket-ticket'?{ticket:'park-fixture',expiresIn:30}:p==='/api/v1/channels'?{items:[{channelId:'channel-1',name:'새 공원 검증',capacity:16,currentUsers:1,joinable:true}]}:p==='/api/v1/tables'?{tables:bindings.map(b=>({tableId:b.tableId,capacity:4,minimumPlayers:2,occupiedSeats:0,availableSeats:4,readyCount:0,allReady:false,status:'WAITING',joinable:true,gameCode:null,targetScore:null,betAmountPerPlayer:null,gameId:null}))}:p==='/api/v1/wallets/me'?{balance:100,reservedBalance:0,availableBalance:100}:p==='/api/v1/notes'?{notes:[]}:null
    await route.fulfill(p==='/api/v1/notes'?{json:{notes}}:body?{json:body}:{status:404,json:{message:'Not part of this fixture'}})
  })
  await page.routeWebSocket('**/ws/tables?**',ws=>{
    socket=ws
    let dx=0,dz=0
    const tick=setInterval(()=>{if(position.moving&&!options.clientPositions){const step=(position.running?9:6.25)*.05;position.x+=dx*step;position.z+=dz*step;world()}},50)
    ws.onClose((code,reason)=>{clearInterval(tick);ws.close({code,reason})})
    ws.onMessage(raw=>{
      const r=JSON.parse(String(raw));requests.push(r)
      if(r.type==='WORLD_TIME_CHECK')emit('WORLD_TIME_STATE',{serverNow:Date.now(),cycleEpochMs:options.environmentEpochMs??0,cycleDurationMs:1200000,timeZone:'Asia/Seoul'},r.requestId)
      if(r.type==='WORLD_MAP_CONFIRM'){confirmationId=r.requestId;if(!options.holdConfirmation)emit('WORLD_MAP_STATE',{map:options.serverMap??identity,verified:true},r.requestId)}
      if(r.type==='CHANNEL_JOIN'){emit('CHANNEL_STATE',{channelId:'channel-1',name:'새 공원 검증',version:++channelVersion,capacity:16,currentUsers:1,userIds:['101']},r.requestId);world()}
      if(r.type==='WORLD_FOLLOW_CHECK')emit('WORLD_FOLLOW_STATE',{channelId:'channel-1',version:0,links:[]},r.requestId)
      if(r.type==='WORLD_MOVE'){dx=r.payload.dx;dz=r.payload.dz;position.moving=!!(dx||dz);position.running=r.payload.run;position.lastInputSeq=r.payload.seq;world(r.requestId)}
      if(r.type==='WORLD_INTERACTION_SET'){
        if(options.denyInteraction)emit('ERROR',{code:'INTERACTION_UNAVAILABLE',message:'보호 상태를 확인하지 못했어요.'},r.requestId)
        else {if(r.payload.vrActive!==undefined)vrActive=r.payload.vrActive===true;interactionBusy=r.payload.busy||vrActive;emit('WORLD_INTERACTION_STATE',{channelId:'channel-1',busy:interactionBusy,...(r.payload.vrActive!==undefined?{vrActive}:{})},r.requestId);world()}
      }
      // Echo only: real server path validation is covered by FenceMovementPathTests.
      if(r.type==='WORLD_POSITION'&&options.clientPositions){const p=r.payload,moving=Math.hypot(Number(p.x)-position.x,Number(p.z)-position.z)>.0001;Object.assign(position,{x:p.x,y:p.y,z:p.z,yaw:p.yaw,moving,running:moving&&p.run,lastInputSeq:p.seq});world(r.requestId)}
      if(r.type==='TABLE_WATCH'){watched=r.payload.tableId;table(watched,r.requestId,'TABLE_WATCH_STATE')}
      if(r.type==='TABLE_UNWATCH'){emit('TABLE_WATCH_LEFT',{tableId:watched},r.requestId);watched=''}
      if(r.type==='TABLE_JOIN'){seated=r.payload.tableId;table(seated,r.requestId)}
      if(r.type==='TABLE_LEAVE'){const id=seated;seated='';emit('TABLE_LEFT',{tableId:id},r.requestId);table(id,null);world()}
      if(r.type==='GAME_RECONNECT_CHECK')emit('GAME_CONNECTION_STATE',{status:'NONE',gameId:null,version:null,state:null,reconnectUntil:null,code:null},r.requestId)
      if(r.type==='WORLD_FACILITY_CATALOG') {
        const offset=Number(r.payload.offset??0),end=Math.min(offset+10,facilities.length)
        emit(r.type,{fitnessRewardsEnabled:options.fitnessRewardsEnabled??false,mapVersion:identity.mapVersion,offset,total:facilities.length,nextOffset:end<facilities.length?end:-1,aimIntervalMs:originalCatalog.aimIntervalMs,minPitch:originalCatalog.minPitch,maxPitch:originalCatalog.maxPitch,initialPitch:originalCatalog.initialPitch,facilities:facilities.slice(offset,end)},r.requestId)
      }
      if(r.type==='WORLD_FACILITY_CHECK')occupancy(r.requestId)
      if(r.type==='WORLD_FACILITY_USE') {
        const f=facilities.find(f=>f.facilityId===r.payload.facilityId)!,pose=f.seats[r.payload.seatIndex]!
        lease={leaseId:'park-lease-'+facilityVersion,channelId:'channel-1',userId:'101',facilityId:f.facilityId,kind:f.kind,seatIndex:r.payload.seatIndex,startedAt:new Date().toISOString(),pose,exit:f.exit,yaw:pose.yaw,pitch:0,lastAimSeq:0}
        Object.assign(position,pose);occupancy(r.requestId);world()
      }
      if(r.type==='WORLD_FACILITY_RELEASE'){Object.assign(position,lease!.exit);lease=undefined;occupancy(r.requestId);world()}
    })
    emit('CONNECTED',{userId:'101',...(options.omitMap?{}:{map:options.serverMap??identity}),mapVerificationRequired:true})
  })
  return {emit,requests,restRequests,
    addNote:(text:string,category:NoteTopic='free')=>{notes.push({id:String(notes.length+1),text,category,createdAt:new Date().toISOString()});emit('NOTES_CHANGED',{revision:String(++notesRevision)})},
    resetGame:(anchorId:string)=>{const id=bindings.find(b=>b.anchorId===anchorId)!.tableId;fourPlayerTables.delete(id);table(id,null)},enableFourPlayers:(anchorId:string)=>{const id=bindings.find(b=>b.anchorId===anchorId)!.tableId;fourPlayerTables.add(id);table(id,null)},approve:()=>emit('WORLD_MAP_STATE',{map:identity,verified:true},confirmationId),place:(p:{x:number;y:number;z:number;yaw?:number},swimming=false,motion?:{grounded:boolean;velocityY:number})=>{Object.assign(position,p,{moving:false,running:false,swimming});if(options.clientPositions){motionEpoch++;grounded=motion?.grounded??true;velocityY=motion?.velocityY??0}world()},mismatch:()=>emit('ERROR',{code:'MAP_VERSION_MISMATCH',serverMap:{...identity,mapVersion:'f'.repeat(64)},message:'맵 버전 확인 필요'})}
}
