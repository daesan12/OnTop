# OnTop Postman 테스트

## 처음 한 번

1. 서버 활성 프로필을 **`local,visual-test`**로 설정하고 재실행한다. 기본 포트는 8080이다.
2. 같은 계정으로 **My Workspace**를 연다. 웹에 저장한 **OnTop HTTP**, **OnTop WebSocket**, **OnTop Local**을 사용한다.
3. 오른쪽 위 환경을 **OnTop Local**로 선택한다. 다른 포트라면 환경의 `baseUrl`·`wsUrl`을 함께 바꾼다.

HTTP JSON과 환경 JSON은 웹 Import로 가져오기를 확인했다. **WebSocket v3 JSON은 현재 웹 Import에서 거절되어** 웹에서 직접 등록했다. 생성 원본과 웹 모두 연결 6개·메시지 57개다. 기존 5개 요청 ID를 보존하고 [06 경기 통신](https://dfd333-5957.postman.co/workspace/My-Workspace~fef8d4dd-529e-48e5-8bde-17f840fd2dd3/ws-raw-request/6ad7466f88a68a951684b2d7?sideView=agentMode)을 추가했다. 2026-10-20 새로고침 후 새 메시지 6개의 JSON·URL·Origin 헤더를 원본과 대조했다. 실행 조건과 기대 오류는 요청명·각 저장 메시지 이름과 이 문서를 따른다.

WebSocket JSON과 `postman/collections`의 native YAML은 공식 v3 스키마에 맞춘 원본·백업이다. 공식 로컬 컬렉션 사용 방식은 데스크톱 **Open Folder**이지만, 이 경로의 실제 가져오기는 검증하지 않았다. 웹 Import에 WebSocket JSON을 다시 넣지 않는다.

웹에서 편집한 컬렉션은 **같은 계정·같은 워크스페이스**를 연 데스크톱 앱에서 사용한다. 사용자 PC 조작을 피하기 위해 앱에서 실제 동기화된 화면은 직접 확인하지 않았다. 로컬 서버 호출은 데스크톱 앱에서 실행한다. 웹 Cloud Agent에서 `127.0.0.1` 서버를 호출하는 방식으로 테스트하지 않는다.

## 바로 해볼 순서

| 순서 | 할 일 | 확인 |
| --- | --- | --- |
| 1 | HTTP 01 헬스체크 Send | 200 / UP |
| 2 | HTTP 02 설정, 03·04 테이블 목록 Send | tableIdA·tableIdB가 선택한 환경에 자동 저장됨 |
| 3 | WebSocket 01 참가자 A와 02 참가자 B에서 각각 Connect | 둘 다 CONNECTED, 서로 다른 dev 사용자 |
| 4 | A·B 모두 `01 광장 A 입장` 메시지 Send | CHANNEL_STATE와 WORLD_STATE |
| 5 | A의 위치·채팅·감정표현 메시지 Send | B에도 상태/이벤트 수신. 이동은 착석 전에 테스트 |
| 6 | A `05 착석` → B `05 착석` → A `06 오목 선택` | 같은 테이블의 두 좌석·게임 선택 공유 |
| 7 | A·B 모두 `07 준비` | TABLE_STATE.allReady=true. 기본 모드는 실제 경기 시작 안 함 |
| 8 | 준비 취소·테이블 퇴장·광장 퇴장 | 서로 상태 갱신. 광장 퇴장은 착석 해제 후 가능 |

WebSocket 탭 하나가 사용자 하나다. **Connect를 유지한 채 Saved Messages에서 골라 Send**한다. 메시지마다 새 탭을 만들거나 다시 연결하지 않는다. 자동 Run으로 모든 메시지를 순서대로 보내는 묶음이 아니다. 추가·오류 메시지는 이름에 적힌 조건을 맞춰 개별 실행한다.

채팅·감정표현은 각각 1초 간격을 둔다. 위치 `sequence`는 저장된 0 → 1 순서로 보내고, 이후 이동은 숫자를 늘린다. 예전 순번 재전송은 위치를 갱신하지 않는다. `requestId`의 `{{$guid}}`는 Postman이 매 전송 새 값으로 치환한다.

## 관전자·끊김·시작 검증

- **03 관전자 C**: Connect → 광장 A 입장 → 테이블 보기. TABLE_WATCH_STATE를 받지만 좌석/준비 인원은 늘지 않는다. 경기 관전은 별도 GAME_WATCH 연결부이며 실제 엔진·권한 판정은 연동 대기다.
- **채널 격리**: B가 테이블·광장을 퇴장한 뒤 광장 B로 입장한다. A의 이동·채팅·감정표현이 B에게 오지 않아야 한다.
- **대기 중 끊김**: B 탭의 Disconnect를 누르면 A에서 B 좌석/준비/위치·채널 인원이 정리된다. 기본 dev 재연결은 새 사용자이며 이전 좌석 복구가 아니다.
- **heartbeat**: JSON PING을 보내는 기능이 아니다. 서버 Ping에 Postman이 Pong을 처리한다. Disconnect는 정상 종료이므로 heartbeat 무응답 실험과 다르다. 무응답·29/30초 경계 검증은 기존 `backend/gradlew.bat flowTest`가 담당한다.
- **04·05 선택적 시작 검증**: 서버 프로그램 인수에 `--ontop.start-rehearsal.enabled=true`를 추가하고 재실행한다. 이 두 연결에서 A/B 착석 → A 게임 선택 → 전원 준비 → GAME_START_STATE의 CONFIRMED를 본다. 성공 뒤 좌석이 보존되므로 일반 퇴장 테스트와 섞지 않는다. 실제 차감/경기 실행은 없다.

## 아직 성공시킬 수 없는 기능

**06 경기 통신 — 인증·엔진 연동 대기**에는 경기 조회·입력·관전·해제와 잘못된 요청 예시가 있다. 현재 dev 모드에서는 요청 이름에 적힌 오류가 정상이다. 실제 로그인/경기 엔진이 붙기 전에는 성공 시연으로 사용하지 않는다. 입력의 버전 0·좌표는 형식 예시이며, 실제 연동 시 최신 경기 버전과 게임별 확정 입력으로 수정한다. 새 행동은 새 actionId, 같은 행동 재확인은 같은 actionId·내용을 유지한다.

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

`X-Test-Login`, 임의 Bearer 토큰, userId 헤더를 넣어도 실제 서버 로그인은 되지 않는다. 인증 모드를 켜기만 하면 검증기 미등록으로 503이므로 일반 테스트에서는 켜지 않는다. 게임 입력은 전달 연결부만 구현했고, 실제 게임 규칙·승패·정산은 연동되지 않았다. 성공하는 것처럼 보이는 가짜 요청은 제공하지 않는다.

## 파일 관리

`generate.mjs`가 요청 데이터 원본이다. Node.js로 `node postman/generate.mjs`를 실행하면 JSON 내보내기와 native YAML을 함께 갱신한다. `node postman/generate.mjs --check`는 파일을 바꾸지 않고 생성 결과를 대조한다. 생성 파일을 직접 바꾼 뒤 재생성하면 덮어써지므로 원본을 먼저 수정한다. 계정 정보·토큰은 파일에 넣지 않는다.

공식 형식: [Postman v3 스키마](https://schema.postman.com/collection/json/v3.0.0/draft-07/collection.json), [로컬 컬렉션 구조](https://learning.postman.com/docs/use/native-git/setup).
