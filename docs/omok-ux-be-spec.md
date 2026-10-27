# 오목 관전자 채팅·핑 BE 확정 명세 요약

갱신: 2026-10-27 KST. BE 담당자의 구현 완료 회신과 로컬 소스의 최종 계약을 반영했다. 최초 요청 초안은 최종 계약으로 대체한다. 개발 서버 배포·실제 계정 FE 공동 검수는 별도다.

최우선 기준은 [확정 WebSocket 계약](websocket-api/10-game-spectator-events.md)이다. [요청 이력](../frontend/docs/OMOK_UX_BE_REQUEST.md), [UX 기획](omok-ux-plan.md), [FE 명세](../frontend/docs/OMOK_UX_FE_SPEC.md)를 함께 참조한다.

## 선행 작업 보존

진입·선택·준비·방장 수동 시작은 기존 선행 작업을 사용한다. 후속 작업과 충돌하면 선행 작업을 유지하고 후속 구현을 맞춘다. 기존 인증 소켓·착수·렌주·30초 타이머·기권·복구·결과·정산을 변경하지 않는다.

## 최종 요청과 이벤트

| 방향 | 메시지 | payload |
| --- | --- | --- |
| C→S | GAME_SPECTATOR_CHAT_SEND | {gameId,eventId,text} |
| S→C | GAME_SPECTATOR_CHAT_MESSAGE | {gameId,eventId,senderUserId,text,sentAt,expiresAt,serverNow} |
| C→S | OMOK_SPECTATOR_PING_SEND | {gameId,eventId,basedOnVersion,x,y} |
| S→C | OMOK_SPECTATOR_PING | {gameId,eventId,senderUserId,basedOnVersion,x,y,sentAt,expiresAt,serverNow} |

- sentAt/expiresAt/serverNow는 **Unix milliseconds 숫자**다. ISO 문자열을 사용하지 않는다.
- eventId는 소문자 정규 UUID이며 crypto.randomUUID()를 사용한다.
- x=열, y=행, 각각 0~14 정수다. basedOnVersion은 화면에 표시 중인 공개 경기 버전이다.
- text는 앞뒤 공백 제거 후 1~200 Unicode 코드포인트이며 기존 ChatText 검증을 따른다.
- 발신자는 원래 requestId가 담긴 승인 이벤트, 나머지 수신자는 requestId=null 이벤트를 받는다.

## 권한과 전달

- 해당 gameId로 GAME_WATCH가 승인되고 **첫 GAME_STATE까지 받은 인증 회원 관전자**만 발신할 수 있다.
- 같은 채널·테이블 중심 20m·미착석·로비 자격·비참가자 조건을 서버가 재검사한다. TABLE_WATCH만 하거나 근처에 있다는 사실은 권한이 아니다.
- 플레이어는 수신만 한다. 향후 게스트도 관전 수신만 허용한다.
- 채팅·핑 모두 해당 경기의 복구 완료된 두 플레이어와 승인 관전자 전체에게 전달한다. 관전자끼리의 채팅 수신도 최종 확정됐다.
- OMOK+PLAYING에서만 동작한다. 일반 WORLD_CHAT_MESSAGE 및 다른 경기와 분리한다.
- 관전 해제·거리 이탈·채널 이동·연결 종료·경기 종료 후 새 이벤트 전달을 중단한다.

## 수명·전송 상한·중복

| 항목 | 최종 값 |
| --- | --- |
| 채팅 TTL | 3000ms |
| 핑 TTL | 2000ms |
| 사용자별 간격 | 채팅·핑 각각 최소 1000ms |
| 경기 전체 채팅 | 3건/3초 |
| 경기 전체 핑 | 5건/2초 |
| 서버 중복 기록 | 인증 발신자+eventId, 30초·사용자당 최대 64건 |

