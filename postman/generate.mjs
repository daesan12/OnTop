import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const checkOnly = process.argv.includes('--check');
const variables = {
    baseUrl: 'http://127.0.0.1:8080',
    wsUrl: 'ws://127.0.0.1:8080/ws/tables',
    channelIdA: 'visual-a',
    channelIdB: 'visual-b',
    tableIdA: '',
    tableIdB: '',
    gameId: 'replace-with-real-game-id',
    minigameSessionId: '', minigameRequestKey: '', minigameHeats: '', minigameLog: '', minigameStartedAt: '',
    accessToken: '', websocketTicket: '', shopItemId: '', userItemId: '', purchaseRequestKey: '', purchaseId: '',
    facilityLeaseId: '', feedbackOperationId: '', feedbackReceiptId: '', noteOperationId: '', noteId: ''
};

const statusTest = status => `pm.test('HTTP ${status}', () => pm.response.to.have.status(${status}));`;
const codeTest = code => `pm.test('${code}', () => pm.expect(pm.response.json().code).to.eql('${code}'));`;
const http = (name, suffix, status, description, extra = '', before = '') => ({
    name, $kind: 'http-request', method: 'GET', url: '{{baseUrl}}' + suffix,
    description,
    auth: { type: 'noauth' },
    scripts: [
        ...(before ? [{ type: 'beforeRequest', code: before }] : []),
        { type: 'afterResponse', code: statusTest(status) + '\n' + extra }
    ]
});
const saveTable = key => `
pm.test('테이블 목록 형식', () => {
    const tables = pm.response.json().tables;
    pm.expect(tables).to.be.an('array').that.is.not.empty;
    pm.expect(tables[0].tableId).to.be.a('string').and.not.empty;
});
if (pm.response.code === 200) {
    const tables = pm.response.json().tables;
    if (Array.isArray(tables) && tables[0] && typeof tables[0].tableId === 'string') {
        pm.environment.set('${key}', tables[0].tableId);
    }
}`;
const requireEnvironment = `if (!pm.environment.name) throw new Error('먼저 OnTop Local 환경을 선택해주세요.');`;
const tableBefore = key => requireEnvironment + `\npm.environment.unset('${key}');`;
const httpItems = [
    http('01 서버 헬스체크', '/actuator/health', 200,
        '정상 HTTP 200 / UP. DB·Redis·경기 엔진의 정상 여부를 보장하지 않습니다.',
        `pm.test('UP만 노출', () => pm.expect(pm.response.json()).to.deep.eql({status: 'UP'}));`),
    http('02 개발용 채널·감정표현 설정', '/dev/world-config', 200,
        'local,visual-test 실행 필요. 실제 사용자 채널 목록 API를 우회하는 경로가 아니라 개발용 정적 설정입니다.',
        `pm.test('visual-test 설정', () => {
    const body = pm.response.json();
    pm.expect(body.channels.map(c => c.channelId)).to.include.members(['visual-a', 'visual-b']);
    pm.expect(body.emoteCodes).to.include('WAVE');
});`),
    http('03 광장 A 테이블 조회·ID 저장', '/api/v1/tables?channelId={{channelIdA}}', 200,
        '응답의 첫 테이블 ID를 선택한 OnTop Local 환경의 tableIdA에 저장합니다. WebSocket보다 먼저 Send 하세요.',
        saveTable('tableIdA'), tableBefore('tableIdA')),
    http('04 광장 B 테이블 조회·ID 저장', '/api/v1/tables?channelId={{channelIdB}}', 200,
        '응답의 첫 테이블 ID를 tableIdB에 저장합니다. A/B의 tableId는 서로 다릅니다.',
        saveTable('tableIdB'), tableBefore('tableIdB')),
    http('05 채널 목록 — 미인증 401', '/api/v1/channels', 401,
        '인증 헤더 없는 실패 예제입니다. 로그인 성공 조회는 11을 사용하세요. 임의 userId·테스트 인증 헤더는 인증되지 않습니다.',
        codeTest('UNAUTHENTICATED')),
    http('06 채널 없는 테이블 조회 — 400', '/api/v1/tables', 400,
        'visual-test처럼 채널이 등록된 상태에서만 CHANNEL_REQUIRED입니다. local만 켜면 200이므로 실행 설정을 맞추세요.',
        codeTest('CHANNEL_REQUIRED')),
    http('07 없는 채널 테이블 조회 — 404', '/api/v1/tables?channelId=not-a-channel', 404,
        '잘못된 채널을 정상적으로 거절하는지 확인합니다.', codeTest('CHANNEL_NOT_FOUND')),
    http('08 기존 브라우저 테스트 화면', '/dev/tables', 200,
        'HTML 응답 확인용입니다. 화면 조작은 브라우저에서 엽니다.',
        `pm.test('HTML', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('text/html'));`),
    http('09 관리 API 비노출 확인', '/actuator/env', 404,
        'health 이외 관리 API를 노출하지 않는지 확인합니다.')
];

const ticketRequest = http('10 로그인 웹소켓 접속권 발급', '/api/v1/auth/websocket-ticket', 200,
    'local,db + ontop.websocket.authenticated=true 필요. 개인 로컬 accessToken에 로그인 Access JWT를 입력하세요. '
    + '최대30초1회용 ticket을 받은 즉시 07 인증 연결에서 사용합니다. 원문 토큰·접속권을 공유/동기화하지 마세요.',
    `pm.test('접속권 응답', () => {
    const body = pm.response.json();
    pm.expect(body.ticket).to.match(/^wst_[A-Za-z0-9_-]{43}$/);
    pm.expect(body.expiresIn).to.be.within(1, 30);
});`);
ticketRequest.method = 'POST';
ticketRequest.headers = [{ key: 'Authorization', value: 'Bearer {{accessToken}}' },
    { key: 'Origin', value: '{{baseUrl}}' }];
httpItems.push(ticketRequest);

const channelRequest = http('11 로그인 사용자 채널 목록 조회', '/api/v1/channels', 200,
    'local,db와 실제 로그인 Access JWT가 필요합니다. 개인 로컬 accessToken 사용. '
    + '조회는 입장/예약을 하지 않습니다. WS07의 CHANNEL_JOIN 뒤 다시 보내면 currentUsers/joinable 변화를 확인할 수 있습니다. '
    + '채널 미설정은 items:[]입니다. 401 미인증/만료/탈퇴,403 출처거절,503 인증/인원 조회 장애. 토큰을 공유하지 마세요.',
    `pm.test('채널 목록 형식', () => {
    const items = pm.response.json().items;
    pm.expect(items).to.be.an('array');
    items.forEach(item => {
        pm.expect(item).to.have.all.keys('channelId', 'name', 'currentUsers', 'capacity', 'joinable');
        pm.expect(item.currentUsers).to.be.a('number').and.at.least(0);
        pm.expect(item.joinable).to.eql(item.currentUsers < item.capacity);
    });
});`);
channelRequest.headers = [{ key: 'Authorization', value: 'Bearer {{accessToken}}' },
    { key: 'Origin', value: '{{baseUrl}}' }];
httpItems.push(channelRequest);

const loginTables = http('12 로그인 사용자 테이블 조회·ID 저장', '/api/v1/tables?channelId={{channelIdA}}', 200,
    'TABLE-01: local,db + ontop.websocket.authenticated=true와 실제 로그인 Access JWT가 필요합니다. '
    + 'HTTP11에서 선택한 채널을 개인 channelIdA로 설정하고 이 응답의 tableIdA로 WS07에서 착석합니다. '
    + '채널 입장·착석·게임 선택·준비·퇴장/heartbeat 뒤 재조회하면 공개 요약을 확인합니다. 조회는 예약이 아닙니다. '
    + 'tables[].gameId는 확정 PLAYING 경기만 문자열이며 대기·리허설·미확정·종료·정산은null입니다. 선택한 테이블 ID를 추측하지 말고 gameId를 GAME_WATCH에 사용하세요. '
    + '401 미인증/만료/비활성,403 출처거절,503 인증/계정 장애. 인증 후400 채널 누락·404 없는 채널. '
    + '기본 개발 모드는03/04이며 실제 DB 차감/정산 성공 검증과 구분합니다. 토큰을 공유하지 마세요.',
    saveTable('tableIdA') + `
pm.test('공개 요약과 캐시 금지', () => {
    pm.expect(pm.response.headers.get('Cache-Control')).to.include('no-store');
    pm.response.json().tables.forEach(table => {
        pm.expect(table).to.have.all.keys('tableId', 'capacity', 'minimumPlayers', 'occupiedSeats',
            'availableSeats', 'readyCount', 'allReady', 'status', 'joinable', 'gameCode', 'targetScore', 'gameId');
        if (table.status !== 'PLAYING') pm.expect(table.gameId).to.eql(null);
        else pm.expect(table.gameId).to.be.a('string').and.not.empty;
        pm.expect(table.availableSeats).to.eql(table.capacity - table.occupiedSeats);
        pm.expect(table.joinable).to.eql(table.status === 'WAITING' && table.availableSeats > 0);
    });
});
if (pm.response.code === 200) {
    const selected = pm.response.json().tables.find(table => table.tableId === pm.environment.get('tableIdA'));
    pm.environment.set('gameId', selected && typeof selected.gameId === 'string' ? selected.gameId : '');
}`, tableBefore('tableIdA'));
loginTables.headers = [{ key: 'Authorization', value: 'Bearer {{accessToken}}' },
    { key: 'Origin', value: '{{baseUrl}}' }];
