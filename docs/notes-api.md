# 전망대 익명 메모 API

M08 프론트 요청서(2026-10-24)·OnTop 통합 기획서 v0.4·2026-10-25 사용자 확정 기준.
인증 담당 코드는 변경하지 않으며 기존 Access JWT를 사용한다.

## 공통 규칙

- 전 채널 공용 게시판. 최신 120장만 저장하며 초과분은 같은 작성 트랜잭션에서 삭제한다.
- 별도 기간 만료 없음. 정렬은 `createdAt DESC, id DESC`. 같은 시각은 큰 ID가 먼저다.
- 공개 기록·응답은 `id`, `text`, `createdAt`만 사용한다. 닉네임·회원 ID·세션·IP·채널·요청 키를 메모에 저장하지 않는다.
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
  "text": "오늘도 좋은 하루 보내세요"
}
```

위 시각은 예시다. 새 글을 보낼 때 `Date.now() + '_' + crypto.randomUUID()`로 키를 한 번 만들고,
응답 유실·취소·재시도에는 **같은 키·같은 정규화 본문**을 유지한다. ID는 발급시각13자리ms와
영문/숫자/`_`/`-` 16~64자리 임의키다. 추가 userId/position 등 필드는400으로 거절한다.

### 성공 응답 · 201

```json
{
  "note": {
    "id": "1",
    "text": "오늘도 좋은 하루 보내세요",
    "createdAt": "2026-10-25T00:00:00Z"
  },
  "nextAllowedAt": "2026-10-25T00:00:15Z"
}
```

DB 커밋 성공 뒤 반환한다. 동일 회원·키·정규화 본문은 작성 간격과 별개로 기존 결과를 돌려준다.
같은 키 다른 본문은409. 같은 키를 다른 회원이 쓰면 별도 요청이다. 채널은 접근 검사에만 사용한다.
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
      "createdAt": "2026-10-25T00:00:00Z"
    }
  ]
}
```

최대120장 전체 목록. 페이지네이션·작성자 필드 없음. 정상적으로 글이 없으면 `notes: []`.
창을 연 동안 겹치지 않는 요청으로2초마다 재조회한다. 같은 ID는 중복 표시하지 않는다.
창 닫기·거리/높이 이탈·테이블/시설 이용·수영·단절·채널 변경 시 타이머/요청을 정리한다.
재접속·다시 열기는 새 조회부터 시작한다. 서버 WS 본문 방송·구독 상태는 추가하지 않는다.
FE 목업 교체와 폴링 수명 처리는 프론트 연동 범위다.

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
| 400 | INVALID_REQUEST / NOTES_TEXT_INVALID. 입력을 수정한다 |
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
- 기본값은 꺼짐(경로 미등록). 활성화했지만 DB 서비스가 없으면503. 운영 프로필은 등록하지 않는다.
- 신규 `db/notes/V121__create_anonymous_notes.sql`은 별도 opt-in 경로다. 기존 공통/미니게임 경로를 유지하고
  팀 버전 순서 합의 후 `classpath:db/notes`를 추가한다. 기존 DB repair/reset/outOfOrder 자동 실행 없음.
- 신고·삭제·필터 관리 API는 이번 범위에 없다. 실제 개발 서버 배포와 FE UI 연결 완료를 의미하지 않는다.
