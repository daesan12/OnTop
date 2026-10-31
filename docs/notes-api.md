# 전망대 익명 메모 API

M08 프론트 요청서(2026-10-24)·OnTop 통합 기획서 v0.4·2026-10-25 사용자 확정 기준.
인증 담당 코드는 변경하지 않으며 기존 Access JWT를 사용한다.

## 공통 규칙

- 전 채널 공용 게시판. 최신 120장만 저장하며 초과분은 같은 작성 트랜잭션에서 삭제한다.
- 별도 기간 만료 없음. 정렬은 `createdAt DESC, id DESC`. 같은 시각은 큰 ID가 먼저다.
- 공개 기록·응답은 `id`, `text`, `createdAt`, `category`만 사용한다. 닉네임·회원 ID·세션·IP·채널·요청 키를 메모에 저장하지 않는다.
- 조회·작성·동일 요청 재확인 모두 서버가 보유한 채널·승인 위치·활동 상태로 검사한다.
- FE `NOTES_BOX` 기준 XZ 2.6m 이내, 캡슐 중심 높이18.92m와 차이0.7m **미만**.
  기본 중심 `(54.5, 18.92, 48.5)`. 지상·원거리·다른 채널·미접속·수영·테이블/시설 이용 중 거절.
- 원문 UTF-16 300자 초과 거절 → NFC → FE와 같은 제어/Cf 문자 제거 → JS trim → 최종1~300자.
  내부 줄바꿈·탭·CR은 유지한다. FE는 epoch ms를 사용하므로 ISO8601 시각을 `Date.parse`로 변환한다.
- 쓰기15초·읽기1초 간격. 오류/조회 실패를 빈 목록이나 성공으로 바꾸지 않는다. 모든 응답 `Cache-Control: no-store`.

## NOTES-01 · 익명 메모 작성

| 항목 | 내용 |
| --- | --- |
| Method | POST |
| URL | /api/v1/notes |
| 인증 | Authorization: Bearer Access JWT |
| 담당자 | 장대산 |

### 요청

```json
{
  "operationId": "1761436800000_0123456789abcdef",
  "channelId": "channel-1",
  "text": "오늘도 좋은 하루 보내세요",
  "category": "cheer"
}
```

위 시각은 예시다. 새 글을 보낼 때 `Date.now() + '_' + crypto.randomUUID()`로 키를 한 번 만들고,
응답 유실·취소·재시도에는 **같은 키·같은 정규화 본문·같은 주제**를 유지한다. ID는 발급시각13자리ms와
영문/숫자/`_`/`-` 16~64자리 임의키다. 추가 userId/position 등 필드는400으로 거절한다.

### 성공 응답 · 201

```json
{
  "note": {
    "id": "1",
    "text": "오늘도 좋은 하루 보내세요",
    "createdAt": "2026-10-25T00:00:00Z",
    "category": "cheer"
  },
  "nextAllowedAt": "2026-10-25T00:00:15Z"
}
```

DB 커밋 성공 뒤 반환한다. 주제는 daily/cheer/worry/recommend/free 중 하나이며 생략·기존 글은 free다.
명시한 null·미등록 값은400이다. 동일 회원·키·정규화 본문·주제는 작성 간격과 별개로 기존 결과를 돌려준다.
같은 키 다른 본문 또는 주제는409. 같은 키를 다른 회원이 쓰면 별도 요청이다. 채널은 접근 검사에만 사용한다.
재확인은 키 발급 시각부터24시간 이내다. 삭제된 메모는410 `NOTE_REMOVED`, 만료 키는410
`NOTES_REQUEST_EXPIRED`. FE는410을 새 키로 자동 재게시하지 않고 기존 원문과 상태를 안내한다.
키 발급 시각이 서버보다 미래이면400이며 기기 시각을 확인한다. 새 키 생성은 새 글 작성 시에만 한다.

## NOTES-02 · 익명 메모 목록 조회

| 항목 | 내용 |
| --- | --- |
| Method | GET |
| URL | /api/v1/notes?channelId=channel-1 |
| 인증 | Authorization: Bearer Access JWT |
| 담당자 | 장대산 |

### 성공 응답 · 200

```json
{
  "notes": [
    {
      "id": "1",
      "text": "오늘도 좋은 하루 보내세요",
      "createdAt": "2026-10-25T00:00:00Z",
      "category": "cheer"
    }
  ]
}
```