httpItems.push(loginTables);

const shopAuth = [{key: 'Authorization', value: 'Bearer {{accessToken}}'}, {key: 'Origin', value: '{{baseUrl}}'}];
const shopSetup = requireEnvironment + `\nif (!pm.environment.get('accessToken')) throw new Error('개인 로컬 Access JWT가 필요합니다.');`;
const catalog = http('13 상점 판매 아이템 조회', '/api/v1/shop/items', 200,
    'SHOP-01: local,db 또는 dev,db + ontop.shop.enabled=true(dev: SHOP_ENABLED=true)·공통 지갑/상점 스키마가 필요합니다. dev 사용 시 예제 Origin 헤더를 AUTH_ALLOWED_ORIGINS에 등록된 프론트 주소로 바꾸거나 비브라우저 테스트에서는 제외하세요. 판매 상품을 조회하며 첫 itemId를 개인 환경에 저장합니다.',
    `const items=pm.response.json().items; pm.expect(items).to.be.an('array');
if(items.length) pm.environment.set('shopItemId',items[0].itemId);`, shopSetup);
catalog.headers = shopAuth; httpItems.push(catalog);
const purchaseBefore = shopSetup + `\nif(!/^[1-9][0-9]*$/.test(String(pm.environment.get('shopItemId')||''))) throw new Error('13에서 판매 itemId를 선택하세요.');`;
const purchaseBody = {mode:'raw',raw:'{\n  "itemId": {{shopItemId}},\n  "quantity": 1\n}',options:{raw:{language:'json'}}};
const purchaseHeaders = [...shopAuth,{key:'Content-Type',value:'application/json'},
    {key:'Idempotency-Key',value:'{{purchaseRequestKey}}'}];
const purchase = http('14 아이템 구매 — 새 구매 키', '/api/v1/shop/purchases', 200,
    'SHOP-02: 실행할 때마다 새 키를 만듭니다. 같은 구매 재확인은15를 사용합니다. 실제 상품 가격으로 엽전이 차감됩니다. 테스트 계정으로 확인하세요. 보유 의상 재구매·의상 수량1 이외는409 ITEM_ALREADY_OWNED이며 추가 차감하지 않습니다. 같은 키·같은 본문은 이전 영수증 반환, 소비형 수량 누적은 유지합니다.',
    `const body=pm.response.json(); pm.expect(body.purchaseId).to.be.a('string');
pm.environment.set('purchaseId',body.purchaseId); pm.environment.set('userItemId',body.userItemId);`,
    purchaseBefore + `\npm.environment.set('purchaseRequestKey',pm.variables.replaceIn('{{$guid}}'));`);
purchase.method='POST'; purchase.headers=purchaseHeaders; purchase.body=purchaseBody; httpItems.push(purchase);
const replay = http('15 동일 구매 재요청 — 추가 차감 없음', '/api/v1/shop/purchases', 200,
    '14의 키·itemId·수량을 유지합니다. 가격/판매 상태가 바뀌어도 같은 영수증을 반환합니다. 새 구매는14입니다.',
    `pm.expect(pm.response.json().purchaseId).to.eql(pm.environment.get('purchaseId'));`,
    purchaseBefore + `\nif(!pm.environment.get('purchaseRequestKey')) throw new Error('먼저14를 실행하세요.');`);
replay.method='POST'; replay.headers=purchaseHeaders; replay.body=purchaseBody; httpItems.push(replay);
const inventory = http('16 내 보유 아이템 조회', '/api/v1/users/me/items', 200,
    'INVENTORY-01: 본인 quantity>0 보유·수량·장착 여부를 조회합니다. 판매 종료 보유도 표시합니다.',
    `pm.expect(pm.response.json().items).to.be.an('array');`,shopSetup);
inventory.headers=shopAuth; httpItems.push(inventory);
const equip = http('17 보유 의상 장착·변경', '/api/v1/users/me/equipment', 200,
    'INVENTORY-02: 본인 보유 EQUIPMENT의 userItemId로 수정합니다. 같은 부위는 하나만 장착합니다. 소비형·타인 소유는 실패합니다. 실제 커밋 뒤 같은 채널 본인·참가자에게 WORLD_STATE.payload.avatars[].equipment를 전송합니다. 공개 필드는 itemId/itemCode/equipSlot/imageKey만, null은 기존 외형 유지·[]는 장착 없음입니다. WS07로 채널 입장 후 이 요청을 실행하고 같은 채널 수신·다른 채널 미수신을 확인하세요. 재접속은 새 티켓→CHANNEL_JOIN 후 최신 장착을 복구합니다. 실제 3D 에셋 매핑은 별도 협의입니다.',
    `pm.expect(pm.response.json().equipment).to.be.an('array');`,
    shopSetup + `\nif(!/^[1-9][0-9]*$/.test(String(pm.environment.get('userItemId')||''))) throw new Error('장착할 본인 보유 ID를 설정하세요.');`);
equip.method='PATCH'; equip.headers=[...shopAuth,{key:'Content-Type',value:'application/json'}];
equip.body={mode:'raw',raw:'{\n  "userItemId": {{userItemId}}\n}',options:{raw:{language:'json'}}}; httpItems.push(equip);
const conflict = http('18 같은 구매 키에 다른 수량 — 409', '/api/v1/shop/purchases', 409,
    '14 성공 뒤 같은 계정·itemId·키를 유지하며 수량만2로 바꿔 충돌을 확인합니다. 추가 차감/지급은 없습니다.',
    codeTest('IDEMPOTENCY_CONFLICT'),purchaseBefore + `\nif(!pm.environment.get('purchaseRequestKey')) throw new Error('먼저14를 실행하세요.');`);
conflict.method='POST'; conflict.headers=purchaseHeaders;
conflict.body={mode:'raw',raw:'{\n  "itemId": {{shopItemId}},\n  "quantity": 2\n}',options:{raw:{language:'json'}}}; httpItems.push(conflict);

const miniStart = http('19 붕어빵 시작 — 세션 ID 저장', '/api/v1/minigames/sessions', 201,
    'MINI-01 v2: local,db + ontop.minigames.enabled=true 또는 dev,db에서 사용. dev는 V110/V111 추가 적용과 기본 활성화. 개인 환경 baseUrl=https://dev-api.on-top.world 및 해당 서버 Access JWT 사용(병합·배포 후). 같은 키는 같은 세션/불 세기. 새 키는 이전 판 포기. 60초·6칸·15점당1냥·KST 하루100냥. 탭 이동 중 시간 진행, 랭킹 제외.',
    `if(pm.response.code===201){ const s=pm.response.json(); pm.environment.set('minigameSessionId',s.minigameSessionId); pm.environment.set('minigameHeats',JSON.stringify(s.heats)); pm.environment.set('minigameStartedAt',s.startedAt); pm.environment.unset('minigameLog'); pm.expect(s.heats).to.have.lengthOf(64); pm.expect(s.rulesVersion).to.eql('v2'); }`,
    shopSetup + `\npm.environment.set('minigameRequestKey',pm.variables.replaceIn('{{$guid}}'));`);
miniStart.method='POST'; miniStart.headers=[...shopAuth,{key:'Content-Type',value:'application/json'},
    {key:'Idempotency-Key',value:'{{minigameRequestKey}}'}];
miniStart.body={mode:'raw',raw:JSON.stringify({minigameType:'BUNGEOPPANG'},null,2),options:{raw:{language:'json'}}};
httpItems.push(miniStart);
const miniBefore=shopSetup+`\nif(!/^[1-9][0-9]*$/.test(String(pm.environment.get('minigameSessionId')||''))) throw new Error('먼저19를 실행하세요.');`;
const miniLoad=http('20 본인 미니게임 상태', '/api/v1/minigames/sessions/{{minigameSessionId}}',200,
    'MINI-02: 본인만 조회. 진행 중 score/endedAt=null, rewardAmount=0. 타인은404.',
    `pm.expect(pm.response.json().minigameSessionId).to.eql(pm.environment.get('minigameSessionId'));`,miniBefore);
