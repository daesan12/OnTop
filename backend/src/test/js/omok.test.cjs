const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');

// 레이아웃이 아닌 실제 화면 스크립트의 요청/응답 순서를 검증하는 DOM·네트워크 대역이다.
class Element {
    constructor() { this.value = 'black'; this.children = []; this.dataset = {}; this.listeners = {}; this.classList = {toggle() {}}; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    append(child) { this.children.push(child); }
    prepend(child) { this.children.unshift(child); }
    replaceChildren() { this.children = []; }
    setAttribute() { }
    click() { return this.listeners.click(); }
}
async function browser(role) {
    const elements = new Map();
    const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
    const intervals = [];
    const lifecycle = {};
    const requests = [];
    let config = {gameId:'old',channelId:'omok-demo',playing:false,serverTime:Date.now()};
    class Socket {
        static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
        constructor() { this.readyState=0; this.listeners={}; Socket.current=this; }
        addEventListener(type, callback) { this.listeners[type]=callback; }
        send(text) { requests.push(JSON.parse(text)); }
        open() { this.readyState=1; this.listeners.open(); }
        message(message) { this.listeners.message({data:JSON.stringify(message)}); }
        close(code=1000) { this.readyState=3; this.listeners.close({code}); }
    }
    const context = vm.createContext({document:{getElementById:element,createElement:()=>new Element()},
        URLSearchParams,location:{search:'?role='+role,protocol:'http:',host:'127.0.0.1:18081'},
        WebSocket:Socket,crypto:{randomUUID},Date,
        setInterval:callback=>intervals.push(callback),setTimeout:()=>1,clearTimeout:()=>{},
        addEventListener:(name,callback)=>{lifecycle[name]=callback;},
        fetch:async()=>({ok:true,json:async()=>structuredClone(config)})});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../resources/omok-demo/omok.js'),'utf8'),context);
    const flush = () => new Promise(resolve=>setImmediate(resolve));
    await flush(); element('connect').click(); Socket.current.open(); await flush();
    async function reply(type, payload={}, responseType=type, automatic=false) {
        const request=requests.at(-1); assert.equal(request.type,type);
        Socket.current.message({requestId:automatic?null:request.requestId,type:responseType,payload});
        await flush();
    }
    return {element,requests,reply,flush,socket:Socket.current,poll:()=>intervals[0](),pagehide:()=>lifecycle.pagehide(),
        newConfig:value=>{config=value;}};
}

test('관전은 복구 완료를 기다리고 늦은 이전 판 구독을 해제한 뒤 새 판을 구독한다',async()=>{
    const b=await browser('viewer');
    assert.equal(b.requests.at(-1).type,'GAME_RECONNECT_CHECK');
    await b.reply('GAME_RECONNECT_CHECK',{status:'LOBBY'},'GAME_CONNECTION_STATE',true);
    await b.reply('CHANNEL_JOIN',{},'CHANNEL_STATE');
    await b.reply('WORLD_MOVE',{},'WORLD_STATE');
    assert.equal(b.requests.at(-1).type,'GAME_WATCH');
    assert.equal(b.requests.at(-1).payload.gameId,'old');
    b.newConfig({gameId:'new',channelId:'omok-demo',playing:true,serverTime:Date.now()});
    const polling=b.poll(); await b.flush();
    const oldState={gameCode:'OMOK',status:'PLAYING',board:Array.from({length:15},()=>Array(15).fill(0)),moveCount:0,turnUserId:'101'};
    await b.reply('GAME_WATCH',{gameId:'old',version:0,publicState:oldState},'GAME_STATE');
    await polling;
    const nextPoll=b.poll(); await b.flush();
    await b.reply('GAME_RECONNECT_CHECK',{status:'LOBBY'},'GAME_CONNECTION_STATE',true);
    await b.reply('GAME_UNWATCH',{gameId:'old'},'GAME_WATCH_LEFT');
    assert.equal(b.requests.at(-1).type,'GAME_WATCH');
    assert.equal(b.requests.at(-1).payload.gameId,'new');
    await b.reply('GAME_WATCH',{gameId:'new',version:0,publicState:oldState},'GAME_STATE');
    await nextPoll;
    assert.equal(b.element('version').textContent,'버전 0');
    b.socket.message({requestId:null,type:'GAME_STATE',payload:{gameId:'old',version:99,publicState:{...oldState,moveCount:99}}});
    assert.equal(b.element('move-count').textContent,'0수');
    assert.equal(b.requests.filter(r=>r.type==='CHANNEL_JOIN').length,1);
});

test('복구 요청 대기 중 1008 종료 안내를 일반 오류가 덮지 않는다',async()=>{
    const b=await browser('black');
    assert.equal(b.requests.at(-1).type,'GAME_RECONNECT_CHECK');
    b.socket.close(1008); await b.flush();
    assert.match(b.element('status').textContent,/같은 역할의 연결이 이미 열려/);
    assert.equal(b.element('connection').textContent,'끊김');
});

test('페이지를 떠날 때 테스트 연결을 명시적으로 닫는다',async()=>{
    const b=await browser('black');
    b.pagehide(); await b.flush();
    assert.equal(b.socket.readyState,3);
    assert.equal(b.element('connection').textContent,'끊김');
});
