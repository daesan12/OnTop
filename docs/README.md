# 팀 문서 안내

팀이 함께 참고할 문서는 이 저장소의 `docs/`에 둔다. 수신 원문과 프로젝트에서 정한 개발 기준을 구분한다.

| 자료        | 현재 참고 파일                             | 용도                                             |
| ----------- | ------------------------------------------ | ------------------------------------------------ |
| Jira 컨벤션 | [conventions/jira.md](conventions/jira.md) | Epic·Story 구조, 제목, 설명 양식, 중복 방지 규칙 |
| Git 컨벤션 수신본 | [conventions/git.md](conventions/git.md) | 원문 3개·이미지 2개와 상충하는 규칙 확인 항목 |
| 백엔드 코드 컨벤션 | [conventions/backend-code.md](conventions/backend-code.md) | 포맷·명명·패키지·객체·예외·로그·테스트 작성 기준 |
| 백엔드 담당 분담표 | [backend-responsibilities.md](backend-responsibilities.md) | 실시간 통신·데이터 정합성 담당과 시작·베팅·정산 연결점 |
| 게임 엔진 통신 분기 | [game-engine-routing.md](game-engine-routing.md) | 서버 경기 ID별 입력·상태·복구 분기와 교차 점유. 오목·주사위·원카드·거짓말 다리 연결 |
| 주사위 실행 계약 | [farkle.md](farkle.md) | 점수·굴림·저장·버스트·핫 다이스·즉시승리·차례30초 넘김. 실제 재화/저장은 별도 |
| 원카드 실행 계약 | [onecard.md](onecard.md) | 제출·공격·특수카드·개인손패·선언/신고·30초넘김. 기권손패정책은확인대기·필수명시설정 |
| 오목 실행 계약 | [omok.md](omok.md) | 15×15 렌주 금수·착수·승패·한 수30초 시간패·상태/복구 연결. 실제 시작/재화 저장은 별도 연동 |
| 오목 브라우저 테스트 | [omok-demo.md](omok-demo.md) | 별도 loopback 서버에서 흑·백·관전·끊김/복귀·승패를 직접 확인. 로그인/참가 확정은 테스트 대역 |
| 세 게임 브라우저 테스트 | [games-demo.md](games-demo.md) | 주사위·원카드·다리 입력과 A/B 개인·관전자 공개 상태를 한 화면에서 확인. 테스트 전용18082 |
| 팀 협의 목록 | [team-decisions.md](team-decisions.md) | 미확정 제품 정책과 실제 연동에 필요한 답을 한곳에 정리 |
| WebSocket API 명세 | [websocket-api.md](websocket-api.md) | DB 없는 연결·테이블 착석·첫 착석자의 게임 선택·퇴장·준비 동기화 계약. local 구현·검증 완료 |
| WebSocket 인증 연결부 | [websocket-authentication.md](websocket-authentication.md) | Access JWT → 30초1회용 접속권 → 검증 사용자 연결. 외부 OAuth/실제 DB 검증 별도 |
| 경기 입력 연결부 | [game-action-api.md](game-action-api.md) | 인증 참가자 입력 전달·처리 확인. 4종 엔진·메모리 중복 검증 지원. 영속 저장은 미연결 |
| 경기 종료·정산 결과 전달 | [game-result-api.md](game-result-api.md) | 본인 확정 결과 자동 전송·재조회. 종료/PENDING/SETTLED 구분. 실제 DB·지급 미연결, Notion·Postman 웹 저장 확인 |
| 경기 상태 조회·자동 전송·관전 | [game-state-api.md](game-state-api.md) | 참가자 공개/개인 정보 분리·관전자 공개 상태 구독·변경 알림 병합. 선택적 4종 엔진·20m 검사 지원. 실제 맵 배치 설정 필요 |
| 경기 재접속 연결부 | [game-reconnect.md](game-reconnect.md) | 추가 연결 차단·30초 내 최신 경기 복귀·만료 처리 경계. 선택적 4종 엔진 상태·차례·마감 복구 지원 |
| WebSocket heartbeat | [websocket-heartbeat.md](websocket-heartbeat.md) | Ping/Pong으로 무응답 연결 감지 후 30초 재접속 유예 연결 |
| 전체 흐름 테스트 도구 | [flow-test.md](flow-test.md) | 한 명령으로 착석·준비·끊김·복귀 확인. 인증/경기는 테스트 대역 |
| 테이블 목록 조회 API | [table-query-api.md](table-query-api.md) | local GET, 인증 모드의 JWT·활성 계정 확인과 착석·준비·종료 목록 반영 |
| 채널 목록 조회 API | [channel-query-api.md](channel-query-api.md) | Access JWT·활성 계정 인증, 설정 기반 목록과 광장 실제 인원. 외부 OAuth/실제 DB 검증 별도 |
| 광장 WebSocket | [world-websocket-api.md](world-websocket-api.md) | 기존 소켓으로 채널 입장·퇴장·인원 동기화. 채널별 테이블·위치 공유·채널 채팅 기반 구현. 20m 근거리 채팅·관전 검사 구현, 실제 맵 배치 미설정 |
| 게임 시작 연동 계약 초안 | [game-start-contract-draft.md](game-start-contract-draft.md) | 로그인→시작→경기→복귀→결과의 현재 연결부·정식 연동 경계. 과거 초안은 별도 구분 |
| 인증 경기 시작 연결 | [committed-game-start.md](committed-game-start.md) | 전원 준비→차감 확정 Gateway→엔진/복구. 실제 DB 차감·정산 구현/검증 별도 |
| 게임 시작 연동 검증 | [game-start-rehearsal.md](game-start-rehearsal.md) | 선택해서 켜는 DB 없는 시작 요청·성공·거절·조회 확인 기능. 실제 경기·차감 없음 |
| 제품 기준·ERD 대조 | [erd-policy-alignment.md](erd-policy-alignment.md) | 사용자 지정 OnTop v0.4 우선순위, ERD·과거 초안과의 차이 및 실제 구현 범위 |