miniLoad.headers=shopAuth; httpItems.push(miniLoad);
const miniComplete=http('21 붕어빵 입력 검증·보상 확정', '/api/v1/minigames/sessions/{{minigameSessionId}}/complete',200,
    'MINI-03 v2: 시작 후60초 이상 기다린 뒤 제출. minigameLog에 실제 FE 로그를 넣거나 비워두면 발급 heats로 황금7개(86점) 테스트 입력을 만듭니다. 테스트 입력은 개발 서버 검증용이며 실제 플레이 증거가 아닙니다. 최소50ms·같은칸300ms·6칸·상태 순서를 검증합니다. 결과86점/계산5냥, 일일상한 적용. 같은 판 재전송은 최초 결과. 422 TOO_EARLY는 기다린 후 재시도, LOG_INVALID는 첫 사유 유지. score/rewardAmount/userId 금지. 포기 테스트는 새 판을 시작한 뒤22를 실행하세요.',
    `if(pm.response.code===200){const r=pm.response.json(); pm.expect(r.coinsGranted).to.be.within(0,r.coinsCalculated); pm.expect(r.todayEarned).to.be.at.most(100); pm.expect(r.rewardAmount).to.eql(r.coinsGranted);}`,
    miniBefore+`\nif(!pm.environment.get('minigameLog')) {
 const heats=JSON.parse(pm.environment.get('minigameHeats')||'[]'); if(heats.length!==64) throw new Error('먼저19 실행');
 const log=[];
 for(let i=0;i<7;i++){const slot=i%6,pour=i<6?i*350:22000,fill=pour+3000,d=Math.ceil(600000/heats[i]);
 log.push({slot,action:'POUR',t:pour},{slot,action:'FILL',t:fill},{slot,action:'TURN',t:fill+d},{slot,action:'TURN',t:fill+2*d});}
 log.sort((a,b)=>a.t-b.t); let last=-50; log.forEach(e=>{e.t=Math.max(e.t,last+50);last=e.t;});
 pm.environment.set('minigameLog',JSON.stringify(log));
}`);
miniComplete.method='POST'; miniComplete.headers=[...shopAuth,{key:'Content-Type',value:'application/json'}];
miniComplete.body={mode:'raw',raw:'{\n  "log": {{minigameLog}},\n  "seenTips": ["START", "GOLD"],\n  "clientScore": 86\n}',options:{raw:{language:'json'}}}; httpItems.push(miniComplete);
const miniAbandon=http('22 붕어빵 중도 포기', '/api/v1/minigames/sessions/{{minigameSessionId}}/abandon',200,
    'MINI-04: PLAYING→ABANDONED, 보상0. 반복 포기는 같은 결과, 이미 완료된 세션은409로 지급 취소 방지.',
    `pm.expect(pm.response.json().status).to.eql('ABANDONED'); pm.expect(pm.response.json().rewardAmount).to.eql(0);`,miniBefore);
miniAbandon.method='POST'; miniAbandon.headers=[...shopAuth,{key:'Content-Type',value:'application/json'}];
miniAbandon.body={mode:'raw',raw:'{}',options:{raw:{language:'json'}}}; httpItems.push(miniAbandon);
const miniOverview=http('23 붕어빵 오늘 보상·첫 판·안내 조회','/api/v1/minigames/sessions',200,
    'MINI-02 추가 조회: KST todayEarned, dailyCap100, isFirstGame, seenTips, rulesVersion v2. 랭킹 없음.',
    `pm.expect(pm.response.json().dailyCap).to.eql(100); pm.expect(pm.response.json().rulesVersion).to.eql('v2');`,shopSetup);
miniOverview.headers=shopAuth; httpItems.push(miniOverview);

const feedbackDescription = 'M07 비공개 소리함. local/dev,db + 기능 활성화·V120 순서 조율 후 스키마 적용 필요. '
    + '인증 회원이 서버 소리함 좌표(-10.8,0.8,14.5) 2.6m·높이±0.7m 이내에서 작성합니다. '
    + '테이블/경기/시설/수영 중 불가, 새 의견15초 간격. 같은 operationId·본문·채널은 기존 영수증, 다른 내용409. '
    + '본문5~600 UTF-16 단위·NFC/제어문자 제거. 90일 보관·탈퇴 시 작성자 연결 제거, 관리자만 조회. '
    + 'dev 기본 비활성(경로 미등록)이며 V112 등 기존 마이그레이션 순서 조율 전 자동 적용하지 않습니다.';
const feedbackBody = {mode:'raw', raw:JSON.stringify({operationId:'{{feedbackOperationId}}',
    channelId:'{{channelIdA}}', text:'공원을 개선해주세요'},null,2),options:{raw:{language:'json'}}};
const feedbackNew = http('24 소리함 비공개 의견 접수','/api/v1/feedback',201,feedbackDescription,
    `const r=pm.response.json(); pm.expect(r.receiptId).to.be.a('string'); pm.expect(r).not.to.have.property('text');
if(pm.response.code===201) pm.environment.set('feedbackReceiptId',r.receiptId);`,
    shopSetup + `\npm.environment.set('feedbackOperationId',pm.variables.replaceIn('{{$guid}}'));`);
    feedbackNew.method='POST'; feedbackNew.headers=[{key:'Authorization',value:'Bearer {{accessToken}}'},
        {key:'Content-Type',value:'application/json'}];
feedbackNew.body=feedbackBody; httpItems.push(feedbackNew);
const feedbackReplay = http('25 소리함 동일 요청 복구','/api/v1/feedback',201,
    feedbackDescription + ' 24의 키·본문·채널을 그대로 보냅니다. 키를 새로 만들지 않습니다.',
    `pm.expect(pm.response.json().receiptId).to.eql(pm.environment.get('feedbackReceiptId'));`,
    shopSetup + `\nif(!pm.environment.get('feedbackOperationId')) throw new Error('24를 먼저 실행하세요.');`);
feedbackReplay.method='POST'; feedbackReplay.headers=feedbackNew.headers; feedbackReplay.body=feedbackBody;
httpItems.push(feedbackReplay);
const feedbackAdmin = http('26 관리자 소리함 조회','/api/v1/admin/feedback?limit=20',200,
    feedbackDescription + ' 서버 관리자 목록에 등록된 본인의 Access JWT로 바꿔 실행합니다. 일반 회원403이 정상입니다. '
    + 'nextCursor를 cursor 쿼리에 넣어 다음 페이지를 조회하고 text를 일반 텍스트로 표시하세요.',
    `pm.expect(pm.response.json().items).to.be.an('array');`,shopSetup);
feedbackAdmin.headers=[{key:'Authorization',value:'Bearer {{accessToken}}'}]; httpItems.push(feedbackAdmin);

const notesDescription = 'M08 공개 익명 메모. local/dev,db + notes.enabled=true + 전용 privacy-secret + V121 순서 조율 후 스키마 적용 필요. '
    + '서버 위치(54.5,18.92,48.5) XZ2.6m·높이차0.7m미만, 테이블/시설/수영 중 불가. '
    + '전 채널 공용 최신120장·쓰기15초/읽기1초. 메모/응답은 id,text,createdAt만 사용. '
    + '24시간 동일키 재확인,410은 자동 재게시 금지. 창을 연 동안2초마다 겹치지 않게 조회하고 닫기·이탈·단절 시 중지. docs/notes-api.md.';
const notesBody = {mode:'raw',raw:JSON.stringify({operationId:'{{noteOperationId}}',channelId:'{{channelIdA}}',
    text:'오늘도 좋은 하루 보내세요'},null,2),options:{raw:{language:'json'}}};
const noteNew = http('27 전망대 익명 메모 작성','/api/v1/notes',201,notesDescription,
    `const r=pm.response.json(); pm.expect(Object.keys(r.note).sort()).to.eql(['createdAt','id','text']);
if(pm.response.code===201) pm.environment.set('noteId',r.note.id);`,
    shopSetup + `\npm.environment.set('noteOperationId',Date.now()+'_'+pm.variables.replaceIn('{{$guid}}'));`);
noteNew.method='POST';noteNew.headers=[{key:'Authorization',value:'Bearer {{accessToken}}'},
    {key:'Content-Type',value:'application/json'}];noteNew.body=notesBody;httpItems.push(noteNew);
const noteReplay = http('28 익명 메모 동일 요청 재확인','/api/v1/notes',201,notesDescription,
    `pm.expect(pm.response.json().note.id).to.eql(pm.environment.get('noteId'));`,
    shopSetup + `\nif(!pm.environment.get('noteOperationId')) throw new Error('27을 먼저 실행하세요.');`);
noteReplay.method='POST';noteReplay.headers=noteNew.headers;noteReplay.body=notesBody;httpItems.push(noteReplay);
const noteRead = http('29 전망대 익명 메모 조회','/api/v1/notes?channelId={{channelIdA}}',200,notesDescription,
    `const notes=pm.response.json().notes;pm.expect(notes).to.be.an('array');pm.expect(notes.length).to.be.at.most(120);
notes.forEach(n=>pm.expect(Object.keys(n).sort()).to.eql(['createdAt','id','text']));`,shopSetup);
noteRead.headers=[{key:'Authorization',value:'Bearer {{accessToken}}'}];httpItems.push(noteRead);


const message = (name, type, payload = {}) => ({
    name, $kind: 'websocket-message', contentType: 'json',
    content: JSON.stringify({ requestId: '{{$guid}}', type, payload }, null, 2)
});
const movementGuide = 'WORLD_MOVE는 {seq,dx,dz,run,jump?} 입력만 허용합니다. seq1~4294967295, dx/dz 각[-1,1] 대각선 정규화, run필수 boolean/jump선택. 서버30Hz·변화100ms동기화·입력50ms·250ms만료. 걷기6.25/달리기9/점프6.2/중력-18/단차0.22. 채널 입장 시 서버 스폰(캡슐 중심), lastInputSeq는 수락순번, mapVersion 대조. 기존 sequence/x/y/z/yaw 주입은 INVALID_PAYLOAD. 재접속30초·채팅/관전20m 유지. ';
const joinA = () => message('01 광장 A 입장 → CHANNEL_STATE + WORLD_STATE', 'CHANNEL_JOIN', { channelId: '{{channelIdA}}' });
const locate = () => message('이동 입력 → WORLD_STATE (채널 입장 시 서버 스폰)',
    'WORLD_MOVE', { seq: 1, dx: 0, dz: -1, run: false, jump: false });
