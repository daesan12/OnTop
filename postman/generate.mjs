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
    gameId: 'replace-with-real-game-id'
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
    http('05 채널 목록 — 현재는 인증 오류가 정상', '/api/v1/channels', 401,
        '실제 로그인 코드가 없어 현재는 401 UNAUTHENTICATED가 정상입니다. 임의 userId·테스트 인증 헤더를 넣지 않습니다.',
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

const message = (name, type, payload = {}) => ({
    name, $kind: 'websocket-message', contentType: 'json',
    content: JSON.stringify({ requestId: '{{$guid}}', type, payload }, null, 2)
});
const joinA = () => message('01 광장 A 입장 → CHANNEL_STATE + WORLD_STATE', 'CHANNEL_JOIN', { channelId: '{{channelIdA}}' });
const sitA = () => message('05 A 테이블 착석 → TABLE_STATE', 'TABLE_JOIN', { tableId: '{{tableIdA}}' });
const ready = flag => message(flag ? '07 준비 → TABLE_STATE' : '추가 준비 취소 → TABLE_STATE', 'READY_SET', { ready: flag });
const leave = () => message('추가 테이블 퇴장 → TABLE_LEFT', 'TABLE_LEAVE');
const channelLeave = () => message('추가 광장 퇴장 → CHANNEL_LEFT (착석 중이면 먼저 테이블 퇴장)', 'CHANNEL_LEAVE');
const select = code => message(code === 'OMOK' ? '06 첫 착석자 오목 선택 → TABLE_STATE'
    : `추가 첫 착석자 ${code} 선택 (전원 준비 초기화)`, 'GAME_SELECT', { gameCode: code });
const primaryMessages = [
    joinA(),
    message('02 위치 이동 0 → WORLD_STATE (미착석)', 'WORLD_MOVE', { sequence: 0, x: 1.5, y: 0, z: -2, yaw: 0.5 }),
    message('추가 위치 이동 1 → WORLD_STATE (100ms 후·미착석)', 'WORLD_MOVE', { sequence: 1, x: 3, y: 0, z: -1, yaw: 1 }),
    message('03 채팅 → WORLD_CHAT_MESSAGE (1초 간격)', 'WORLD_CHAT_SEND', { text: '안녕! Postman으로 테스트 중이야 👋' }),
    message('04 손흔들기 예시 → WORLD_EMOTE_EVENT (1초 간격)', 'WORLD_EMOTE_SEND', { emoteCode: 'WAVE' }),
    sitA(), select('OMOK'), ready(true), ready(false), leave(), channelLeave(),
    message('추가 광장 B 입장 (A 퇴장 후)', 'CHANNEL_JOIN', { channelId: '{{channelIdB}}' }),
    message('추가 박수 예시 → WORLD_EMOTE_EVENT', 'WORLD_EMOTE_SEND', { emoteCode: 'CLAP' }),
    select('DICE'), select('ONE_CARD'), select('LIAR_BRIDGE'),
    message('오류 미등록 감정표현 → EMOTE_NOT_SUPPORTED', 'WORLD_EMOTE_SEND', { emoteCode: 'NOT_REGISTERED' }),
    message('오류 없는 테이블 → TABLE_NOT_FOUND', 'TABLE_JOIN', { tableId: 'not-a-table' }),
    message('오류 사용자 위조 필드 → INVALID_PAYLOAD', 'WORLD_CHAT_SEND', { text: '위조 거절 확인', userId: 'someone-else' }),
    message('오류 미구현 PING JSON → UNSUPPORTED_MESSAGE_TYPE', 'PING'),
    message('연동 전 경기 복구 조회 → dev에서는 RECOVERY_NOT_AVAILABLE', 'GAME_RECONNECT_CHECK'),
    message('연동 전 경기 상태 조회 → dev에서는 GAME_STATE_AUTH_REQUIRED', 'GAME_STATE_CHECK', { gameId: '{{gameId}}' }),
    message('연동 전 시작 조회 → 기본 모드는 UNSUPPORTED_MESSAGE_TYPE', 'GAME_START_CHECK')
];
const wsRequest = (name, description, messages) => ({
    name, $kind: 'websocket-request', url: '{{wsUrl}}',
    description,
    headers: [{ key: 'Origin', value: '{{baseUrl}}', description: '서버와 같은 출처. CORS/Origin 허용 범위를 넓히지 않습니다.' }],
    settings: { handshakeTimeout: 10000, retryCount: 0, maxPayload: 1048576 },
    messages
});
const wsItems = [
    wsRequest('01 참가자 A — 먼저 착석하는 사람',
        'Connect 한 번 후 CONNECTED를 확인하고 Saved Messages에서 보냅니다. 메시지마다 새 연결을 만들면 다른 임시 사용자가 됩니다. '
        + '기본 흐름: A/B 모두 광장 입장 → A 먼저 착석 → B 착석 → A 게임 선택 → A/B 준비. '
        + '나머지 추가/오류 메시지는 각 선행조건을 맞춘 뒤 따로 보냅니다. WAVE/CLAP은 최종 모션 종류가 아닌 예시입니다.',
        primaryMessages),
    wsRequest('02 참가자 B — 두 번째 착석하는 사람',
        'A와 별개 연결입니다. A가 먼저 앉은 다음 05 착석을 보내고, A 게임 선택 후 07 준비를 보냅니다. '
        + 'A의 상태 변경도 requestId=null 알림으로 들어옵니다. 원카드/거짓말은 2~4명이며 추가 탭으로 다른 임시 사용자를 만들 수 있습니다.',
        [joinA(), sitA(), ready(true), ready(false), leave(), channelLeave(),
            message('추가 채팅', 'WORLD_CHAT_SEND', { text: 'B도 접속했어!' }),
            message('다른 채널 격리 확인 — B 광장으로 (현재 채널 퇴장 후)', 'CHANNEL_JOIN', { channelId: '{{channelIdB}}' }),
            message('다른 채널 B 테이블 착석', 'TABLE_JOIN', { tableId: '{{tableIdB}}' }),
            message('오류 선택권 없음 — A가 먼저 앉았을 때만', 'GAME_SELECT', { gameCode: 'DICE' })]),
    wsRequest('03 관전자 C — 공개 대기 상태 보기',
        '광장 A 입장 후 TABLE_WATCH를 보냅니다. TABLE_WATCH_STATE를 받으며 좌석·준비 인원은 늘지 않습니다. '
        + '실제 경기 관전 권한이나 원카드 손패 구독이 아닙니다. 착석 성공 시 구독은 자동 종료됩니다.',
        [joinA(), message('02 테이블 보기 → TABLE_WATCH_STATE', 'TABLE_WATCH', { tableId: '{{tableIdA}}' }),
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
        + '실제 로그인·GameActionGateway·GameStateGateway 연동 후 gameId를 실제 경기 ID로 바꿉니다. '
        + '입력의 expectedVersion=0과 input은 형식 예시이므로 최신 GAME_STATE의 버전과 게임별 확정 입력으로 수정하세요. '
        + 'actionId는 같은 행동 재확인에만 재사용하고 새 행동은 새 ID를 사용합니다. '
        + '참가자는 복구 후 입력 성공 시 본인 공개/개인 GAME_STATE를 자동 수신합니다. '
        + '관전자는 GAME_WATCH 성공 후 빈 privateState의 GAME_STATE만 수신하며 GAME_UNWATCH로 해제합니다. '
        + '최초 응답은 원래 requestId, 자동 알림은 null입니다. 이 연결은 아직 경기 성공 시연용이 아닙니다.',
        [message('01 경기 상태 조회 → dev: GAME_STATE_AUTH_REQUIRED', 'GAME_STATE_CHECK', { gameId: '{{gameId}}' }),
            message('02 경기 입력 → dev: GAME_ACTION_AUTH_REQUIRED', 'GAME_ACTION_SEND',
                { gameId: '{{gameId}}', actionId: 'example-action-1', expectedVersion: 0, input: { x: 3 } }),
            message('03 경기 관전 → dev: GAME_STATE_AUTH_REQUIRED', 'GAME_WATCH', { gameId: '{{gameId}}' }),
            message('04 경기 관전 종료 → 미구독: GAME_NOT_WATCHING', 'GAME_UNWATCH'),
            message('05 오류 관전 사용자 위조 → INVALID_PAYLOAD', 'GAME_WATCH', { gameId: '{{gameId}}', userId: 101 }),
            message('06 오류 음수 경기 버전 → INVALID_PAYLOAD', 'GAME_ACTION_SEND',
                  { gameId: '{{gameId}}', actionId: 'example-action-2', expectedVersion: -1, input: {} }),
            message('07 본인 종료·정산 결과 조회 → dev: GAME_RESULT_AUTH_REQUIRED', 'GAME_RESULT_CHECK',
                  { gameSessionId: '{{gameId}}' }),
            message('08 오류 정산 금액 지정 → INVALID_PAYLOAD', 'GAME_RESULT_CHECK',
                  { gameSessionId: '{{gameId}}', myCoinDelta: 100 })])
];
const guide = '현재 코드의 local 통신 검증용. 서버는 local,visual-test로 실행하고 OnTop Local 환경을 선택하세요. '
    + '로그인·DB·실제 경기 엔진은 아직 없습니다. HTTP 테이블 조회로 ID 저장 후 WebSocket을 연결합니다. '
    + '웹에서 저장한 컬렉션은 동일 계정·워크스페이스 앱에서 사용하며 로컬 테스트는 Desktop App에서 실행하세요.';
const httpV3 = { name: 'OnTop HTTP', $kind: 'collection', description: guide, items: httpItems };
const wsV3 = { name: 'OnTop WebSocket', $kind: 'collection', description: guide, items: wsItems };
const httpV21 = {
    info: { name: httpV3.name, description: guide, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: httpItems.map(item => ({
        name: item.name,
        request: { method: item.method, url: item.url, description: item.description, auth: { type: 'noauth' } },
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
    ['OnTop-HTTP.postman_collection.json', JSON.stringify(httpV21, null, 2) + '\n'],
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
