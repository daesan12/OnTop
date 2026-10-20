# 🔌 WebSocket API 명세서

**연결 주소** `ws://localhost:8080/ws/tables` · **범위** 연결·광장·테이블 공개 대기 상태·경기 통신 연결부 · **구현 상태** 로컬 통신 검증 완료, 실제 로그인·경기·정산 미연결

기능 이름을 열면 요청·응답 JSON과 처리 규칙을 볼 수 있습니다. 공통 형식·ERD 관계는 [📌 공통 규격](websocket-api/00-common.md)에 정리했습니다.

[연결 생존 확인(heartbeat)](websocket-heartbeat.md)은 WebSocket Ping/Pong 제어 프레임을 사용합니다. 별도 JSON 요청 없이 응답 없는 연결을 정리하고 30초 재접속 처리로 이어집니다.

기본 모드는 아래 명세를 유지합니다. 별도로 켜는 DB 없는 [게임 시작 연동 검증](game-start-rehearsal.md)에는 추가 메시지와 입력 제한이 있습니다. 실제 게임 시작·차감 기능은 아닙니다.

## API 목록

추가 연결부: [경기 통신 상세 7종](websocket-api/09-game-communication.md)에 상태 조회·자동 갱신·입력·관전 요청과 응답을 정리하고 기존 Notion 목록에 반영했습니다. 인증 연결과 경기 담당 Gateway가 필요하며 실제 엔진은 미연결입니다.

| 도메인 | 진행상황 | 방식 | 방향 | 기능 | 메시지 타입 | URL |
| --- | --- | --- | --- | --- | --- | --- |
| 연결 | 로컬 검증 완료 | WS | 서버 → 클라이언트 | [🔗 연결 완료](websocket-api/01-connected.md) | CONNECTED | /ws/tables |
| 경기 복구 | 연결부 검증 완료·엔진 미연결 | WS | 클라이언트 → 서버 | [🔄 경기 복구 조회](game-reconnect.md) | GAME_RECONNECT_CHECK | /ws/tables |
| 경기 복구 | 연결부 검증 완료·엔진 미연결 | WS | 서버 → 클라이언트 | [🎮 경기 연결 상태](game-reconnect.md) | GAME_CONNECTION_STATE | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 클라이언트 → 서버 | [🪑 테이블 착석](websocket-api/02-table-join.md) | TABLE_JOIN | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 클라이언트 → 서버 | [🎮 게임 선택](websocket-api/07-game-select.md) | GAME_SELECT | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 클라이언트 → 서버 | [✅ 준비·준비 취소](websocket-api/03-ready-set.md) | READY_SET | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 서버 → 클라이언트 | [📡 테이블 상태 알림](websocket-api/04-table-state.md) | TABLE_STATE | /ws/tables |
| 테이블 보기 | 로컬 검증 완료·공개 대기 상태만 | WS | 클라이언트 → 서버 | [👀 테이블 보기](websocket-api/08-table-watch.md) | TABLE_WATCH | /ws/tables |
| 테이블 보기 | 로컬 검증 완료·공개 대기 상태만 | WS | 클라이언트 → 서버 | [보기 종료](websocket-api/08-table-watch.md) | TABLE_UNWATCH | /ws/tables |
| 테이블 보기 | 로컬 검증 완료·공개 대기 상태만 | WS | 서버 → 클라이언트 | [보기 상태](websocket-api/08-table-watch.md) | TABLE_WATCH_STATE | /ws/tables |
| 테이블 보기 | 로컬 검증 완료·공개 대기 상태만 | WS | 서버 → 클라이언트 | [보기 종료 알림](websocket-api/08-table-watch.md) | TABLE_WATCH_LEFT | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 클라이언트 → 서버 | [🚪 테이블 퇴장](websocket-api/05-table-leave.md) | TABLE_LEAVE | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 서버 → 클라이언트 | [👋 퇴장 완료](websocket-api/05-table-leave.md) | TABLE_LEFT | /ws/tables |
| 공통 | 로컬 검증 완료 | WS | 서버 → 클라이언트 | [⚠️ 오류 응답](websocket-api/06-error.md) | ERROR | /ws/tables |
| 연결 | 로컬 검증 완료 | 제어 프레임 | 서버 Ping / 클라이언트 Pong | [연결 생존 확인](websocket-heartbeat.md) | Ping / Pong | /ws/tables |
| 시작 검증 | 검증 대역 구현·실제 시작 미연결 | WS | 클라이언트 → 서버 | [시작 결과 확인](game-start-rehearsal.md) | GAME_START_CHECK | /ws/tables |
| 시작 검증 | 검증 대역 구현·실제 시작 미연결 | WS | 서버 → 클라이언트 | [시작 연동 상태](game-start-rehearsal.md) | GAME_START_STATE | /ws/tables |
| 공통 | 실제 연동 전·범위 안내 | 문서 | 해당 없음 | [공통 규격·연결 흐름](websocket-api/00-common.md) | 공통 규격 | /ws/tables |
| 경기 | 연결부 검증 완료·엔진 미연결 | WS | 클라이언트 → 서버 | [경기 상태 조회](websocket-api/09-game-communication.md) | GAME_STATE_CHECK | /ws/tables |
| 경기 | 연결부 검증 완료·엔진 미연결 | WS | 서버 → 클라이언트 | [경기 상태 수신·자동 갱신](websocket-api/09-game-communication.md) | GAME_STATE | /ws/tables |
| 경기 | 연결부 검증 완료·엔진 미연결 | WS | 클라이언트 → 서버 | [경기 입력 전달](websocket-api/09-game-communication.md) | GAME_ACTION_SEND | /ws/tables |
| 경기 | 연결부 검증 완료·엔진 미연결 | WS | 서버 → 클라이언트 | [경기 입력 처리 확인](websocket-api/09-game-communication.md) | GAME_ACTION_RESULT | /ws/tables |
| 경기 | 연결부 검증 완료·엔진 미연결 | WS | 클라이언트 → 서버 | [경기 관전 시작](websocket-api/09-game-communication.md) | GAME_WATCH | /ws/tables |
| 경기 | 연결부 검증 완료·엔진 미연결 | WS | 클라이언트 → 서버 | [경기 관전 종료](websocket-api/09-game-communication.md) | GAME_UNWATCH | /ws/tables |
| 경기 | 연결부 검증 완료·엔진 미연결 | WS | 서버 → 클라이언트 | [경기 관전 종료 알림](websocket-api/09-game-communication.md) | GAME_WATCH_LEFT | /ws/tables |
| 경기 결과 | 연결부 구현·실제 정산 미연결 | WS | 클라이언트 → 서버 | [본인 종료 결과 재조회](game-result-api.md) | GAME_RESULT_CHECK | /ws/tables |
| 경기 결과 | 연결부 구현·실제 정산 미연결 | WS | 서버 → 클라이언트 | [본인 결과·정산 상태](game-result-api.md) | GAME_RESULT | /ws/tables |