const sitA = () => message('05 A 테이블 착석 → TABLE_STATE', 'TABLE_JOIN', { tableId: '{{tableIdA}}' });
const ready = flag => message(flag ? '07 준비 → TABLE_STATE' : '추가 준비 취소 → TABLE_STATE', 'READY_SET', { ready: flag });
const leave = () => message('추가 테이블 퇴장 → TABLE_LEFT', 'TABLE_LEAVE');
const channelLeave = () => message('추가 광장 퇴장 → CHANNEL_LEFT (착석 중이면 먼저 테이블 퇴장)', 'CHANNEL_LEAVE');
const select = code => message(code === 'OMOK' ? '06 첫 착석자 오목 선택 → TABLE_STATE'
    : `추가 첫 착석자 ${code} 선택 (전원 준비 초기화)`, 'GAME_SELECT',
    code === 'DICE' ? { gameCode: code, targetScore: 4000 } : { gameCode: code });
const primaryMessages = [
    joinA(),
    message('02 걷기 입력 seq1 → WORLD_STATE (미착석)', 'WORLD_MOVE', { seq: 1, dx: 0, dz: -1, run: false, jump: false }),
    message('추가 달리기 입력 seq2 → WORLD_STATE (50ms 후·미착석)', 'WORLD_MOVE', { seq: 2, dx: 0, dz: -1, run: true, jump: false }),
    message('03 채팅 → WORLD_CHAT_MESSAGE (1초 간격)', 'WORLD_CHAT_SEND', { text: '안녕! Postman으로 테스트 중이야 👋' }),
    message('04 손흔들기 → WORLD_EMOTE_EVENT (다음 사용 5초)', 'WORLD_EMOTE_SEND', { emoteCode: 'WAVE' }),
    sitA(), select('OMOK'), ready(true), ready(false), leave(), channelLeave(),
    message('추가 광장 B 입장 (A 퇴장 후)', 'CHANNEL_JOIN', { channelId: '{{channelIdB}}' }),
    message('추가 박수 → WORLD_EMOTE_EVENT (다음 사용 5초)', 'WORLD_EMOTE_SEND', { emoteCode: 'CLAP' }),
    message('추가 박수 부탁 → WORLD_EMOTE_EVENT (다음 사용 1.8초)', 'WORLD_EMOTE_SEND',
        { emoteCode: 'APPLAUSE_REQUEST' }),
    message('추가 에잉 쯧쯧 → WORLD_EMOTE_EVENT (다음 사용 1.8초)', 'WORLD_EMOTE_SEND', { emoteCode: 'TSK' }),
    message('추가 방귀 → WORLD_EMOTE_EVENT (다음 사용 1.8초)', 'WORLD_EMOTE_SEND', { emoteCode: 'FART' }),
    select('DICE'), select('ONE_CARD'), select('LIAR_BRIDGE'),
    message('오류 미등록 감정표현 → EMOTE_NOT_SUPPORTED', 'WORLD_EMOTE_SEND', { emoteCode: 'NOT_REGISTERED' }),
    message('오류 없는 테이블 → TABLE_NOT_FOUND', 'TABLE_JOIN', { tableId: 'not-a-table' }),
    message('오류 사용자 위조 필드 → INVALID_PAYLOAD', 'WORLD_CHAT_SEND', { text: '위조 거절 확인', userId: 'someone-else' }),
    message('오류 미구현 PING JSON → UNSUPPORTED_MESSAGE_TYPE', 'PING'),
    message('연동 전 경기 복구 조회 → dev에서는 RECOVERY_NOT_AVAILABLE', 'GAME_RECONNECT_CHECK'),
    message('연동 전 경기 상태 조회 → dev에서는 GAME_STATE_AUTH_REQUIRED', 'GAME_STATE_CHECK', { gameId: '{{gameId}}' }),
    message('연동 전 시작 조회 → 기본 모드는 UNSUPPORTED_MESSAGE_TYPE', 'GAME_START_CHECK')
];
primaryMessages.push(
    message('시설 01 목록 → WORLD_FACILITY_CATALOG (10개씩)', 'WORLD_FACILITY_CATALOG', {}),
    message('시설 02 점유 조회 → WORLD_FACILITY_STATE (입장·재접속 필수)', 'WORLD_FACILITY_CHECK', {}),
    message('시설 03 벤치 이용 → WORLD_FACILITY_STATE (서버 근접 필요)', 'WORLD_FACILITY_USE',
        { facilityId: 'bench-0', seatIndex: 0 }),
    message('시설 04 망원경 이용 → WORLD_FACILITY_STATE (정상 접근 필요)', 'WORLD_FACILITY_USE',
        { facilityId: 'telescope-1', seatIndex: 0 }),
    message('시설 05 망원경 방향 → WORLD_FACILITY_STATE (100ms 간격)', 'WORLD_FACILITY_AIM',
        { leaseId: '{{facilityLeaseId}}', seq: 1, yaw: 0.5, pitch: -0.2 }),
    message('시설 06 반납 → WORLD_FACILITY_STATE (본인 leaseId)', 'WORLD_FACILITY_RELEASE',
        { leaseId: '{{facilityLeaseId}}' })
);
const wsRequest = (name, description, messages) => ({
    name, $kind: 'websocket-request', url: '{{wsUrl}}',
    description: movementGuide + description,
    headers: [{ key: 'Origin', value: '{{baseUrl}}', description: '서버와 같은 출처. CORS/Origin 허용 범위를 넓히지 않습니다.' }],
    settings: { handshakeTimeout: 10000, retryCount: 0, maxPayload: 1048576 },
    messages
});
const wsItems = [
    wsRequest('01 참가자 A — 먼저 착석하는 사람',
        'Connect 한 번 후 CONNECTED를 확인하고 Saved Messages에서 보냅니다. 메시지마다 새 연결을 만들면 다른 임시 사용자가 됩니다. '
        + '기본 흐름: A/B 모두 광장 입장 → 서버 스폰 확인 후 WORLD_MOVE 방향 입력 → A 먼저 착석 → B 착석 → A 게임 선택 → A/B 준비. '
        + '채팅은 같은 채널의 보고 위치 기준 XZ 반경 20m(경계 포함) 안에서만 수신합니다. x/z는 1단위=1m이며 위치 미보고 송신은 WORLD_POSITION_REQUIRED입니다. '
        + '나머지 추가/오류 메시지는 각 선행조건을 맞춘 뒤 따로 보냅니다. local/dev 기본 감정표현은 WAVE/CLAP/APPLAUSE_REQUEST/TSK/FART 5종이며 직전 표현이 손 인사/박수면 5초, 나머지는 1.8초 뒤 다음 표현을 보냅니다. 활동별 제한은 별도 확인입니다.',
        primaryMessages),
    wsRequest('02 참가자 B — 두 번째 착석하는 사람',
        'A와 별개 연결입니다. A가 먼저 앉은 다음 05 착석을 보내고, A 게임 선택 후 07 준비를 보냅니다. '
        + '채팅 전에는 A/B 모두 방향 입력가 필요합니다. 근거리 검사는 XZ 평면 20m이며 경계도 포함합니다. '
        + '양쪽 미착석 상태에서 WORLD_STATE의 실제 서버 위치로 XZ 거리 20m 안/밖을 확인합니다. B가 방향 입력으로 경계/밖/복귀 순서로 이동하고 각 단계에서 A가 채팅을 보냅니다. 경계·복귀에서는 B 수신, 밖에서는 미수신이 정상입니다. 스폰 좌표를 고정값으로 가정하거나 최종 좌표를 주입하지 않습니다. 이동 입력은 50ms·채팅은 1초 이상 간격입니다. '
        + 'A의 상태 변경도 requestId=null 알림으로 들어옵니다. 원카드/거짓말은 2~4명이며 추가 탭으로 다른 임시 사용자를 만들 수 있습니다.',
        [joinA(), locate(), sitA(), ready(true), ready(false), leave(), channelLeave(),
            message('이동 1 — seq2 걷기 (50ms 후, 수신한 서버 좌표 확인)', 'WORLD_MOVE', { seq: 2, dx: 0, dz: -1, run: false, jump: false }),
            message('이동 2 — seq3 점프 (50ms 후)', 'WORLD_MOVE', { seq: 3, dx: 0, dz: -1, run: false, jump: true }),
            message('이동 3 — seq4 정지 (50ms 후)', 'WORLD_MOVE', { seq: 4, dx: 0, dz: 0, run: false, jump: false }),
            message('추가 채팅', 'WORLD_CHAT_SEND', { text: 'B도 접속했어!' }),
            message('다른 채널 격리 확인 — B 광장으로 (현재 채널 퇴장 후)', 'CHANNEL_JOIN', { channelId: '{{channelIdB}}' }),
            message('다른 채널 B 테이블 착석', 'TABLE_JOIN', { tableId: '{{tableIdB}}' }),
            message('오류 선택권 없음 — A가 먼저 앉았을 때만', 'GAME_SELECT', { gameCode: 'DICE', targetScore: 4000 })]),
    wsRequest('03 관전자 C — 공개 대기 상태 보기',
        '광장 A 입장·서버 스폰 확인 후 TABLE_WATCH를 보냅니다. 서버 테이블 좌표가 설정되어 있고 중심 20m 이내여야 합니다. 미설정/범위 밖은 TABLE_OUT_OF_RANGE입니다. TABLE_WATCH_STATE를 받으며 좌석·준비 인원은 늘지 않습니다. '
        + 'x/z는 1단위=1m인 서버 판정 위치입니다. 방향 입력을 반복해 실제 테이블 중심에 접근합니다. 거리 초과 이동 시 TABLE_WATCH_LEFT로 종료하고 다시 가까워져도 자동 재구독하지 않습니다. '
        + 'TABLE_WATCH_STATE.payload.gameId는 확정 PLAYING만 문자열이고 그 외null입니다. 시작·종료 때 version이 증가합니다. '
        + '이 값을 개인 환경 gameId에 복사하거나 HTTP12로 받아 GAME_WATCH를 별도 요청하세요. null/새ID면 GAME_UNWATCH 후 새ID로 관전합니다. '
        + '실제 경기 관전 권한이나 원카드 손패 구독이 아닙니다. 착석 성공 시 구독은 자동 종료됩니다.',
        [joinA(), locate(), message('02 테이블 보기 → TABLE_WATCH_STATE', 'TABLE_WATCH', { tableId: '{{tableIdA}}' }),
            message('03 보기 종료 → TABLE_WATCH_LEFT', 'TABLE_UNWATCH'),
            message('오류 관전자 준비 → NOT_SEATED (미착석일 때)', 'READY_SET', { ready: true }),
            message('추가 관전자 채팅', 'WORLD_CHAT_SEND', { text: '구경 중이야!' }),
            message('추가 감정표현', 'WORLD_EMOTE_SEND', { emoteCode: 'CLAP' }), sitA(), leave(), channelLeave()]),
    wsRequest('04 선택적 시작 검증 A — 서버 옵션 필요',
        '서버를 --spring.profiles.active=local,visual-test --ontop.start-rehearsal.enabled=true 로 재실행해야 합니다. '
        + '아래 B 연결과 함께 사용. 전원 준비 후 STARTING → CONFIRMED이며 실제 차감·경기 실행은 없습니다. '
        + '성공 후 좌석은 유지되므로 일반 퇴장 테스트와 섞지 마세요. 새 검증은 서버 재실행 또는 다른 테이블을 사용합니다.',
        [joinA(), sitA(), select('OMOK'), ready(true), message('08 같은 시작 시도 결과 확인', 'GAME_START_CHECK')]),
    wsRequest('05 선택적 시작 검증 B — 서버 옵션 필요',
        '04 A가 먼저 착석 → B 착석 → A 게임 선택 → 양쪽 준비. 인증 모드와 시작 검증 모드는 함께 켤 수 없습니다.',
        [joinA(), sitA(), ready(true), message('08 시작 상태 재확인', 'GAME_START_CHECK')]),
    wsRequest('06 경기 통신 — 인증·엔진 연동 대기',
        '현재 기본 dev 연결에서 정상 결과는 아래 이름의 오류입니다. 임의 인증 헤더를 넣지 마세요. '
        + '오목은 실제 엔진이 있으며 local에서 ontop.games.omok.enabled=true로 선택 활성화합니다. 실제 인증 사용자 검증과 서버 내부 참가 확정 후 경기 생성 연결이 필요합니다. 옵션만 켜거나 04/05 시작 검증을 실행해 실제 오목을 시작할 수는 없습니다. gameId를 실제 경기 ID로 바꿉니다. '
        + '오목 input은 x/y 두 필드만 허용하며 각각 0~14 정수인 판 좌표입니다. 02 예제는 흑 첫 수(7,7), expectedVersion=0입니다. 이후 최신 GAME_STATE.version과 본인 차례에 맞춰 수정합니다. '
        + 'actionId는 같은 행동 재확인에만 재사용하고 새 행동은 새 ID를 사용합니다. '
        + '참가자는 복구 후 입력 성공 시 본인 공개/개인 GAME_STATE를 자동 수신합니다. '
        + '관전자는 채널·미터 방향 입력·서버 테이블 좌표와 Gateway 내부 tableId가 필요하며 중심 20m 이내에서 GAME_WATCH합니다. 성공 후 빈 privateState의 GAME_STATE만 수신하며 GAME_UNWATCH 또는 범위 이탈로 해제합니다. '
        + 'GAME_STATE_CHECK의 SPECTATOR도 동일한 범위를 검사합니다. 위치·좌표·내부 tableId 미확인/범위 밖은 GAME_STATE_ACCESS_DENIED입니다. 이동 이탈·채널 퇴장·착석은 GAME_WATCH_LEFT이며 범위 복귀로 자동 재관전하지 않습니다. 방향 입력와 채널 입장은 01~03 연결의 예제를 같은 연결에서 사용합니다. '
        + '최초 응답은 원래 requestId, 자동 알림은 null입니다. GAME_STATE가 GAME_ACTION_RESULT보다 먼저 올 수 있어 확인은 requestId/actionId, 상태는 version으로 독립 처리합니다. '
        + '경기 종료 시 4종 엔진의 서버 종료 알림이 현재 참가자 본인의 저장 결과를 1회 자동 조회합니다. 결과가 있으면 GAME_RESULT(requestId=null)를 수신합니다. 미저장·읽기 실패 때는 가짜 결과/자동 오류를 보내지 않습니다. 이후 DB 담당의 커밋 알림으로 PENDING/null → SETTLED/본인 확정 순증감을 수신하거나 07 GAME_RESULT_CHECK로 재조회합니다. 재접속도 07로 다시 읽습니다. 결과 version과 경기 상태 version은 별개이며 결과 조회는 지급을 실행하지 않습니다. '
        + '오목은 15×15 렌주·흑 선공·흑 정확히 5목/백 5개 이상 승리. 흑 33·44·장목은 GAME_ACTION_FORBIDDEN_MOVE로 거절하고 판·버전·차례·턴 마감은 유지합니다. 같은 수의 정확한 5목은 금수보다 우선합니다. 한 수 30초 도달 시 시간패·총시간 제한 없음입니다. 복귀해도 기존 turnDeadline은 유지하며 재접속 유예보다 턴 마감이 먼저면 종료합니다. '
        + 'publicState에는 gameCode/status, boardSize/board[y][x](0빈칸/1흑/2백), blackUserId/whiteUserId, moveCount/lastMove, turnUserId/turnDeadline, winnerUserId/endReason/endedAt이 있습니다. 참가자·관전자 privateState는 모두 {}입니다. 종료 사유는 FIVE_IN_ROW, BOARD_FULL, TURN_TIMEOUT, RECONNECT_EXPIRED이며 종료 후 차례·턴 마감은 null입니다. 승패 상태는 정산 확정이 아니며 엽전 지급은 별도입니다. '
        + '09/10은 02 성공 후 actionId·원래 버전을 유지하고 각각 중복 확인·내용 충돌을 검사합니다. 11은 복귀 조회이며 마감을 연장하지 않습니다. 기본 dev에서는 여전히 인증 오류가 정상이고 경기 성공 시연용이 아닙니다.',
        [message('01 경기 상태 조회 → dev: GAME_STATE_AUTH_REQUIRED', 'GAME_STATE_CHECK', { gameId: '{{gameId}}' }),
            message('02 경기 입력 → dev: GAME_ACTION_AUTH_REQUIRED', 'GAME_ACTION_SEND',
                { gameId: '{{gameId}}', actionId: 'omok-move-1', expectedVersion: 0, input: { x: 7, y: 7 } }),
            message('03 경기 관전 → dev: GAME_STATE_AUTH_REQUIRED', 'GAME_WATCH', { gameId: '{{gameId}}' }),
            message('04 경기 관전 종료 → 미구독: GAME_NOT_WATCHING', 'GAME_UNWATCH'),
            message('05 오류 관전 사용자 위조 → INVALID_PAYLOAD', 'GAME_WATCH', { gameId: '{{gameId}}', userId: 101 }),
            message('06 오류 음수 경기 버전 → INVALID_PAYLOAD', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'example-action-2', expectedVersion: -1, input: {} }),
            message('07 본인 종료·정산 결과 조회 → dev: GAME_RESULT_AUTH_REQUIRED', 'GAME_RESULT_CHECK',
                  { gameSessionId: '{{gameId}}' }),
            message('08 오류 정산 금액 지정 → INVALID_PAYLOAD', 'GAME_RESULT_CHECK',
                  { gameSessionId: '{{gameId}}', myCoinDelta: 100 }),
            message('09 오목 같은 수 재확인 — 02 성공 후 같은 계정·경기', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'omok-move-1', expectedVersion: 0, input: { x: 7, y: 7 } }),
            message('10 오목 같은 actionId 다른 좌표 — ACTION_ID_CONFLICT', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'omok-move-1', expectedVersion: 0, input: { x: 8, y: 7 } }),
            message('11 오목 복귀 조회 — 기존 판·버전·턴 마감 유지', 'GAME_RECONNECT_CHECK'),
            message('12 주사위 첫 굴림 — DICE 경기·현재 차례·version0', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'dice-roll-1', expectedVersion: 0, input: { kind: 'roll', selectedIds: [] } }),
            message('13 주사위 재굴림 — 0번이 득점할 때·최신 버전으로 수정', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'dice-roll-2', expectedVersion: 1, input: { kind: 'roll', selectedIds: [0] } }),
            message('14 주사위 Bank — 0번이 득점할 때·최신 버전으로 수정', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'dice-bank-1', expectedVersion: 1, input: { kind: 'bank', selectedIds: [0] } }),
            message('15 주사위 동일 첫 굴림 재확인 — 12와 같은 계정·경기', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'dice-roll-1', expectedVersion: 0, input: { kind: 'roll', selectedIds: [] } }),
            message('16 원카드 제출 — 본인 손패 cardId·최신 버전으로 수정', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'onecard-play-1', expectedVersion: 0, input: { kind: 'play', cardId: 'replace-with-your-hand-card-id' } }),
            message('17 원카드 일반 뽑기 — 공격 아닐 때·최신 버전', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'onecard-draw-1', expectedVersion: 0, input: { kind: 'draw' } }),
            message('18 원카드 누적 공격 받기 — 공격 중·최신 버전', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'onecard-accept-1', expectedVersion: 0, input: { kind: 'accept-attack' } }),
            message('19 원카드 무늬 선택 — 본인 CHOOSE_SUIT·최신 버전', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'onecard-suit-1', expectedVersion: 0, input: { kind: 'select-suit', suit: 'hearts' } }),
            message('20 원카드 선언 — 한 장 pending 3초 내·최신 버전', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'onecard-declare-1', expectedVersion: 0, input: { kind: 'declare-one' } }),
            message('21 원카드 미선언 신고 — targetUserId·최신 버전 수정', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'onecard-catch-1', expectedVersion: 0, input: { kind: 'catch-one', targetUserId: 'replace-with-public-player-user-id' } }),
            message('22 다리 비밀 굴림 — 본인 AWAITING_ROLL·최신 버전', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'bridge-roll-1', expectedVersion: 0, input: { kind: 'roll' } }),
            message('23 다리 숫자 선언 — 본인 DECLARING·최신 버전', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'bridge-declare-1', expectedVersion: 0, input: { kind: 'declare', value: 4 } }),
            message('24 다리 믿기 — 본인 RESPONDING·최신 버전', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'bridge-trust-1', expectedVersion: 0, input: { kind: 'trust' } }),
            message('25 다리 다우트 — 본인 RESPONDING·최신 버전', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'bridge-doubt-1', expectedVersion: 0, input: { kind: 'doubt' } }),
            message('26 본인 경기 수동 기권 — 승인 뒤 취소 불가·소켓 유지', 'GAME_FORFEIT',
                  { gameId: '{{gameId}}', actionId: 'manual-forfeit-1' }),
            message('27 같은 기권 재확인 — duplicate:true·이벤트 재발행 없음', 'GAME_FORFEIT',
                  { gameId: '{{gameId}}', actionId: 'manual-forfeit-1' }),
            message('28 기권 사용자 위조 거절 — INVALID_PAYLOAD', 'GAME_FORFEIT',
                  { gameId: '{{gameId}}', actionId: 'manual-forfeit-forged', userId: 'other-user' })])
];
const farkleGuide = '주사위(DICE)는 local의 ontop.games.farkle.enabled=true로 선택 활성화하며 서버 내부 참가 확정 후 생성한 경기에서 실행합니다. '
    + '12는 최초 굴림,13은 재굴림,14는Bank,15는12의 동일행동 재확인입니다. 13/14는 최신 GAME_STATE.version과 현재 dice의 held=false 득점 ID로 수정하세요. 서로 순차 실행하는 고정 시나리오가 아닙니다. '
    + 'input={kind:roll/bank,selectedIds:중복없는0~5정수배열}만 허용합니다. 선택 전체의 겹치지 않는 득점 조합 중 최대합, 굴림 간 조합결합 불가. '
    + '1=100,5=50,동일3개는1일때1000/그외눈×100,4·5·6개는2·4·8배,12345=500,23456=750,123456=1500. 최소Bank제한·세쌍보너스 없음. '
    + 'BUST는이번턴만소실,HOT DICE는이번턴유지·6개재굴림. 서버확정목표2000/4000/6000에Bank로도달시즉시승리·상대추가턴없음. '
    + '한차례전체30초,재굴림·거절·재접속으로연장하지않으며 만료시저장총점유지·이번턴소실·차례넘김. 오목은기존시간패. '
    + 'publicState:gameCode=DICE,status,players,scores,targetScore,turnTimeLimitMs=30000,turnUserId,turnDeadline,turnScore,dice[{id,value,held}],stage(AWAITING_ROLL/SELECTING/FINISHED),rollId,round,hotDice,lastEvent,winnerUserId,endReason,endedAt. '
    + 'privateState={},새차례첫굴림전dice=[]. BANK/BUST는바로다음차례상태를전송하며 프론트가rollId/lastEvent로연출합니다. 종료는TARGET_REACHED/RECONNECT_EXPIRED이며DB정산확정과구분합니다. ';
