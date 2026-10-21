# OnTop Postman 테스트

## 처음 한 번

1. 서버 활성 프로필을 **`local,visual-test`**로 설정하고 재실행한다. 기본 포트는 8080이다.
2. 같은 계정으로 **My Workspace**를 연다. 웹에 저장한 **OnTop HTTP**, **OnTop WebSocket**, **OnTop Local**을 사용한다.
3. 오른쪽 위 환경을 **OnTop Local**로 선택한다. 다른 포트라면 환경의 `baseUrl`·`wsUrl`을 함께 바꾼다.

HTTP JSON과 환경 JSON은 웹 Import로 가져오기를 확인했다. **WebSocket v3 JSON은 현재 웹 Import에서 거절되어** 웹에서 직접 등록했다. 2026-10-21 오목 예제를 반영한 웹과 로컬 원본은 연결6개·메시지67개다. 오목 관련 기존 경기 통신 요청의 11개 메시지와 공통 안내를 새로고침 후 대조했다. 기존 B·C 좌표 보고와 B의 좌표 주입 경계 예제는 서버 입력 전환으로 폐기하고, 방향·달리기·점프·정지 예제 7개로 교체했다. 실제 20m 경계는 수신한 서버 위치를 기준으로 확인한다. 앞선 20m 반영 시점에는 당시 전체64개 메시지 JSON을 대조했으며 이번에는 기존5개 연결을 유지하고 경기 통신 예제를 갱신했다. 실행 조건은 **OnTop WebSocket → Overview**의 공통 안내를 먼저 읽는다. 요청별 Docs 설명은 웹에서 저장되지 않아 공통 안내에 모았으며, 공통 안내는 새로고침 후 저장본을 확인했다.

WebSocket JSON과 `postman/collections`의 native YAML은 공식 v3 스키마에 맞춘 원본·백업이다. 공식 로컬 컬렉션 사용 방식은 데스크톱 **Open Folder**이지만, 이 경로의 실제 가져오기는 검증하지 않았다. 웹 Import에 WebSocket JSON을 다시 넣지 않는다.

웹에서 편집한 컬렉션은 **같은 계정·같은 워크스페이스**를 연 데스크톱 앱에서 사용한다. 사용자 PC 조작을 피하기 위해 앱에서 실제 동기화된 화면은 직접 확인하지 않았다. 로컬 서버 호출은 데스크톱 앱에서 실행한다. 웹 Cloud Agent에서 `127.0.0.1` 서버를 호출하는 방식으로 테스트하지 않는다.

## 바로 해볼 순서

| 순서 | 할 일 | 확인 |
| --- | --- | --- |
| 1 | HTTP 01 헬스체크 Send | 200 / UP |
| 2 | HTTP 02 설정, 03·04 테이블 목록 Send | tableIdA·tableIdB가 선택한 환경에 자동 저장됨 |
| 3 | WebSocket 01 참가자 A와 02 참가자 B에서 각각 Connect | 둘 다 CONNECTED, 서로 다른 dev 사용자 |
| 4 | A·B 모두 `01 광장 A 입장` 메시지 Send | CHANNEL_STATE와 WORLD_STATE |
| 5 | A·B 채널 입장·서버 스폰 확인 후 채팅·감정표현 메시지 Send | 채팅은 같은 채널·서버 판정 위치 기준 발신자 반경 20m 이내에서만 수신. 이동은 착석 전에 테스트 |
| 6 | A `05 착석` → B `05 착석` → A `06 오목 선택` | 같은 테이블의 두 좌석·게임 선택 공유 |
| 7 | A·B 모두 `07 준비` | TABLE_STATE.allReady=true. 기본 모드는 실제 경기 시작 안 함 |
| 8 | 준비 취소·테이블 퇴장·광장 퇴장 | 서로 상태 갱신. 광장 퇴장은 착석 해제 후 가능 |

WebSocket 탭 하나가 사용자 하나다. **Connect를 유지한 채 Saved Messages에서 골라 Send**한다. 메시지마다 새 탭을 만들거나 다시 연결하지 않는다. 자동 Run으로 모든 메시지를 순서대로 보내는 묶음이 아니다. 추가·오류 메시지는 이름에 적힌 조건을 맞춰 개별 실행한다.

채팅·감정표현은 각각 1초 간격을 둔다. 이동 입력 `seq`는1부터 증가한다. dx/dz/run/jump만 보내며 서버30Hz 계산·변화100ms 동기화를 따른다. 입력50ms 간격, 250ms 만료이므로 계속 이동하려면 새seq로 반복한다. 예전 입력은 재적용/만료 연장하지 않으며 기존 sequence/x/y/z/yaw는 거절된다. `requestId`의 `{{$guid}}`는 Postman이 매 전송 새 값으로 치환한다.

