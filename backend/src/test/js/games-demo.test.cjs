const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// 브라우저/서버 대역. 실제 games.js의 수신·대기 요청 로직을 실행해 알림 순서를 재현한다.
class Element{
  constructor(){this.children=[];this.dataset={};this.classList={toggle(){},add(){}};this.textContent='';}
  append(...items){this.children.push(...items);}
  prepend(item){this.children.unshift(item);}
  replaceChildren(...items){this.children=[...items];}
  addEventListener(){}
  setAttribute(){}
}
function fixture(){
  const elements=new Map();
  const sandbox={document:{getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement(){return new Element();}},
    WebSocket:{OPEN:1},crypto:{randomUUID:()=> 'request-1'},location:{protocol:'http:',host:'localhost'},
    setTimeout:()=>1,clearTimeout(){},setInterval(){},addEventListener(){},fetch:()=>new Promise(()=>{}),console};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../resources/games-demo/games.js'),'utf8'),sandbox);
  vm.runInContext("gameId='demo';for(const c of clients.values())c.socket={readyState:1,send(){}};",sandbox);
  return {sandbox,get:code=>vm.runInContext(code,sandbox),receive(role,message){sandbox.event={data:JSON.stringify(message)};vm.runInContext(`receive(clients.get('${role}'),event)`,sandbox);}};
}
test('먼저 도착한 자동 최종 알림은 아직 PENDING을 못 받은 수동 요청을 끝내지 않는다',async()=>{
  const f=fixture();const promise=f.get("send(clients.get('viewer'),'GAME_RECONNECT_CHECK')");
  f.receive('viewer',{requestId:null,type:'GAME_CONNECTION_STATE',payload:{status:'LOBBY'}});
  assert.equal(f.get("clients.get('viewer').pending.size"),1);
  f.receive('viewer',{requestId:'request-1',type:'GAME_CONNECTION_STATE',payload:{status:'PENDING'}});
  f.receive('viewer',{requestId:'request-1',type:'GAME_CONNECTION_STATE',payload:{status:'LOBBY'}});
  assert.equal((await promise).payload.status,'LOBBY');
  assert.equal(f.get("clients.get('viewer').pending.size"),0);
});
test('수동 요청이 PENDING만 받은 경우 자동 조회의 최종 null 알림으로 이어진다',async()=>{
  const f=fixture();const promise=f.get("send(clients.get('viewer'),'GAME_RECONNECT_CHECK')");
  f.receive('viewer',{requestId:'request-1',type:'GAME_CONNECTION_STATE',payload:{status:'PENDING'}});
  f.receive('viewer',{requestId:null,type:'GAME_CONNECTION_STATE',payload:{status:'LOBBY'}});
  assert.equal((await promise).payload.status,'LOBBY');
});
test('종료된 주사위의 평면 복구 상태도 화면 상태에 반영한다',()=>{
  const f=fixture();
  f.receive('a',{requestId:null,type:'GAME_CONNECTION_STATE',payload:{status:'FINISHED',gameId:'demo',version:8,
    state:{gameCode:'DICE',status:'FINISHED',stage:'FINISHED',turnUserId:null,turnDeadline:null,
      dice:[],players:['101','202'],scores:[0,100],targetScore:2000,turnScore:0,endReason:'RECONNECT_EXPIRED'}}});
  assert.equal(f.get("clients.get('a').state.status"),'FINISHED');
  assert.equal(f.get("clients.get('a').version"),8);
  assert.equal(f.get("clients.get('a').restored"),false);
});