wsItems[5].description += '\n\n' + farkleGuide;
wsItems[5].description += '\n\n수동 기권: GAME_FORFEIT {gameId,actionId}만 허용하며 본인 차례/expectedVersion 불필요. '
    + 'GAME_FORFEIT_RESULT는 {gameId,actionId,version,duplicate}. 동일 경기·참가자는 한번만 확정하고 재전송/재클릭은duplicate:true와최초version. '
    + '소켓·로그인·채널을유지하며30초유예없이기권. 본인에게GAME_CONNECTION_STATE PENDING→FINISHED/ELIMINATED, '
    + '참가자/허용관전자에게GAME_STATE. 응답과상태순서보장없음. 2인은상대승리,3~4인은본인탈락후계속. '
    + '서버이벤트GameParticipantLeft EXPLICIT_LEAVE와최종GameFinished는기존DB정산연결계약이며승인응답이정산완료는아님. '
    + '종료·다른사유탈락은GAME_FORFEIT_GAME_FINISHED/NOT_ACTIVE,관전자·다른경기·미복구는GAME_RECOVERY_REQUIRED. '
    + '늦은오목시간패우선,다리pendingForfeit경계와원카드손패제외유지. 기권취소명령없음·좌석은기존정산후대기정책. '
    + '승인유실후새접속권으로FINISHED복구→보존테이블의원래CHANNEL_JOIN→같은기권재확인(duplicate:true). 다른채널TABLE_BUSY. '
    + 'PENDING은다음판차단,저장조회/커밋알림SETTLED후전원다시준비. 과거기권/종료/정산은새경기에미적용. '
    + '로컬구현·검증완료/미배포,메모리중복영수증이며재시작·다중서버보장별도.';