채널 입장·퇴장·위치 공유 메시지는 기존 소켓을 재사용합니다. 상세 요청·응답은 [채널 WebSocket 명세](world-websocket-api.md)를 따릅니다. 채널은 서버 설정으로 등록하며 기본 목록은 비어 있습니다. 위치 공유는 local 구현이며 맵·충돌 판정은 미연결입니다. 채널을 설정하면 테이블도 채널별로 분리되며 해당 채널 입장이 필요합니다. 채널 설정 없는 기존 개발 모드는 유지합니다.

| 방향 | 메시지 | 성공 결과 |
| --- | --- | --- |
| 클라이언트 → 서버 | CHANNEL_JOIN | 본인과 같은 채널 참가자에게 CHANNEL_STATE |
| 서버 → 클라이언트 | CHANNEL_STATE | 채널별 인원·참가자 전체 상태 |
| 클라이언트 → 서버 | CHANNEL_LEAVE | 본인 CHANNEL_LEFT, 남은 참가자 CHANNEL_STATE |
| 서버 → 클라이언트 | CHANNEL_LEFT | 명시적 채널 퇴장 완료 |
| 클라이언트 → 서버 | WORLD_MOVE | 본인과 같은 채널 참가자에게 WORLD_STATE |
| 서버 → 클라이언트 | WORLD_STATE | 채널별 최신 보고 위치 전체 상태 |
| 클라이언트 → 서버 | WORLD_CHAT_SEND | 본인과 같은 채널 참가자에게 WORLD_CHAT_MESSAGE |
| 서버 → 클라이언트 | WORLD_CHAT_MESSAGE | 승인된 일반 텍스트 채팅 |
| 클라이언트 → 서버 | WORLD_EMOTE_SEND | 본인과 같은 채널 참가자에게 WORLD_EMOTE_EVENT |
| 서버 → 클라이언트 | WORLD_EMOTE_EVENT | 승인된 감정표현 코드 |