최대120장 전체 목록. 페이지네이션·작성자 필드 없음. 정상적으로 글이 없으면 `notes: []`.
정기 GET 폴링은 사용하지 않는다. 열기·재접속·다시 열기는 새 조회부터 시작한다.
본인 POST ACK는 목록에 병합하고, 열린 창에서 NOTES_CHANGED를 받으면 읽기1초 제한에 맞춰 합쳐 조회한다.
창 닫기·거리/높이 이탈·테이블/시설 이용·수영·단절·채널 변경 시 구독/요청을 정리한다.
작성 중 원문·주제·커서를 유지한다. 실제 FE subscribe 연결은 프론트 후속 작업이다.

## NOTES_CHANGED · 생성 변경 알림

인증한 `/ws/tables` 연결에서 맵 확인·채널 입장을 마친 사용자 모두에게 전 채널 공용 알림을 보낸다.
추가 클라이언트 구독 명령은 없고, 프론트는 기존 공유 소켓의 이벤트를 열린 메모창에 연결한다.

```json
{"requestId":null,"type":"NOTES_CHANGED","payload":{"revision":"1234"}}
```

- revision은 게시판별 단조 증가 BIGINT의 십진수 문자열이다. 본문·작성자·메모ID·요청키를 포함하지 않는다.
- 새 글과 revision을 같은 트랜잭션으로 커밋한다. 롤백·동일 요청 재확인에는 증가/알림 없음.
- 로컬 인스턴스는 실제 최종 커밋 후 전송한다. 다른 인스턴스는 같은 DB revision을 서버에서1초마다 읽어 변경분만 전송한다.
  여러 글은 최신 revision 한 번으로 합칠 수 있다. 새 Redis/브로커·클라이언트 정기 GET은 추가하지 않는다.
- 알림/DB 확인 실패는 seen을 진전시키지 않아 다음 서버 확인에서 재시도한다. POST 저장 성공을 실패로 바꾸지 않는다.
- 오래되거나 같은 revision은 FE에서 무시한다. 연결 유실·재접속 시 이전 알림 재생 대신 REST 전체 목록을 다시 조회한다.
- 조회 자체의 접근/간격 검사는 그대로다. 다중 JVM 실배포 검수는 별도다.

## 오류 응답

```json
{
  "code": "NOTES_WRITE_COOLDOWN",
  "message": "잠시 후 다시 시도해주세요.",
  "nextAllowedAt": "2026-10-25T00:00:15Z"
}
```

| HTTP | code / 처리 |
| --- | --- |
| 400 | INVALID_REQUEST / NOTES_TEXT_INVALID / NOTES_CATEGORY_INVALID. 입력을 수정한다 |
| 401 | 기존 인증 오류 / UNAUTHENTICATED. 로그인 갱신 후 재연결한다 |
| 403 | NOTES_OUT_OF_RANGE. 메모함 근처 같은 높이로 이동한다 |
| 409 | NOT_IN_CHANNEL / NOTES_ACTIVITY_CONFLICT. 채널·활동을 확인한다 |
| 409 | IDEMPOTENCY_CONFLICT. 원래 키·본문을 확인한다 |
| 410 | NOTE_REMOVED / NOTES_REQUEST_EXPIRED. 자동 재게시 금지 |
| 429 | NOTES_READ_COOLDOWN / NOTES_WRITE_COOLDOWN. nextAllowedAt 이후 재시도 |
| 503 | NOTES_NOT_CONFIGURED / NOTES_UNAVAILABLE. 저장 여부 미확정, 원문·키 유지 |

## 익명성·실행 설정

- 별도 재시도 테이블에는 회원/요청 키·본문의 **원문 대신 용도별 HMAC**과 메모 ID·접수/만료 시각만 저장한다.
  간격 테이블은 별도 HMAC·다음 허용/만료 시각만 저장하고 메모 ID를 연결하지 않는다.
- 재시도 메타데이터는 키 발급시각 기준24시간 유효하며(미래 시각 키는 거절),
  간격 정보는 마지막 이용 후24시간 유효하다.60초 정리 작업으로 만료 행을 삭제한다(정리 실패 시 운영 확인 필요).
  DB 원본 ID를 보관하지 않는 설계이며, 비밀키를 가진 운영자에 대한 절대적인 추적 불가능을 보장하지 않는다.
  메모 본문·작성자·요청 키를 로그/행동 이벤트로 함께 기록하지 않는다.
