# 소리함 의견 접수·관리자 조회

근거: 수신 M07 BE 명세·현재 FE feedback/validation.ts·2026-10-25 사용자 정책 확정.
M08 공개 익명 메모와 별개인 **관리자만 읽는 비공개 의견**이다. 본문을 월드 이벤트·행동 로그로 방송하지 않는다.

## API

| 기능 | 메서드·경로 | 인증 |
| --- | --- | --- |
| 의견 접수 | POST /api/v1/feedback | 활성 회원 Access JWT |
| 관리자 조회 | GET /api/v1/admin/feedback?limit=20&cursor=123 | 활성 회원 + 서버 관리자 ID 목록 |

Authorization: Bearer Access JWT. 기존 REST Origin/CORS 사용. 모든 응답 no-store.
클라이언트 userId·좌표·성공 판정은 받지 않는다. 쿠키 인증·일반 회원 의견 목록은 제공하지 않는다.

## 요청

```json
{
  "operationId": "feedback-1",
  "channelId": "channel-1",
  "text": "공원을 개선해주세요"
}
```

- 위 세 필드만 허용. operationId는 영문·숫자·하이픈·밑줄 1~64자. channelId는 현재 접속한 등록 채널.
- 타임아웃은 같은 키·채널·원문으로 재시도. 명시적인 새 의견만 새 키 사용.
- 같은 회원·키의 정규화 본문·채널이 같으면 기존 201 영수증. 내용이 다르면 409 IDEMPOTENCY_CONFLICT.
- 기존 영수증 복구를 거리·활동·15초 검사보다 먼저 처리한다. 실패 응답은 성공으로 표시하지 않는다.
- 신규 의견은 서버 위치 기준 X=-10.8/Y=0.8/Z=14.5, XZ 거리2.6m 이내·높이차±0.7m.
- 테이블 착석·경기·시설 이용·수영 중 거절. 회원별15초 간격.
- 본문: 원문 UTF-16 길이600 이하 → NFC → FE 지정 제어문자·FORMAT 제거 → JS trim → 최종5~600.
  이모지는 보통 두 단위, 내부 줄바꿈·탭 유지. 프론트는 일반 텍스트로 표시한다.

201 응답(동일 요청 복구도 같은 형식):

```json
{
  "receiptId": "123",
  "acceptedAt": "2026-10-25T00:00:00Z",
  "nextAllowedAt": "2026-10-25T00:00:15Z"
}
```

## 관리자 조회

서버 ontop.feedback.administrator-ids에 등록된 활성 회원만 조회. 빈 목록이면 모두 거절한다.
관리자는 월드 접속·거리 조건 없이 조회한다. limit 기본20·1~50, cursor는 이전 nextCursor.
접수 ID 내림차순이며 다음 페이지가 없으면 null. 만료 의견은 정리 실행 전에도 조회에서 제외한다.

```json
{
  "items": [
    {
      "receiptId": "123",
      "authorUserId": 202,
      "channelId": "channel-1",
      "text": "공원을 개선해주세요",
      "acceptedAt": "2026-10-25T00:00:00Z"
    }
  ],
  "nextCursor": null
}
```

## 오류

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | INVALID_REQUEST / FEEDBACK_TEXT_INVALID | 필드·키·페이지·본문 오류 |
| 401 | 기존 인증 오류 / UNAUTHENTICATED | 미인증·만료·탈퇴 회원 |
| 403 | FEEDBACK_ADMIN_REQUIRED / FEEDBACK_OUT_OF_RANGE | 관리자 아님 / 거리·높이 불충족 |
| 409 | NOT_IN_CHANNEL / FEEDBACK_ACTIVITY_CONFLICT / IDEMPOTENCY_CONFLICT | 채널·활동·내용 충돌 |
| 429 | FEEDBACK_COOLDOWN | 15초 간격, nextAllowedAt 제공 |
| 503 | FEEDBACK_NOT_CONFIGURED / FEEDBACK_UNAVAILABLE | 활성화 후 DB 미설정·저장 실패 |