const onecardGuide = '원카드(ONE_CARD)는2~4명·54장·7장배분·서버랜덤선공이며 local의 ontop.games.onecard.enabled=true로 선택 활성화합니다. '
    + '2026-10-22확정: 기권손패는이번경기에서제외(REMOVE)하며뽑기덱환원/셔플없음. 다음판은새덱,별도정책설정불필요. '
    + '16~21은독립예제입니다. gameId/expectedVersion은실제경기·최신버전,cardId는본인privateState.hand,targetUserId는공개players.userId로수정합니다. '
    + 'input kind=play(cardId)/draw/accept-attack/select-suit(suit=hearts,diamonds,clubs,spades)/declare-one/catch-one(targetUserId문자열). '
    + '공개상태에는players장수/활성/선언창,topCard/activeSuit,attackTotal/lastAttack,drawCount,stage(PLAYING/CHOOSE_SUIT/FINISHED),direction,extraAction,turnUserId/turnDeadline,turnCount,winnerUserIds/endReason/endedAt. '
    + '본인privateState만userId/hand/playableCardIds/canDraw를포함하고관전자privateState={}. 복구state={publicState,privateState}는본인손패·마감유지. '
    + '한차례30초,K/무늬선택/재접속으로연장하지않음. 만료시F1대로일반1장/공격누적받고넘김,무늬선택은최다무늬자동선택후넘김(동률hearts,diamonds,clubs,spades순서). 시간패없음. '
    + '선언/신고반응창은별도3초·첫유효행동우선·신고2장벌칙·만료만으로자동벌칙없음. 마지막특수카드도효과없이즉시승리. 덱재구성/부족시가능장수/교착최소손패공동승리. '
    + '공격/특수카드세부표는docs/onecard.md. 서버승패는DB정산·재화지급과구분하며실제인증·참가확정서버생성이필요합니다. ';
wsItems[5].description += '\n\n' + onecardGuide;
const bridgeGuide = '거짓말다리(LIAR_BRIDGE)는2~4명·각7개말,local의ontop.games.bridge.enabled=true와서버내부참가확정경기로실행합니다. '
    + '22~25는독립예제입니다. 최신gameId/expectedVersion과turnUserId/responderUserId·stage에맞춰사용하고새행동은새actionId를사용합니다. '
    + 'input=roll/declare(value1~4)/trust/doubt만허용,눈/승자/추가필드주입은거절합니다. 원본TS의phaseVersion/turnId는input으로보내지않습니다. '
    + '굴림·선언·각판단30초. 굴림/선언만료는자동굴림·자동선언없이현재차례넘김,판단만료는믿고다음판단자. 판정연출1.5초입력차단. 복귀는같은눈/기존마감유지. '
    + '본인DECLARING/RESPONDING만privateState={userId,turnId,die:1~4또는X},상대·관전자·판정후는{}. 모두믿은resolution은actualFace키자체없음,다우트때만actualFace/challengerUserId/wasBluff공개. '
    + '공개상태는stage,turnId,turnUserId,responderUserId,turnDeadline,phaseTimeLimitMs30000,resolutionVisualMs1500,declaration,responseOrder,acceptedBy,players(말/점수/기권),goalSlots8개,nextGoalSlot,resolution,operations,lastEvent,winnerUserIds/endReason/endedAt. '
    + '슬롯은영구순번1~8/VACATED재사용없음. 골인말만있는사람은판단가능,실패시최저슬롯제거. 페널티/이동/슬롯발급/기권적용후승패판정. 3골인우선,8발급/말소진시미기권최고점공동승리. '
    + '복구state={publicState,privateState}. 기존20m관전/30초유예유지. 승패는DB정산·지급완료아님. 상세docs/bridge.md. ';
