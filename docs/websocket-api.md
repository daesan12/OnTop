# 🔌 WebSocket API 명세서

**연결 주소** `ws://localhost:8080/ws/tables` · **범위** 연결·착석·게임 선택·퇴장·준비 동기화 · **구현 상태** 로컬 검증 완료

기능 이름을 열면 요청·응답 JSON과 처리 규칙을 볼 수 있습니다. 공통 형식·ERD 관계는 [📌 공통 규격](websocket-api/00-common.md)에 정리했습니다.

[연결 생존 확인(heartbeat)](websocket-heartbeat.md)은 WebSocket Ping/Pong 제어 프레임을 사용합니다. 별도 JSON 요청 없이 응답 없는 연결을 정리하고 30초 재접속 처리로 이어집니다.

기본 모드는 아래 명세를 유지합니다. 별도로 켜는 DB 없는 [게임 시작 연동 검증](game-start-rehearsal.md)에는 추가 메시지와 입력 제한이 있습니다. 실제 게임 시작·차감 기능은 아닙니다.

## API 목록

| 도메인 | 진행상황 | 방식 | 방향 | 기능 | 메시지 타입 | URL |
| --- | --- | --- | --- | --- | --- | --- |
| 연결 | 로컬 검증 완료 | WS | 서버 → 클라이언트 | [🔗 연결 완료](websocket-api/01-connected.md) | CONNECTED | /ws/tables |
| 경기 복구 | 연결부 검증 완료·엔진 미연결 | WS | 클라이언트 → 서버 | [🔄 경기 복구 조회](game-reconnect.md) | GAME_RECONNECT_CHECK | /ws/tables |
| 경기 복구 | 연결부 검증 완료·엔진 미연결 | WS | 서버 → 클라이언트 | [🎮 경기 연결 상태](game-reconnect.md) | GAME_CONNECTION_STATE | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 클라이언트 → 서버 | [🪑 테이블 착석](websocket-api/02-table-join.md) | TABLE_JOIN | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 클라이언트 → 서버 | [🎮 게임 선택](websocket-api/07-game-select.md) | GAME_SELECT | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 클라이언트 → 서버 | [✅ 준비·준비 취소](websocket-api/03-ready-set.md) | READY_SET | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 서버 → 클라이언트 | [📡 테이블 상태 알림](websocket-api/04-table-state.md) | TABLE_STATE | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 클라이언트 → 서버 | [🚪 테이블 퇴장](websocket-api/05-table-leave.md) | TABLE_LEAVE | /ws/tables |
| 테이블 | 로컬 검증 완료 | WS | 서버 → 클라이언트 | [👋 퇴장 완료](websocket-api/05-table-leave.md) | TABLE_LEFT | /ws/tables |
| 공통 | 로컬 검증 완료 | WS | 서버 → 클라이언트 | [⚠️ 오류 응답](websocket-api/06-error.md) | ERROR | /ws/tables |

## 흐름

**연결 → 착석 → 첫 착석자의 게임 선택 → 준비 → 전원 준비 표시 → 준비 취소·퇴장**

- CONNECTED로 임시 사용자 ID를 받습니다.
- TABLE_JOIN·GAME_SELECT·READY_SET의 성공 결과는 TABLE_STATE로 받습니다.
- TABLE_LEAVE의 성공 결과는 본인에게 TABLE_LEFT, 남은 참가자에게 TABLE_STATE로 전달합니다.
- 실패하면 요청자에게 ERROR를 반환합니다.
- 전원 준비는 표시만 합니다. 게임 시작·DB 저장·판돈 차감·정산은 이번 범위가 아닙니다.

## Notion에 옮길 때

- 목록에는 짧은 속성만 두고, 긴 request·response JSON은 각 기능 페이지 본문에 넣습니다.
- 표에 담당자를 추가할 때 실제 담당자를 선택합니다. 현재 문서는 이름을 임의로 지정하지 않았습니다.
- HTTP API의 GET·POST 대신 **방식 WS / 방향 / 메시지 타입**을 사용합니다. 연결 이후 기능마다 별도 HTTP URL을 만들지 않습니다.
- 이 파일과 상세 Markdown을 ZIP으로 가져오면 페이지 문서로 사용할 수 있습니다. 이 Markdown 표가 Notion 데이터베이스로 자동 변환되거나 속성이 자동 생성되는 것은 아닙니다.
- 기존 Notion 데이터베이스를 유지할 경우 목록의 각 행을 만들고 해당 상세 내용을 행의 페이지 본문에 넣습니다.

v1.2 · 2026-10-20 · Notion의 구현 API와 대조해 인증·복구 알림 조건, 시작 검증의 추가 착석 응답·퇴장 차단, 오류 안내와 게임 선택 사용 예시를 보완했습니다. Notion은 이번 작업에서 수동 반영했으며 자동 동기화되지 않습니다. 실제 로그인·경기·정산은 미연결입니다.