동일 eventId·같은 내용의 유효한 재요청은 원래 sentAt/expiresAt으로 발신자에게만 재확인하고 재방송하지 않는다. 만료/내용 충돌은 거절한다. 서버 중복 기록은 관전 해제·연결 종료로 즉시 삭제하지 않는다. FE는 자동 재시도하지 않는다.

ACK는 **서버 승인 및 전달 시도 완료**를 의미한다. 수신자 큐 여유가 부족하거나 송신 시 만료됐으면 비필수 채팅·핑만 폐기될 수 있다. 모든 화면 도착을 보장하지 않으며, 필수 경기 이벤트나 연결을 중단하지 않는다.

## 판 버전·시각 처리

서버는 관전자에게 마지막으로 전달한 판 버전과 basedOnVersion을 비교하고, 더 새 변경 알림을 이미 받았으면 오래된 핑을 거절한다. 엔진 착수와 Hub 알림 사이 경합이 있으므로 FE가 최종 표시 버전을 검사한다.

- 현재 표시 version과 같은 핑만 표시한다.
- 낮은 버전은 폐기하고 판 version이 바뀌면 이전 핑을 제거한다.
- 높은 버전은 같은 상태가 도착할 때까지 expiresAt 안에서만 제한적으로 보관한다.
- 잔여 수명은 expiresAt-serverNow로 계산하고 수신 후 브라우저 단조 시계로 소멸시킨다. PC 시계나 전체 TTL 재부여를 사용하지 않는다.
- F1·탭 숨김·재접속 후 만료 이벤트를 몰아서 재생하지 않는다.
- 핑은 실제 돌·경기 version·차례·마감·승패·정산을 변경하지 않는다.

## 오류별 FE 처리

| 코드 | 처리 |
| --- | --- |
| GAME_SPECTATOR_ACCESS_DENIED / GAME_SPECTATOR_AUTH_REQUIRED | 입력 비활성화, 관전/인증 상태 재확인 |
| GAME_SPECTATOR_NOT_CONFIGURED | 입력 비활성화 |
| GAME_SPECTATOR_UNSUPPORTED_GAME / GAME_SPECTATOR_GAME_NOT_PLAYING | 해당 게임 입력 종료 |
| OMOK_SPECTATOR_PING_STALE_VERSION | 최신 판 표시 후 사용자 재클릭 |
| GAME_SPECTATOR_CHAT_TOO_FREQUENT / OMOK_SPECTATOR_PING_TOO_FREQUENT | 안내, 자동 재시도 없음 |
| GAME_SPECTATOR_EVENT_EXPIRED / GAME_SPECTATOR_EVENT_ID_CONFLICT | 만료 이벤트 재생 안 함, 충돌 시 새 행동에 새 ID |
| INVALID_MESSAGE / INVALID_PAYLOAD | 요청 생성·입력 확인, 자동 재시도 없음 |
| MAP_VERSION_REQUIRED / INTERNAL_ERROR | 기존 맵 처리 또는 오류 안내 |

전체 JSON·오류 우선순위는 최종 WebSocket 계약을 따른다.

## FE 연결·검수

두 참가자와 관전자 2명 이상을 기준으로 같은 경기만 수신, ACK 한 번 표시, 양쪽 좌석 좌표 일치, 만료·버전 경합·중복·관전 해제 처리를 검증한다. F1 중에도 기존 시간패가 동작하고, 채팅·핑으로 마감이 늘지 않아야 한다.

BE 담당자 회신에 따르면 서버 단위·WebSocket 통합 검사는 완료됐다. FE fixture 브라우저 검사와 실제 개발 서버 다중 계정 공동 검수는 구분해 기록한다.

현재 확정한 오목 UX 범위에서는 추가 BE 메시지·API·DB·권한 변경 요청이 없다. FE가 기존 구현의 확정 계약을 사용한다. 구현된 BE의 개발 서버 배포 및 실제 계정 공동 검수는 남아 있으며, 이 과정에서 재현되는 계약 불일치나 결함이 있을 때 별도로 보완을 요청한다.