wsItems[5].description += '\n\n' + bridgeGuide;
wsItems.push({ ...wsRequest('07 로그인 사용자 — 1회용 접속권',
    '먼저 HTTP10을 보내 30초 접속권을 받으세요. 개인 로컬 websocketTicket에 넣고 즉시 Connect. '
    + 'HTTP10과 같은 Origin을 사용하고 재접속마다 새 접속권을 발급합니다. JWT는 URL에 넣지 않습니다. '
    + 'CONNECTED 내부ID → TABLE_JOIN → GAME_SELECT → READY_SET, 중복 연결1008·heartbeat·30초복구는 기존 계약입니다. '
    + '실제 시작은 ontop.game-start.enabled=true + 실제 B GameStartGateway + 사용할 엔진이 필요합니다. '
    + '전원 준비 → STARTING → 전원 판돈 예약 커밋 후 PLAYING(simulation=false), GAME_CONNECTION_STATE로 본인 상태/조작권 복구. '
    + '시작 시 즉시 차감하지 않고 종료 정산 때 예약 해제·차감·승자 지급을 확정합니다. 실제 DB 처리는 별도입니다. '
    + '미확정이면07로 같은 시도를 조회하고 새 예약을 요청하지 않습니다. 개발 rehearsal과 동시 사용 금지. '
    + '기본 서버는 시작 옵션을 끈 상태이며 실제 DB Gateway가 없으므로 옵션만 켜서 성공하지 않습니다. '
    + '토큰/접속권 원문은 공유·동기화하지 마세요.', [
        message('01 광장 입장', 'CHANNEL_JOIN', { channelId: '{{channelIdA}}' }),
        message('02 착석', 'TABLE_JOIN', { tableId: '{{tableIdA}}' }),
        message('03 첫 착석자 게임 선택', 'GAME_SELECT', { gameCode: 'OMOK' }),
        message('04 준비', 'READY_SET', { ready: true }),
        message('05 퇴장', 'TABLE_LEAVE'),
        message('06 복귀 상태 재조회', 'GAME_RECONNECT_CHECK'),
        message('07 동일 시작 시도 결과 조회', 'GAME_START_CHECK'),
        message('08 확정 경기 상태 조회', 'GAME_STATE_CHECK', {gameId: '{{gameId}}'})]),
    url: '{{wsUrl}}?ticket={{websocketTicket}}' });
const guide = '현재 코드의 local 통신 검증용. 서버는 local,visual-test로 실행하고 OnTop Local 환경을 선택하세요. '
    + '인증 시작 연결부와 엔진은 선택 활성화하며 실제 DB 차감·정산 통합 검증은 별도입니다. HTTP 테이블 조회로 ID 저장 후 WebSocket을 연결합니다. '
    + '웹에서 저장한 컬렉션은 동일 계정·워크스페이스 앱에서 사용하며 로컬 테스트는 Desktop App에서 실행하세요.';
const rankingDescription = 'RANK-01 · GET /api/v1/rankings?limit=20 (1~100). 기존 Access JWT와 db 프로필이 필요합니다. '
    + '예약금을 포함한 전체 balance 내림차순, 동점 RANK(1,1,3)·userId 오름차순. 최대 limit명이며 TOP 밖 본인도 myRank로 반환합니다. '
    + '탈퇴·지갑 미생성 회원 제외, 본인 지갑 미생성 시 myRank=null. updatedAt은 조회 시각, 모든 응답 no-store. '
    + '신규 SQL·지급·예약·지갑 생성 없음. 로컬 구현과 실제 개발 서버 배포는 별개입니다. baseUrl과 accessToken은 개인 환경에만 설정하세요.';
const rankingSuccess = http('30 보유 엽전 랭킹·본인 순위', '/api/v1/rankings?limit=20', 200,
    rankingDescription, `pm.test('랭킹 응답·최대 인원·정렬', () => {
    const body = pm.response.json();
    pm.expect(body).to.have.all.keys('items', 'myRank', 'updatedAt');
    pm.expect(body.items).to.be.an('array');
    pm.expect(body.items.length).to.be.at.most(20);
    pm.expect(Number.isNaN(Date.parse(body.updatedAt))).to.eql(false);
    body.items.forEach((item, index) => {
        pm.expect(item).to.have.all.keys('rank', 'userId', 'nickname', 'coinBalance');
        pm.expect(item.userId).to.be.a('string');
        pm.expect(item.rank).to.be.at.least(1);
        if (index > 0) {
            const previous = body.items[index - 1];
            pm.expect(previous.coinBalance).to.be.at.least(item.coinBalance);
            if (previous.coinBalance === item.coinBalance) pm.expect(item.rank).to.eql(previous.rank);
        }
    });
    pm.expect(pm.response.headers.get('Cache-Control')).to.include('no-store');
});`);
const rankingInvalid = http('31 랭킹 limit 범위 오류', '/api/v1/rankings?limit=101', 400,
    rankingDescription, codeTest('INVALID_LIMIT'));
const rankingAnonymous = http('32 랭킹 미인증 거부', '/api/v1/rankings', 401,
    'Authorization 없이 호출해 기존 REST 인증 거부를 확인합니다.', codeTest('AUTH_AUTHENTICATION_REQUIRED'));
for (const request of [rankingSuccess, rankingInvalid]) {
    request.headers = [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }];
}
httpItems.push(rankingSuccess, rankingInvalid, rankingAnonymous);
const httpV3 = { name: 'OnTop HTTP', $kind: 'collection', description: guide, items: httpItems };
const wsGuide = '# 근거리 채팅·관전 테스트 (20m)\n\n'
    + [0, 1, 2, 5].map(index => `## ${String(index + 1).padStart(2, '0')} 연결\n${wsItems[index].description
        .replaceAll('~', '\\~').replaceAll('[', '\\[').replaceAll(']', '\\]')
        .replace(' 오목은 15×15', '\n\n오목은 15×15')
        .replace(' publicState에는', '\n\npublicState에는')
        .replace(' 09/10은', '\n\n09/10은')}`).join('\n\n')
    + '\n\n서버 테이블 좌표가 미설정이면 관전 성공 대신 범위 오류가 정상입니다. 실제 맵 좌표를 임의로 정하지 않습니다. '
    + `기존 연결 ${wsItems.length}개와 저장 메시지 ${wsItems.reduce((sum, item) => sum + item.messages.length, 0)}개를 사용합니다.`
    + '\n\n2026-10-22: 첫 착석자가 GAME_SELECT의 DICE targetScore를2000/4000/6000 중 선택합니다. 누락 GAME_OPTIONS_REQUIRED, 잘못된 값 INVALID_PAYLOAD이며 목표 변경도 전원 준비를 해제합니다. TABLE_STATE/TABLE_WATCH_STATE/HTTP12 요약에 targetScore가 추가되고 다른 게임은null입니다. '
    + '실제 종료 후 좌석 유지·ready=false·SETTLING, 현재 경기 전체 SETTLED 확인 후 WAITING에서 다시 전원 준비하면 새 시도·경기ID로 시작합니다. 정산 알림 누락은 GAME_RESULT_CHECK 재조회로 복구하며 조회는 지급을 실행하지 않습니다. 실제 DB 잔액·원장·정산·운영 적용은 별도 통합 검증입니다.';
const appearanceGuide = '\n\n2026-10-22 의상 동기화: local,db 또는 dev,db + ontop.shop.enabled=true(dev: SHOP_ENABLED=true). WS07의 인증 사용자 두 명이 같은 채널에 CHANNEL_JOIN 후 본인이 HTTP17로 장착하면 WORLD_STATE.payload.avatars[].equipment가 갱신됩니다. 다른 채널에는 전파하지 않습니다. 새 티켓→재접속→CHANNEL_JOIN 후 최신 장착을 복구합니다. 공개 필드는 itemId/itemCode/equipSlot/imageKey, 최대5개·부위당 하나이며 null은 미조회/사용 불가로 기존 외형 유지, []는 장착 없음입니다. 이동 tick은 캐시를 쓰고 조회 실패는 기존 외형을 유지합니다. 실제 3D 에셋 매핑·렌더링 연동은 별도 협의입니다. 예시: {"requestId":null,"type":"WORLD_STATE","payload":{"channelId":"channel-1","version":4,"avatars":[{"userId":"101","position":{"lastInputSeq":0,"x":-2.025,"y":0.84,"z":34,"yaw":0,"moving":false,"running":false,"swimming":false},"equipment":[{"itemId":1,"itemCode":"RED_TOP","equipSlot":"TOP","imageKey":"demo-red-top"}]}],"mapVersion":"544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0"}}';
const publicProfileGuide = '\n\n2026-10-24 공개 프로필: db 프로필의 인증 사용자로 채널 입장하면 '
    + 'WORLD_STATE.avatars[].nickname/characterGender가 비동기 갱신됩니다. characterGender는 MALE/FEMALE 캐릭터 외형이며 실제 성별이 아닙니다. '
    + '최초 미조회·DB 없는 사용자에는 null이며 기존 표시를 지우지 않습니다. 접속 중 회원은 5초마다 일괄 조회하므로 '
    + 'HTTP PATCH /api/v1/users/me로 닉네임 변경 후 다음 조회 완료 때 같은 채널에 반영됩니다. 재접속은 새 티켓→CHANNEL_JOIN. '
    + '다른 채널 미노출·클라이언트 프로필 주입 거절·조회 장애 시 기존 값 유지를 확인하세요. 기존 equipment/위치 계약은 유지합니다. '
    + '감정표현 5종은 WAVE/CLAP/APPLAUSE_REQUEST/TSK/FART, 손 인사/박수 5초·나머지 1.8초입니다. 가만히 서 있을 때만 허용하며 이동·점프 중 공중 상태·수영·테이블(대기 포함)·시설 중은 EMOTE_ACTIVITY_CONFLICT, 기존 경기 복구 게이트는 GAME_RECOVERY_REQUIRED입니다. '
    + '승인 후 새 이동/점프·착석·시설 이용은 WORLD_EMOTE_CANCELLED(requestId=null)를 같은 채널에 전송합니다. payload는 eventId/emoteEventId/channelId/userId/reason/sentAt이며 reason은 MOVEMENT/ACTIVITY_STARTED/CHANNEL_LEFT/DISCONNECTED입니다. '
    + '프론트는 현재 채널/사용자/재생 원본 eventId와 emoteEventId가 일치할 때만 취소하며 중복·늦은 취소·이미 끝난 표현은 무시합니다. 취소/채널 이동으로 사용 간격은 초기화되지 않습니다. 새 REST나 클라이언트 취소 요청은 없으며 취소 알림 수신은 FE 연결이 필요합니다. '
    + 'FE park-bindings.emotes 매핑·3D 렌더링·배포 확인은 별도입니다.';