CHANNEL_JOIN 성공·다른 사용자 입퇴장·종료 때는 WORLD_STATE도 알립니다. 위치 미보고 참가자는 position=null이며 채널 인원 버전과 위치 버전은 따로 관리합니다.

채널 채팅은 일반 텍스트 1~200 Unicode 코드포인트·기본 1초 간격입니다. [광장 계약](world-websocket-api.md)의 요청·응답·전달 범위를 따릅니다. 채팅·관전은 기본 20m이며 [거리 설정](world-proximity.md)을 따릅니다. 욕설 판정·메시지 이력은 미구현입니다.

감정표현은 서버 등록 코드만 받는 local 전송 기반입니다. 기본 등록 목록은 비어 있고 `local,visual-test`의 WAVE/CLAP은 검증용입니다. 같은 채널 전달·기본 1초 간격·종료 정리를 제공하며 실제 3D 모션과 AI 분류는 미연결입니다. 상세는 [광장 계약](world-websocket-api.md)을 따릅니다.

## 흐름

**연결 → 채널 입장 → 이동·채팅·감정표현 → 현재 채널 테이블 조회 → 보기 또는 착석 → 첫 착석자의 게임 선택 → 준비 → 전원 준비 표시 → 준비 취소·퇴장**

- CONNECTED로 임시 사용자 ID를 받습니다.
- TABLE_JOIN·GAME_SELECT·READY_SET의 성공 결과는 TABLE_STATE로 받습니다.
- TABLE_LEAVE의 성공 결과는 본인에게 TABLE_LEFT, 남은 참가자에게 TABLE_STATE로 전달합니다.
- 실패하면 요청자에게 ERROR를 반환합니다.
- 전원 준비는 표시만 합니다. 게임 시작·DB 저장·판돈 차감·정산은 이번 범위가 아닙니다.

## Notion에 옮길 때

경기 연결부의 [상태·관전](game-state-api.md), [입력 전달](game-action-api.md) 7개 항목도 반영했습니다. 실제 엔진 연동 완료와 구분하며 새 항목은 진행 중으로 표시합니다.

- 목록에는 짧은 속성만 두고, 긴 request·response JSON은 각 기능 페이지 본문에 넣습니다.
- 해당 실시간 계약 담당자는 장대산이며 Notion 표시명은 **대산 장**입니다. 기존 담당자 속성을 사용합니다.
- HTTP API의 GET·POST 대신 **방식 WS / 방향 / 메시지 타입**을 사용합니다. 연결 이후 기능마다 별도 HTTP URL을 만들지 않습니다.
- 이 파일과 상세 Markdown을 ZIP으로 가져오면 페이지 문서로 사용할 수 있습니다. 이 Markdown 표가 Notion 데이터베이스로 자동 변환되거나 속성이 자동 생성되는 것은 아닙니다.
- 기존 Notion 데이터베이스를 유지할 경우 목록의 각 행을 만들고 해당 상세 내용을 행의 페이지 본문에 넣습니다.

v1.5 · 2026-10-20 · 연결부 기준 코드 a65b217. [기존 Notion WebSocket 데이터베이스](https://app.notion.com/p/3fe161842b8680a1b9b1f557d172c826?v=3fe161842b8680aaa3b3000ce341ce27)의 기존 35개와 속성을 보존하고 종료·정산 결과 2종을 추가해 총 37개로 정리했습니다. 각 행은 기능·메시지·방향·진행상황·도메인·URL·담당자 속성과 상세 본문을 유지합니다. 완료 23개는 해당 로컬 통신 계약의 구현·검증 완료, 진행 중 14개는 경기 복구 2개·시작 검증 2개·공통 안내·경기 통신 7개·종료 결과 2개로 정식 연동 전입니다. 실제 로그인·경기·정산·3D 모션 완료를 뜻하지 않습니다. 감정표현 종류·단축키·모션은 팀/프론트가 정하고 WAVE/CLAP은 테스트 예시입니다. 수동 반영이며 자동 동기화되지 않습니다.

현재 거리 계약: [채팅·관전 기본 20m](world-proximity.md)를 함께 적용합니다. 실제 테이블 좌표는 설정 전이며, 위치·좌표·내부 경기 tableId가 없으면 관전을 허용하지 않습니다. 기존 JSON 형식은 유지합니다.
