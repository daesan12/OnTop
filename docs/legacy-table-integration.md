# 현재 맵의 16개 게임 테이블 연결

2026-10-27 FE 요청 기준. 현재 legacy 맵을 유지하며 180m 생성 맵으로 전환하지 않는다.
기존 게임·인증·판돈 예약/정산 계약과 DB 스키마는 유지한다.

## 등록·좌표 계약

서버가 읽는 `world/park.json.tables`가 앵커와 좌표의 기준이다.
`WorldMapRuntime → LegacyParkTables`가 등록 목록과 기본 관전 좌표를 함께 만든다.
설정된 채널마다 16개의 독립된 방을 만들고, 서버 ID는 기존 계산식
`"table-" + UUID.nameUUIDFromBytes(UTF8(channelId + NUL + anchorId))`를 유지한다.
따라서 기존 두 서버 ID가 바뀌지 않으며 다른 채널의 같은 앵커는 별도 ID·상태를 갖는다.
채널 없는 기존 단위/PoC 생성자의 `table-1`, `table-2`는 유지한다.

- 개발 채널: `channel-1`, 서버 등록 16개.
- 로컬 frontend-test 채널: `channel-1`, `channel-2`, 각 16개.
- [개발 대응표](integration/legacy-tables/bindings.dev.md), [CSV](integration/legacy-tables/bindings.dev.csv),
  [JSON](integration/legacy-tables/bindings.dev.json).
- [두 채널 대응표](integration/legacy-tables/bindings.frontend-test.md),
  [JSON](integration/legacy-tables/bindings.frontend-test.json).

FE는 JSON의 `bindings` 배열을 기존 배포용 `tableBindings` 입력으로 연결한다.
`GET /api/v1/tables?channelId=...`의 실제 등록 ID와 교차 확인하며 UUID·목록 순서에서 배치를 유추하지 않는다.
HTTP/WS 필드를 추가하지 않았다. 좌표는 테이블 중심이며 관전은 동일 채널 XZ 20m 경계를 포함한다.
기존 명시적 서버 proximity 좌표/반경 설정은 우선하므로 개발 서버에 별도 override가 있다면 같이 확인한다.
맵 JSON·mapVersion·시설·충돌 데이터는 변경하지 않는다.

```sh
node backend/tools/export-legacy-tables.mjs
node backend/tools/export-legacy-tables.mjs --check
```

## 시작 실패 구분

테이블 등록과 실제 게임 시작 활성화는 별개다. dev 기본값은 `GAME_START_ENABLED=false` 및 네 엔진 모두 false다.
실행 서버의 실제 값은 설정 파일 기본값만으로 확정할 수 없다.
실제 서버는 `GAME_START_CHECK {}`를 인식하고, 착석했지만 시작 연결이 비활성이면 다음 오류를 반환한다.
계좌 잔액 부족이나 DB 장애로 단정하거나 로컬 가짜 경기로 우회하지 않는다.

```json
{
  "requestId": "start-check-1",
  "type": "ERROR",
  "payload": {
    "code": "START_NOT_CONFIGURED",
    "message": "경기 시작 연결이 비활성 상태입니다."
  }
}
```

AUTO 전원 준비 시 연결이 없으면 기존 준비 상태는 유지하고 서버가 비활성 진단을 남긴다.
FE는 조회 오류를 표시하고 시작을 반복 요청하지 않는다. MANUAL의 `TABLE_START`도 같은 설정 오류를 거절한다.
연결이 있지만 아직 시작한 적이 없으면 기존 `START_NOT_REQUESTED`다.
엔진 미등록은 기존 시작 서비스가 DB 예약 전에 거절한다(`GAME_RUNTIME_UNAVAILABLE` → 공개 `START_REJECTED`).
테이블/좌석 불일치·인증·설정 버전 오류는 기존 검증을 유지한다.

실제 시작에는 DB 담당과 적용 이력·예약/정산 연결을 확인한 뒤 `GAME_START_ENABLED=true`,
사용할 `GAME_OMOK_ENABLED`/`GAME_FARKLE_ENABLED`/`GAME_ONECARD_ENABLED`/`GAME_BRIDGE_ENABLED`가 필요하다.
이번 작업에서 공용 DB·서버 환경변수·팀원 저장 코드·배포를 변경하지 않는다.

## 사용·검증 흐름

채널 입장 → 실제 테이블 조회 → 착석 → 방장 `TABLE_CONFIGURE` → 선택 정원 전원 `READY_SET`
→ 방장 `TABLE_START` → 예약 확정 후 PLAYING → 경기 종료·전체 SETTLED → 좌석 유지·준비 해제 → 다음 판.
기존 AUTO `GAME_SELECT` 흐름도 유지한다. 상세 메시지는 [태블릿 명세](tablet-lobby-api.md)를 따른다.

`LegacyParkTableFlowTests`는 실제 Spring 구성·Hub·프로토콜로 두 채널 각 16개에서 두 판씩,
총 64라운드의 시작·종료·정산 알림·승계·다음 판 및 방/채널 격리를 검사한다.
예약/엔진/정산 결과는 대역이며 실제 코인 처리나 네 게임 규칙 검증으로 세지 않는다.
`ChannelTableWebSocketTests`는 실제 HTTP/Raw WS의 16개 조회·다른 채널 착석 차단·시작 상태 격리를 검사한다.
`LegacyParkTablesTests`는 모든 좌표의 관전 20m 안팎·다른 채널 차단과 기존 ID를 확인한다.
기존 네 게임 실제 엔진·복구 회귀는 관련 테스트와 전체 기본 검사를 함께 실행한다.

로컬 검증과 개발 서버 적용을 구분한다. CI 실패 해결·BE/FE 배포·실제 회원의 공용 DB 예약/정산 및
3D 착석·관전자·다음 판 공동 검수가 완료되기 전에는 실제 연동 완료로 표시하지 않는다.
배포 일정은 CI 및 DB 담당 확인 뒤 공유한다.