## 받은 파일 관리

직접 API 테스트: [Postman 시작 안내](../postman/README.md) — HTTP·WebSocket 요청, 테스트 환경과 실행 순서.

인프라 전달: [헬스체크 API](health-check.md) — `GET /actuator/health`, 정상 200/UP, 현재 검사 범위·배포 시 경로 안내.

WebSocket의 현재 연결·누적 등록/종료·수신 텍스트·완료 송신 수/UTF-8 바이트·종료 사유별 지표는 같은 [운영 안내](health-check.md#websocket-운영-지표)에 있다. 현재 local MeterRegistry에 등록하며 외부 수집기·관리 HTTP 노출은 추가하지 않았다.

경기 진행의 연결 계약: [공개·개인 상태 조회](game-state-api.md), [입력 전달](game-action-api.md), [상세 7종](websocket-api/09-game-communication.md). 2026-10-20 기존 Notion WebSocket 목록에 반영하고 본문·담당자·진행상황을 재조회했다. 선택적으로 활성화하는 [오목](omok.md)·[주사위](farkle.md)·[원카드](onecard.md)·[거짓말 다리](bridge.md) 실제 엔진이 있다. 실제 로그인·시작 차감·DB 정산은 미연결이다.

- 파일은 용도에 맞는 폴더와 짧고 일정한 이름으로 보관한다. 현재 팀 규칙은 `docs/conventions/`에 둔다.
- 받은 원문의 내용은 임의로 고치거나 요약본으로 대체하지 않는다. 출처·수신일·원래 파일명은 이 안내에 남긴다. 작업할 때는 연결된 원문에서 해당 규칙을 읽는다.
- 새 버전을 받으면 원문과 차이를 확인하고 현재 파일을 갱신한다. 커밋 전 사본이 필요하면 별도 보존하고, 커밋된 뒤의 이전 버전은 Git 이력으로 추적한다. `최종`, `최종2`처럼 같은 내용의 복사본을 쌓지 않는다.
- 서로 다른 출처의 규칙이 충돌하면 팀이 확정한 기준을 확인한다. 로컬 수신본이 항상 최신이라고 가정하지 않는다.
- 이 문서와 이슈 예시는 실제 요구사항이나 신규 이슈 생성 지시가 아니다. 실제로 필요한 작업만 등록한다.

## Jira 컨벤션 출처

- 제공 경로: 사용자가 팀원에게 받아 `자율/`에 올린 Markdown 파일.
- 원래 파일명: `Jira_Convention 3fa161842b86808d8c3ee99cc8dc846e.md`.
- 수신본 정리일: 2026-10-18. 원문 개정일은 확인되지 않았다.
- 관련 원문: [팀 Notion Jira_Convention](https://app.notion.com/p/Jira_Convention-3fa161842b86808d8c3ee99cc8dc846e).
- 정리 시 SHA-256: `FA3ED00013810FFDD0066C2F78D05A0070678A8E4C2617B7F748096A2781BD9B`.
- 파일 이동과 이름 정리만 수행했으며 수신본의 내용은 변경하지 않았다. 사용자가 현재 Jira 작업의 참고 자료로 지정했다. Notion 최신본과의 전체 대조는 수행하지 않았다.

## Git 컨벤션 출처

- 사용자 제공 ZIP: `b9ddfac9-064f-408a-91b7-e4b88a3eb8b3_ExportBlock-9c2e3306-a31a-4a4f-855f-e9cc648b065a.zip`.
- 수신본 정리일: 2026-10-18. Notion 최신본과의 대조는 수행하지 않았다.
- 원문 파일명·내용과 이미지의 상대 링크를 유지해 `conventions/git-source/`에 보존했다. 상세 출처·통합 원문 해시는 [수신 안내](conventions/git.md)에 있다.
- 부속 문서와 통합 문서의 브랜치·커밋 규칙에 차이가 있어 팀 확인 항목을 남겼다. 백엔드 코드 컨벤션은 사용자 지시에 따라 별도로 정한 기준이며 받은 원문이 아니다.

근거리 설정: [채팅·관전 20m](world-proximity.md) — 서버 테이블 좌표, 내부 경기 tableId, 범위 이탈/미설정 처리.

- [거짓말 다리 입력·서버 판정·비밀 눈](bridge.md)
