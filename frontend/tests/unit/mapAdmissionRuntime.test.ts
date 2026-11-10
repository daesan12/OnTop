import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {clearAuthSession,restoreAuthSession} from '../../src/auth/authFlow'
import {ParkRuntime} from '../../src/park/runtime/SpringParkRuntime'
import type {SocketLike} from '../../src/network/socketClient'
import {LIVE_MAP_IDENTITY} from '../../src/network/mapContract'
import {useSession,resetWorld,avatars} from '../../src/network/worldClient'

let runtime:ParkRuntime|undefined,connectedMap:unknown,sockets:ContractSocket[]=[],holdConfirmation=false,serverRequiresMap=false
class ContractSocket implements SocketLike {
  readyState=0
  onopen:SocketLike['onopen']=null;onmessage:SocketLike['onmessage']=null;onclose:SocketLike['onclose']=null;onerror:SocketLike['onerror']=null
  requests:{requestId:string;type:string;payload:Record<string,unknown>}[]=[]
  constructor(){sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.(new Event('open'));this.emit('CONNECTED',{userId:'101',mapVerificationRequired:serverRequiresMap,...(connectedMap===undefined?{}:{map:connectedMap})})})}
  emit(type:string,payload:object,requestId:string|null=null){this.onmessage?.({data:JSON.stringify({type,payload,requestId})} as MessageEvent)}
  send(raw:string) {
    const r=JSON.parse(raw);this.requests.push(r)
    if(r.type==='WORLD_MAP_CONFIRM'&&!holdConfirmation)queueMicrotask(()=>this.emit('WORLD_MAP_STATE',{map:connectedMap,verified:true},r.requestId))
    if(r.type==='CHANNEL_JOIN')queueMicrotask(()=>this.emit('CHANNEL_STATE',{channelId:'c',name:'공원',version:1,currentUsers:1,capacity:4,userIds:['101']},r.requestId))
    if(r.type==='GAME_RECONNECT_CHECK')queueMicrotask(()=>this.emit('ERROR',{code:'NO_RECOVERY',message:'복구할 경기 없음'},r.requestId))
  }
  close(code=1000){this.readyState=3;queueMicrotask(()=>this.onclose?.({code} as CloseEvent))}
}
const json=(v:unknown)=>new Response(JSON.stringify(v))
const world=(socket:ContractSocket,mapVersion=LIVE_MAP_IDENTITY.mapVersion)=>socket.emit('WORLD_STATE',{channelId:'c',version:1,mapVersion,avatars:[{userId:'101',position:{x:0,y:.84,z:34,yaw:0,moving:false,running:false,swimming:false,lastInputSeq:0}}]})
async function start(){await restoreAuthSession(true);runtime=new ParkRuntime({requireMapMetadata:true});runtime.start();await vi.waitFor(()=>expect(sockets).toHaveLength(1));await vi.waitFor(()=>expect(useSession.getState().status).not.toBe('joining'))}
beforeEach(()=>{
  clearAuthSession();resetWorld();sockets=[];connectedMap={...LIVE_MAP_IDENTITY};holdConfirmation=false;serverRequiresMap=false
  vi.stubGlobal('window',{location:{href:'http://localhost/park'}})
  vi.stubGlobal('WebSocket',ContractSocket)
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url==='/api/v1/auth/refresh')return json({accessToken:'fixture'})
    if(url==='/api/v1/channels')return json({items:[{channelId:'c',name:'공원',currentUsers:0,capacity:4,joinable:true}]})
    if(url==='/park-bindings.json')return json({bindings:[]})
    if(url==='/api/v1/users/me')return json({userId:101,nickname:'회원',characterGender:'MALE'})
    if(url==='/api/v1/auth/websocket-ticket')return json({ticket:'fixture',expiresIn:30})
    if(url.startsWith('/api/v1/tables?'))return json({tables:[]})
    throw new Error('unexpected '+url)
  }))
})
afterEach(async()=>{await runtime?.stop();runtime=undefined;clearAuthSession();vi.unstubAllGlobals()})
describe('map identity on the actual Spring socket path',()=>{
  it('honors server-required verification even for a legacy-compatible client',async()=>{
    connectedMap=undefined;serverRequiresMap=true
    await restoreAuthSession(true);runtime=new ParkRuntime();runtime.start()
    await vi.waitFor(()=>expect(useSession.getState().mapContractStatus).toBe('mismatch'))
    expect(sockets[0]!.requests).toHaveLength(0)
  })
  it('checks CONNECTED and carries the deployed FE identity on entry and recovery',async()=>{
    await start();await vi.waitFor(()=>expect(useSession.getState().roomId).toBe('c'))
    const socket=sockets[0]!;world(socket)
    expect(useSession.getState().mapContractStatus).toBe('verified');expect(useSession.getState().mapCompatible).toBe(true)
    expect(socket.requests.find(r=>r.type==='CHANNEL_JOIN')!.payload).toEqual({channelId:'c'})
    await vi.waitFor(()=>expect(useSession.getState().pending).toBe(false))
    await runtime!.checkRecovery()
    expect(socket.requests.find(r=>r.type==='GAME_RECONNECT_CHECK')!.payload).toEqual({})
  })
  it.each([undefined,{...LIVE_MAP_IDENTITY,mapVersion:'f'.repeat(64)},{...LIVE_MAP_IDENTITY,schemaVersion:2}])('stops before entry when CONNECTED metadata is missing or differs: %j',async map=>{
    connectedMap=map;await start()
    expect(useSession.getState()).toMatchObject({status:'error',mapCompatible:false,mapContractStatus:'mismatch',roomId:''})
    expect(useSession.getState().error).toContain('새로고침')
    expect(sockets[0]!.requests).toHaveLength(0)
    expect(await runtime!.selectChannel('c')).toBe(false)
  })
  it('handles the server mismatch error, stops input and ignores late matching snapshots',async()=>{
    await start();await vi.waitFor(()=>expect(useSession.getState().roomId).toBe('c'))
    const socket=sockets[0]!;world(socket);expect(avatars.size).toBe(1)
    const actual={...LIVE_MAP_IDENTITY,mapVersion:'b'.repeat(64)}
    socket.emit('ERROR',{code:'MAP_VERSION_MISMATCH',serverMap:actual,message:'server detail'})
    expect(useSession.getState()).toMatchObject({status:'error',mapContractStatus:'mismatch',serverMap:actual,mapCompatible:false})
    expect(avatars.size).toBe(0)
    world(socket);expect(useSession.getState().mapCompatible).toBe(false)
    expect(await runtime!.checkRecovery()).toBe(false)
    expect(socket.requests.filter(r=>r.type==='GAME_RECONNECT_CHECK')).toHaveLength(0)
  })
  it('checks identity again after a manual reconnect rather than restoring the prior approval',async()=>{
    await start();await vi.waitFor(()=>expect(useSession.getState().roomId).toBe('c'))
    connectedMap={...LIVE_MAP_IDENTITY,mapVersion:'c'.repeat(64)}
    runtime!.reconnect()
    await vi.waitFor(()=>expect(sockets).toHaveLength(2))
    await vi.waitFor(()=>expect(useSession.getState().mapContractStatus).toBe('mismatch'))
    expect(sockets[1]!.requests).toHaveLength(0)
    expect(useSession.getState().roomId).toBe('')
  })
  it('does not enter, move or recover until a matching confirmation request is approved',async()=>{
    holdConfirmation=true
    await restoreAuthSession(true);runtime=new ParkRuntime({requireMapMetadata:true});runtime.start()
    await vi.waitFor(()=>expect(sockets[0]?.requests.find(r=>r.type==='WORLD_MAP_CONFIRM')?.type).toBe('WORLD_MAP_CONFIRM'))
    const socket=sockets[0]!,confirmation=socket.requests.find(r=>r.type==='WORLD_MAP_CONFIRM')!
    expect(useSession.getState()).toMatchObject({status:'joining',roomId:'',mapContractStatus:'confirming'})
    expect(await runtime.selectChannel('c')).toBe(false);expect(await runtime.checkRecovery()).toBe(false)
    world(socket);expect(avatars.size).toBe(0)
    socket.emit('WORLD_MAP_STATE',{map:connectedMap,verified:true},'unrelated-request')
    expect(useSession.getState().roomId).toBe('')
    socket.emit('WORLD_MAP_STATE',{map:connectedMap,verified:true},confirmation.requestId)
    await vi.waitFor(()=>expect(useSession.getState().roomId).toBe('c'))
    expect(socket.requests.find(r=>r.type==='CHANNEL_JOIN')?.payload).toEqual({channelId:'c'})
  })
  it('rejects an unverified acknowledgement even when its identity matches',async()=>{
    holdConfirmation=true
    await restoreAuthSession(true);runtime=new ParkRuntime({requireMapMetadata:true});runtime.start()
    await vi.waitFor(()=>expect(sockets[0]?.requests.find(r=>r.type==='WORLD_MAP_CONFIRM')?.type).toBe('WORLD_MAP_CONFIRM'))
    const socket=sockets[0]!
    socket.emit('WORLD_MAP_STATE',{map:connectedMap,verified:false},socket.requests.find(r=>r.type==='WORLD_MAP_CONFIRM')!.requestId)
    expect(useSession.getState().mapContractStatus).toBe('mismatch')
    expect(socket.requests.filter(r=>r.type==='CHANNEL_JOIN')).toHaveLength(0)
  })
  it('waits for real DB recovery after an early channel rejection, then retries entry once',async()=>{
    const original=ContractSocket.prototype.send;let pending=true
    ContractSocket.prototype.send=function(raw:string){const r=JSON.parse(raw);if(r.type==='CHANNEL_JOIN'&&pending){this.requests.push(r);queueMicrotask(()=>this.emit('ERROR',{code:'GAME_RECOVERY_REQUIRED',message:'복구 확인 중'},r.requestId));return}original.call(this,raw)}
    try{await start();const socket=sockets[0]!;await vi.waitFor(()=>expect(socket.requests.filter(r=>r.type==='CHANNEL_JOIN')).toHaveLength(1));socket.emit('GAME_CONNECTION_STATE',{status:'PENDING'});await Promise.resolve();expect(useSession.getState().roomId).toBe('');pending=false;socket.emit('GAME_CONNECTION_STATE',{status:'LOBBY'});await vi.waitFor(()=>expect(useSession.getState().roomId).toBe('c'));expect(socket.requests.filter(r=>r.type==='CHANNEL_JOIN')).toHaveLength(2)}finally{ContractSocket.prototype.send=original}
  })

})