**20m 채팅 확인:** 서버 스폰 후 미착석 상태에서 방향 입력을 반복해 이동한다. WORLD_STATE의 실제 두 위치로 XZ 거리20m 안/밖을 확인하고 채팅한다. 좌표를 바꿔20m/21m로 순간이동하는 예제는 폐기했다. 19/20/21m의 정확한 경계 검증은 flowTest의 서버 위치 fixture에서 분리한다. 배열 순서대로 전체 메시지를 자동 실행하지 않는다.

## 관전자·끊김·시작 검증

- **03 관전자 C**: Connect → 광장 A 입장 → 서버 위치 확인·이동 → 테이블 보기. 서버 테이블 좌표 설정과 중심 20m 이내가 필요하다. 좌표 미설정/범위 밖이면 TABLE_OUT_OF_RANGE가 정상이다. 성공 시 TABLE_WATCH_STATE를 받지만 좌석/준비 인원은 늘지 않는다. 경기 관전은 별도 GAME_WATCH이며 Gateway 내부 tableId와 기존 인증/자격도 필요하다.
- **채널 격리**: B가 테이블·광장을 퇴장한 뒤 광장 B로 입장한다. A의 이동·채팅·감정표현이 B에게 오지 않아야 한다.
- **대기 중 끊김**: B 탭의 Disconnect를 누르면 A에서 B 좌석/준비/위치·채널 인원이 정리된다. 기본 dev 재연결은 새 사용자이며 이전 좌석 복구가 아니다.
- **heartbeat**: JSON PING을 보내는 기능이 아니다. 서버 Ping에 Postman이 Pong을 처리한다. Disconnect는 정상 종료이므로 heartbeat 무응답 실험과 다르다. 무응답·29/30초 경계 검증은 기존 `backend/gradlew.bat flowTest`가 담당한다.
- **04·05 선택적 시작 검증**: 서버 프로그램 인수에 `--ontop.start-rehearsal.enabled=true`를 추가하고 재실행한다. 이 두 연결에서 A/B 착석 → A 게임 선택 → 전원 준비 → GAME_START_STATE의 CONFIRMED를 본다. 성공 뒤 좌석이 보존되므로 일반 퇴장 테스트와 섞지 않는다. 실제 차감/경기 실행은 없다.

## 아직 성공시킬 수 없는 기능

**06 경기 통신 — 인증·엔진 연동 대기**에는 경기 조회·입력·관전·해제와 잘못된 요청 예시가 있다. 현재 dev 모드에서는 요청 이름에 적힌 오류가 정상이다. dev 결과 조회는 GAME_RESULT_AUTH_REQUIRED가 정상이며 실제 인증+결과 Gateway가 있어야 성공한다. 결과 읽기는 지급을 실행하지 않는다.

오목은 [실제 엔진](../docs/omok.md)을 구현했다. `local`에서 `ontop.games.omok.enabled=true`로 등록하지만 실제 사용자 검증과 참가 확정·차감 커밋 후 서버 내부 경기 생성이 필요하다. 옵션만 켜거나 04/05 시작 검증을 실행해 오목을 시작할 수는 없다. 서버가 부여한 실제 gameId로 바꾸고 같은 인증 연결에서 복구를 마친 뒤 사용한다.

- 02: 흑 첫 수 `(7,7)`, 버전0. 이후 착수는 최신 GAME_STATE.version과 본인 차례에 맞춘다.
- 09: 02 성공 후 같은 사용자·경기·actionId·버전·좌표로 재확인하면 중복 착수 없이 기존 결과.
- 10: 같은 행동 ID에 다른 좌표는 `GAME_ACTION_ACTION_ID_CONFLICT`.
- 11: 복귀 조회. 기존 판·버전·차례·turnDeadline을 그대로 받는다.

판 좌표 x/y는 0~14 정수이며 두 필드만 허용한다. 한 수 30초 시간패·총시간 제한 없음이고 복귀로 마감을 늘리지 않는다. GAME_STATE가 GAME_ACTION_RESULT보다 먼저 올 수 있어 확인은 requestId/actionId, 상태는 version으로 독립 처리한다. 오목 privateState는 참가자·관전자 모두 빈 객체다. FINISHED 상태는 정산 확정이 아니다. 관전은 기존 채널·위치·테이블 중심 20m 조건을 유지한다.