wsItems[6].description += appearanceGuide + publicProfileGuide;
const facilityGuide = '\n\n## 시설 이용·점유 동기화 (2026-10-25)\n\n'
    + 'CHANNEL_JOIN 후 시설01 CATALOG(10개씩 nextOffset, -1종료)→시설02 CHECK(입장·재접속 필수)→시설03/04 USE→시설05 AIM(망원경만)→시설06 RELEASE. '
    + '벤치80개×2석, 운동기구12대·망원경2대×1명. 같은 채널 WORLD_FACILITY_STATE.occupancies 전체 상태와 version을 사용합니다. '
    + '본인 leaseId를 로컬 facilityLeaseId 변수에 복사하거나05/06 JSON에 직접 넣으세요. 이전 이용 ID·다른 사용자 ID는 거절합니다. '
    + '2026-10-25 사용자 확정: 서버 승인 위치 기준 벤치/기구3m·망원경2m, 높이+0.8m±0.7m, 단절 즉시 해제 후 재접속 재이용. 100ms/pitch범위는 현재 FE 설정입니다. 시설 이용 중 일반 감정표현은 금지하며 이용 승인 시 기존 표현을 취소합니다. '
    + '이용 중 이동/점프/테이블 착석은 FACILITY_BUSY. 하차 승인 후 WORLD_STATE 위치에서 이동합니다. '
    + '망원경 yaw[-π,π],pitch[-1.35,1.15],seq1~4294967295,100ms 간격. 과거seq는 본인 ACK만, 확대/FOV는FE. '
    + '단절/채널퇴장 즉시 해제, 재접속 CHECK 후 재이용하며 경기30초유예는 그대로입니다. '
    + '위치 주입 API는 없습니다. Postman에서 원거리 USE 오류는 정상이며 성공 검수는 실제 이동 후 요청하세요. '
    + '단일 JVM 메모리 점유, 다중 서버·실제 FE 모션·운영 적용은 별도 검수입니다. docs/world-facility-api.md.';
const wsV3 = { name: 'OnTop WebSocket', $kind: 'collection', description: wsGuide + appearanceGuide + publicProfileGuide
        + facilityGuide,
    items: wsItems };
const httpV21 = {
    info: { name: httpV3.name, description: guide, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: httpItems.map(item => ({
        name: item.name,
        request: { method: item.method, url: item.url, description: item.description, auth: { type: 'noauth' },
            ...(item.headers ? { header: item.headers } : {}), ...(item.body ? {body:item.body} : {}) },
        event: item.scripts.map(script => ({ listen: script.type === 'beforeRequest' ? 'prerequest' : 'test',
            script: { type: 'text/javascript', exec: script.code.split('\n') } }))
    }))
};
const environment = { name: 'OnTop Local', values: Object.entries(variables)
    .map(([key, value]) => ({ key, value, enabled: true, type: 'default' })), _postman_variable_scope: 'environment' };

// JSON 스칼라를 사용한 YAML 1.2. 외부 패키지 설치 없이 생성한다.
function yaml(value, indent = 0) {
    const padding = ' '.repeat(indent);
    const nested = item => item && typeof item === 'object' && Object.keys(item).length > 0;
    if (Array.isArray(value)) {
        return value.map(item => padding + '-' + (nested(item) ? '\n' + yaml(item, indent + 2) : ' ' + JSON.stringify(item))).join('\n');
    }
    return Object.entries(value).map(([key, item]) => padding + JSON.stringify(key) + ':'
        + (nested(item) ? '\n' + yaml(item, indent + 2) : ' ' + JSON.stringify(item))).join('\n');
}
const outputs = new Map([
    ['OnTop-Ranking.postman_collection.json', JSON.stringify({info:{...httpV21.info,name:'OnTop Ranking',description:rankingDescription},item:httpV21.item.slice(-3)},null,2)+'\n'],
    ['OnTop-Minigame.postman_collection.json', JSON.stringify({info:{...httpV21.info,name:'OnTop Minigame',description:'붕어빵 v2: 23시작화면조회→19시작→60초 플레이→21입력 검증·보상. 20본인판조회,22포기는 별도 새 판에서 확인. 15점당1냥·KST 하루100냥·랭킹 제외·탭 이동 시간 진행. 기존 API 경로 유지. docs/minigame-api.md.'},item:httpV21.item.slice(18,23)},null,2)+'\n'],
    ['OnTop-Shop.postman_collection.json', JSON.stringify({info: {...httpV21.info, name: 'OnTop Shop',
        description: 'SHOP-01/02 · INVENTORY-01/02. 13목록→14구매→15동일키 재요청→16보유→17장착. 18은 같은키 충돌 검사. local,db 또는 dev,db + ontop.shop.enabled=true(dev: SHOP_ENABLED=true) + 공통/상점 스키마가 필요합니다. dev는 기본 비활성이며 기존 V100 적용 이력·버전 순서 확인 후 기존 Flyway locations에 db/shop을 명시적으로 추가합니다. 공유 DB/SQL/이력은 자동 변경하지 않습니다. 실제 배포 후 개인 환경 baseUrl=https://dev-api.on-top.world와 해당 서버 Access JWT를 사용합니다. 기존 예제 Origin={{baseUrl}}는 개발 API 호스트가 되어403일 수 있으므로 AUTH_ALLOWED_ORIGINS에 등록된 실제 프론트 주소로 바꾸거나 비브라우저 Postman에서는 Origin 헤더를 제외하세요. 보유 의상 재구매는 서버에서 거절하고 소비형은 수량을 누적합니다. 테스트 계정의 개인 로컬 Access JWT만 사용하고 공유하지 마세요. 기본 DB에 스키마를 자동 적용하지 않았습니다. 실제 DB 초기화·공통 재화 통합·3D 외형 계약은 별도 확인합니다.\n\n2026-10-22: 상점 저장 처리를 JPA 엔티티·JPQL로 전환했습니다. 기존 6개 요청·응답·중복 구매 방지·롤백 계약은 그대로이며 예제 수정 없이 사용할 수 있습니다.' + appearanceGuide},
        item: httpV21.item.slice(12,18)}, null, 2) + '\n'],
    ['OnTop-HTTP.postman_collection.json', JSON.stringify(httpV21, null, 2) + '\n'],
    ['OnTop-Feedback.postman_collection.json', JSON.stringify({info:{...httpV21.info,name:'OnTop Feedback',
        description:feedbackDescription + ' 환경 accessToken/channelIdA/baseUrl 사용. 24는 새 접수 키,25는 원래 키 복구,26은 관리자 JWT로 조회. 실제 비밀키·토큰은 파일에 포함하지 않습니다.'},item:httpV21.item.slice(23,26)},null,2)+'\n'],
    ['OnTop-Notes.postman_collection.json', JSON.stringify({info:{...httpV21.info,name:'OnTop Notes',description:notesDescription},item:httpV21.item.slice(26,29)},null,2)+'\n'],
    ['OnTop-WebSocket.postman_collection.json', JSON.stringify(wsV3, null, 2) + '\n'],
    ['OnTop-Local.postman_environment.json', JSON.stringify(environment, null, 2) + '\n']
]);
for (const collection of [httpV3, wsV3]) {
    const { items, ...definition } = collection;
    const base = `collections/${collection.name}`;
    outputs.set(`${base}/.resources/definition.yaml`, yaml(definition) + '\n');
    items.forEach((item, index) => outputs.set(`${base}/${String(index + 1).padStart(2, '0')}.request.yaml`, yaml(item) + '\n'));
}
for (const [relative, content] of outputs) {
    const file = path.join(root, relative);
    if (checkOnly) {
        if (await readFile(file, 'utf8') !== content) throw new Error(`생성 결과 불일치: ${relative}`);
    } else {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content, 'utf8');
    }
}
console.log(`${checkOnly ? '검사' : '생성'}: ${httpItems.length} HTTP / ${wsItems.length} WebSocket 연결 / `
    + `${wsItems.reduce((count, item) => count + item.messages.length, 0)} 저장 메시지 / ${outputs.size} 파일`);