- local/dev + db에서 `ontop.notes.enabled=true`, `ontop.notes.privacy-secret` 32자 이상을 명시해야 한다.
  dev 환경변수 `NOTES_ENABLED=true`, `NOTES_PRIVACY_SECRET` 사용. 비밀키는 모든 인스턴스가 공유하며
  24시간 내 교체하면 기존 재시도·간격 정보가 복구되지 않으므로 함께 조율한다.
- 기본값은 꺼짐(경로 미등록). 활성화했지만 DB 서비스가 없으면503. 운영(`prod,db`)도 `NOTES_ENABLED=true`와
  비밀키를 명시했을 때만 등록한다(DEV·PROD 기본 OFF).
- 켠 상태에서 비밀키가 없거나 32자 미만이면 앱 기동이 실패한다(오류에는 비밀키 값을 남기지 않음).
  V133 메모 테이블이 없는 DB에서 켜도 JPA 스키마 검증으로 기동이 실패한다.
- 메모 테이블 4개(`anonymous_notes`, `anonymous_note_requests`, `anonymous_note_rates`, `anonymous_note_board`)는
  공통 `db/migration/V133__create_anonymous_notes.sql`이 만든다. DEV(`db/migration`·`db/minigame`)와
  PROD(`db/migration`) 기본 실행 경로에 이미 포함되므로 Flyway locations를 바꾸지 않는다.
- 이전 `db/notes/V121`·`V129`는 참고용으로 보존하며 실행 경로에 추가하지 않는다. V132 이상이 적용된 DB에
  낮은 버전을 추가하면 out-of-order로 검증이 실패한다. 기존 DB repair/reset/outOfOrder/baseline 자동 실행 없음.
- V133은 메모 테이블이 없는 DB 전용이다. 배포 전 대상 DB에서 `infra/app/verify-notes-db.sh`로
  V121/V129 이력과 메모 테이블이 없음을 확인한다. 하나라도 있으면 V133 배포를 멈추고 별도 편입 절차를 정한다.
- 신고·삭제·필터 관리 API는 이번 범위에 없다. 실제 개발 서버 배포와 FE UI 연결 완료를 의미하지 않는다.

2026-10-29 V129(주제·공용 변경번호)를 `db/notes`에 추가했으나 공유 DB 실행 경로에는 포함되지 않았다.
S15P31B105-296에서 V121·V129 최종 스키마를 공통 V133으로 옮겼다(`NotesSchemaMigrationMySqlTests`가 같은 스키마임을 격리 DB로 검증).
공용 DB 적용 이력·배포 성공은 아직 확인하지 않았다. notes 활성화(JPA 검증) 전에 V133이 먼저 적용돼야 한다.
FE는 배포 확인 후 빌드 환경의 `VITE_NOTES_CATEGORIES=true`로 다시 빌드하고 NOTES_CHANGED 수신을 subscribe에 연결한다.

## 실제 접속 연동 검증

`ParkMessageFlowMySqlTests`는 dev,db의 JWT→접속권→Raw WebSocket 채널 입장→REST 작성/조회→
단절→재접속/동일 키 재확인을 JPA·격리 MySQL까지 연결한다. 소켓·접근 검사·저장소를 대역으로 바꾸지 않는다.
미입장/단절은409, 거리·높이 이탈은403이며 거절 시 저장하지 않는다. 다른 테스트 채널의 근처 회원에게도
동일 익명 목록만 보이고 재접속 후 같은 요청은 한 장만 유지한다. 소리함과 재시도 정책이 달라,
메모는 같은 키라도 채널 입장·위치 조건을 다시 만족해야 한다.

물리 시간은 고정하고 위치는 신뢰된 서버 fixture로 주입한다. 두 번째 채널도 테스트 설정이며,
실제 걸어서 이동·3D UI·개발 서버 배포를 검증한 것은 아니다. 기존 별도 검사의 간격·120장·24시간
정리·롤백 검증을 대체하지 않는다. 실행 조건은 [전체 흐름 도구](flow-test.md#소리함익명-메모-실제-db-흐름)를 따른다.