| 요청 | 현재 정상적인 결과 / 필요한 것 |
| --- | --- |
| GET /api/v1/channels | 401 UNAUTHENTICATED. 로그인 Principal 구현 필요 |
| GAME_RECONNECT_CHECK | dev에서는 RECOVERY_NOT_AVAILABLE. 실제 인증 + GameRecoveryGateway 필요 |
| GAME_STATE_CHECK | dev에서는 GAME_STATE_AUTH_REQUIRED. 실제 인증 + GameStateGateway·경기 복구 필요 |
| GAME_ACTION_SEND | dev에서는 GAME_ACTION_AUTH_REQUIRED. 실제 인증 + GameActionGateway·경기 복구 필요 |
| GAME_WATCH | dev에서는 GAME_STATE_AUTH_REQUIRED. 실제 인증 + GameStateGateway 관전 자격 필요 |
| GAME_UNWATCH | 미구독이면 GAME_NOT_WATCHING. 성공은 GAME_WATCH_LEFT |
| GAME_START_CHECK | 기본 모드에서는 UNSUPPORTED_MESSAGE_TYPE. 선택적 시작 검증 모드에서만 사용 |
| 같은 계정 중복 연결·30초 경기 복귀 | dev ID로 재현 불가. 테스트 대역 기반 flowTest에는 포함됨 |

`X-Test-Login`, 임의 Bearer 토큰, userId 헤더를 넣어도 실제 서버 로그인은 되지 않는다. 인증 모드를 켜기만 하면 검증기 미등록으로 503이므로 일반 dev 테스트에서는 켜지 않는다. 오목 규칙·승패는 구현했고 실제 로그인·시작 차감·DB 정산은 별도 연동이다. 성공하는 것처럼 보이는 가짜 요청은 제공하지 않는다.

## 파일 관리

2026-10-21 Postman 웹의 OnTop WebSocket Overview에 렌주 규칙을 반영하고 새로고침 후 저장본을 확인했다. 흑33·44·장목은 `GAME_ACTION_FORBIDDEN_MOVE`로 거절하며 판·버전·차례·턴 마감을 유지한다. 흑 정확한5목/백5개이상 승리와 같은 수의 정확한5목 우선 규칙을 안내한다. 기존 연결6개·저장 메시지67개의 JSON은 변경하지 않았다.

`generate.mjs`가 요청 데이터 원본이다. Node.js로 `node postman/generate.mjs`를 실행하면 JSON 내보내기와 native YAML을 함께 갱신한다. `node postman/generate.mjs --check`는 파일을 바꾸지 않고 생성 결과를 대조한다. 생성 파일을 직접 바꾼 뒤 재생성하면 덮어써지므로 원본을 먼저 수정한다. 계정 정보·토큰은 파일에 넣지 않는다.

공식 형식: [Postman v3 스키마](https://schema.postman.com/collection/json/v3.0.0/draft-07/collection.json), [로컬 컬렉션 구조](https://learning.postman.com/docs/use/native-git/setup).

거리 설정·제약은 [근거리 채팅·관전](../docs/world-proximity.md)을 따른다. 테이블 좌표는 실제 맵 배치가 확정된 후 서버에 설정한다. 좌표가 없는 현재 설정에서 관전 성공을 기대하지 않는다. 이번 확인은 웹 저장본·예제 계약 대조이며, 실제 서버 전송·데스크톱 동기화·로그인/경기 엔진 연동 검증과 구분한다.

## 서버 입력 이동 전환 · 2026-10-21

웹 기존6연결·67메시지를 유지하고 WORLD_MOVE 예제7개를 seq/dx/dz/run/jump로 교체했다. 걷기·달리기·점프·정지와 서버 스폰/수락 순번/맵 버전·50ms/30Hz/100ms/250ms 조건은 Overview에 안내했다. 새로고침 뒤 예제를 다시 열어 저장된 필드를 대조하고 공통 안내의 저장본도 확인했다. 좌표 순간이동으로20m 경계를 만들던 예제는 폐기했다. 서버가 보낸 위치로 실제 거리를 확인한다.

## 주사위 입력·시간·복구 예제

06 경기 통신의12첫굴림·13재굴림·14Bank·15동일첫굴림재확인을 추가했다. 13/14는고정순차시나리오가아니며최신version·본인차례·공개dice의held=false득점ID로수정한다. 서버내부참가확정후생성한DICE경기와실제인증이필요하며기본dev의인증오류는유지한다. 점수표·30초전체차례·만료시이번턴만소실·관전/복구·정산경계는[주사위계약](../docs/farkle.md)을따른다. 총6연결71메시지. Notion입력/상태/복구 및Postman웹Overview/12~15 저장본을새로고침후대조했다. 실제프론트/DB/지급연동확인을뜻하지않는다.