```json
{
  "code": "FEEDBACK_COOLDOWN",
  "message": "잠시 후 다시 작성해주세요.",
  "nextAllowedAt": "2026-10-25T00:00:15Z"
}
```

nextAllowedAt는 해당 없는 기능 오류에서 null. 공통 인증·Origin 오류는 기존 계약 사용.
네트워크 타임아웃·모달 닫기는 이미 커밋된 접수를 취소하지 않는다.

## 보관·탈퇴·DB

- 회원 ID만 저장. 닉네임·이메일·좌표·IP·JWT·로그인 세션 ID 사본은 저장하지 않는다.
- 기존 탈퇴 이벤트를 BEFORE_COMMIT에 수신해 같은 트랜잭션에서 작성자 ID·요청 키를 null로 한다.
  탈퇴 실패 시 함께 롤백. 본문에 이용자가 직접 적은 개인정보까지 자동 판별하는 기능은 아니다.
- 접수부터90일 보관. 10분 주기 정리에서 만료 행 삭제, 조회·동일 요청 복구는 정확한90일 경계 적용.
  보관 만료 뒤 같은 키는 새 요청으로 취급. 운영 백업의 보관 정책은 별도다.
- JPA FeedbackMessage → feedback_messages. 회원 잠금 → 기존 요청 → 위치·간격 → 저장·커밋.
  회원 DB 잠금으로 여러 요청을 직렬화하고 UNIQUE(user_id,request_key)로 중복을 추가 차단한다.
  DB 쓰기는 TableHub 잠금 밖이다. 인증·User 구현은 변경하지 않았다.
- 신규 V120__create_feedback_messages.sql은 별도 db/feedback 경로. 작성 전에 번호·목적을 알렸다.
  기존 V1~V6/V100/V110/V111·팀원 작업V112는 수정하지 않는다. V112 등 순서 조율 후 실제 DB에 적용한다.
  outOfOrder·repair·기존 SQL 수정을 자동 실행하지 않는다.

## 실행·연동

local,db 또는 dev,db 전용. prod/production에는 기능이 등록되지 않는다.
팀 마이그레이션 순서 조율 전에는 dev 기본 비활성(경로 미등록), 자동 마이그레이션 목록도 유지한다.

- local: ONTOP_FEEDBACK_ENABLED=true. dev: FEEDBACK_ENABLED=true.
- 기존 SPRING_FLYWAY_LOCATIONS 목록을 보존하면서 classpath:db/feedback 추가.
- 관리자: `ADMIN_READ_IDS=101,202`를 서버에 설정한다. DEV는 기존 `FEEDBACK_ADMINISTRATOR_IDS`도 대체 설정으로 받는다. 조회·지급 권한 구분은 [관리자 접근 정책](admin-access.md)을 따른다.
- 맵 변경 시 ontop.feedback.x/y/z를 실제 맵에 맞춘다. 맵 자동 생성 연동은 별도다.
- Postman OnTop Feedback의 접수·동일 키 복구·관리자 조회 사용(HTTP 원본24~26에도 포함). 기존 회원 로그인 계약 유지.

서버 구현·로컬 MySQL 검증과 FE 목업 교체·개발/운영 배포는 구분한다.

`ParkMessageFlowMySqlTests`는 실제 JWT→접속권→Raw WebSocket 입장→서버 위치 검사→REST/JPA/MySQL
접수→단절/재접속 재확인을 연결한다. 미입장·거리/높이 이탈 시 저장하지 않고, 같은 채널 상대에게 본문을
방송하지 않으며 일반 회원의 관리자 조회는403이다. 소켓이 끊긴 동안에도 같은 요청 영수증은 복구하지만
새 접수는409로 막고, 복귀 후에도 원래 접수 한 건만 유지한다.
물리 시간·서버 위치는 fixture이며 실제 걸어서 이동·FE 화면·개발 서버 배포와 구분한다.
기존 보관90일·탈퇴 연결 제거·트랜잭션 롤백 검증은 별도 검사에서 유지한다.

팀 문서: [접수 명세](https://app.notion.com/p/403161842b8680649780c08fd9f92345), [관리자 조회 명세](https://app.notion.com/p/403161842b86801d84c3c6d4dfa927f0).
