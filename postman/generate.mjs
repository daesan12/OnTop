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
const movementGuide = 'WORLD_MOVE는 {seq,dx,dz,run,jump?} 입력만 허용합니다. seq1~4294967295, dx/dz 각[-1,1] 대각선 정규화, run필수 boolean/jump선택. 서버30Hz·변화100ms동기화·입력50ms·250ms만료. 걷기6.25/달리기9/점프6.2/중력-18/단차0.22. 채널 입장 시 서버 스폰(캡슐 중심), lastInputSeq는 수락순번, mapVersion 대조. 기존 sequence/x/y/z/yaw 주입은 INVALID_PAYLOAD. 재접속30초·채팅/관전20m 유지. ';
const joinA = () => message('01 광장 A 입장 → CHANNEL_STATE + WORLD_STATE', 'CHANNEL_JOIN', { channelId: '{{channelIdA}}' });
const locate = () => message('이동 입력 → WORLD_STATE (채널 입장 시 서버 스폰)',
    'WORLD_MOVE', { seq: 1, dx: 0, dz: -1, run: false, jump: false });
const sitA = () => message('05 A 테이블 착석 → TABLE_STATE', 'TABLE_JOIN', { tableId: '{{tableIdA}}' });
const ready = flag => message(flag ? '07 준비 → TABLE_STATE' : '추가 준비 취소 → TABLE_STATE', 'READY_SET', { ready: flag });
const leave = () => message('추가 테이블 퇴장 → TABLE_LEFT', 'TABLE_LEAVE');
const channelLeave = () => message('추가 광장 퇴장 → CHANNEL_LEFT (착석 중이면 먼저 테이블 퇴장)', 'CHANNEL_LEAVE');
const select = code => message(code === 'OMOK' ? '06 첫 착석자 오목 선택 → TABLE_STATE'
    : `추가 첫 착석자 ${code} 선택 (전원 준비 초기화)`, 'GAME_SELECT', { gameCode: code });
const primaryMessages = [
    joinA(),
    message('02 걷기 입력 seq1 → WORLD_STATE (미착석)', 'WORLD_MOVE', { seq: 1, dx: 0, dz: -1, run: false, jump: false }),
    message('추가 달리기 입력 seq2 → WORLD_STATE (50ms 후·미착석)', 'WORLD_MOVE', { seq: 2, dx: 0, dz: -1, run: true, jump: false }),
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
        + '나머지 추가/오류 메시지는 각 선행조건을 맞춘 뒤 따로 보냅니다. WAVE/CLAP은 최종 모션 종류가 아닌 예시입니다.',
        primaryMessages),
    wsRequest('02 참가자 B — 두 번째 착석하는 사람',
        'A와 별개 연결입니다. A가 먼저 앉은 다음 05 착석을 보내고, A 게임 선택 후 07 준비를 보냅니다. '
        + '채팅 전에는 A/B 모두 방향 입력가 필요합니다. 근거리 검사는 XZ 평면 20m이며 경계도 포함합니다. '
        + '거리 예제는 A가 첫 위치(1.5,-2)를 유지하고 양쪽 미착석일 때 사용합니다. B 경계/밖/복귀 순서대로 이동하고 각 단계에서 A가 채팅을 보냅니다. 경계·복귀에서는 B 수신, 밖에서는 미수신이 정상입니다. 이동은 100ms·채팅은 1초 이상 간격입니다. '
        + 'A의 상태 변경도 requestId=null 알림으로 들어옵니다. 원카드/거짓말은 2~4명이며 추가 탭으로 다른 임시 사용자를 만들 수 있습니다.',
        [joinA(), locate(), sitA(), ready(true), ready(false), leave(), channelLeave(),
            message('이동 1 — seq2 걷기 (50ms 후, 수신한 서버 좌표 확인)', 'WORLD_MOVE', { seq: 2, dx: 0, dz: -1, run: false, jump: false }),
            message('이동 2 — seq3 점프 (50ms 후)', 'WORLD_MOVE', { seq: 3, dx: 0, dz: -1, run: false, jump: true }),
            message('이동 3 — seq4 정지 (50ms 후)', 'WORLD_MOVE', { seq: 4, dx: 0, dz: 0, run: false, jump: false }),
            message('추가 채팅', 'WORLD_CHAT_SEND', { text: 'B도 접속했어!' }),
            message('다른 채널 격리 확인 — B 광장으로 (현재 채널 퇴장 후)', 'CHANNEL_JOIN', { channelId: '{{channelIdB}}' }),
            message('다른 채널 B 테이블 착석', 'TABLE_JOIN', { tableId: '{{tableIdB}}' }),
            message('오류 선택권 없음 — A가 먼저 앉았을 때만', 'GAME_SELECT', { gameCode: 'DICE' })]),
    wsRequest('03 관전자 C — 공개 대기 상태 보기',
        '광장 A 입장·서버 스폰 확인 후 TABLE_WATCH를 보냅니다. 서버 테이블 좌표가 설정되어 있고 중심 20m 이내여야 합니다. 미설정/범위 밖은 TABLE_OUT_OF_RANGE입니다. TABLE_WATCH_STATE를 받으며 좌석·준비 인원은 늘지 않습니다. '
        + 'x/z는 1단위=1m인 서버 판정 위치입니다. 방향 입력을 반복해 실제 테이블 중심에 접근합니다. 거리 초과 이동 시 TABLE_WATCH_LEFT로 종료하고 다시 가까워져도 자동 재구독하지 않습니다. '
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
                  { gameId: '{{gameId}}', actionId: 'dice-roll-1', expectedVersion: 0, input: { kind: 'roll', selectedIds: [] } })])
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
const guide = '현재 코드의 local 통신 검증용. 서버는 local,visual-test로 실행하고 OnTop Local 환경을 선택하세요. '
    + '실제 오목 엔진은 선택적으로 켤 수 있으며 로그인·시작 차감·DB 정산은 미연결입니다. HTTP 테이블 조회로 ID 저장 후 WebSocket을 연결합니다. '
    + '웹에서 저장한 컬렉션은 동일 계정·워크스페이스 앱에서 사용하며 로컬 테스트는 Desktop App에서 실행하세요.';
const httpV3 = { name: 'OnTop HTTP', $kind: 'collection', description: guide, items: httpItems };
const wsGuide = '# 근거리 채팅·관전 테스트 (20m)\n\n'
    + [0, 1, 2, 5].map(index => `## ${String(index + 1).padStart(2, '0')} 연결\n${wsItems[index].description
        .replaceAll('~', '\\~').replaceAll('[', '\\[').replaceAll(']', '\\]')
        .replace(' 오목은 15×15', '\n\n오목은 15×15')
        .replace(' publicState에는', '\n\npublicState에는')
        .replace(' 09/10은', '\n\n09/10은')}`).join('\n\n')
    + '\n\n서버 테이블 좌표가 미설정이면 관전 성공 대신 범위 오류가 정상입니다. 실제 맵 좌표를 임의로 정하지 않습니다. '
    + `기존 연결 ${wsItems.length}개와 저장 메시지 ${wsItems.reduce((sum, item) => sum + item.messages.length, 0)}개를 사용합니다.`;
const wsV3 = { name: 'OnTop WebSocket', $kind: 'collection', description: wsGuide, items: wsItems };
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
