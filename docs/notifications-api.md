# 소리함 운영진 답변·개인 알림함

2026-11-07 로컬 구현. Jira S15P31B105-366. V158은 격리 MySQL 검증 완료이며 팀 번호·순서 확인 전 푸시·공용 DB 적용·배포를 보류한다.

## 흐름과 권한

회원이 기존 소리함에 의견을 작성하면 관리자는 기존 `/admin/feedback`에서 현재 닉네임·원문·처리 상태·최근 답변을 확인한다. 닉네임을 DB에 복사하지 않으며 공개 목록은 없다. 운영 관리자만 처리 상태를 바꾸거나 답변할 수 있다. 일반 회원에게는 본인 알림함만 제공한다.

기존 Access JWT·Origin/CORS·관리자 권한 정책을 재사용한다. `/admin/operations/**`의 운영 권한과 서비스 내부 권한을 모두 검사한다. 기존 인증 구현을 수정하지 않는다. 모든 응답은 `Cache-Control: no-store`다.

| 기능 | 메서드·경로 | 권한 |
| --- | --- | --- |
| 목록·전체 미읽음 개수 | GET /api/v1/notifications?limit=20&cursor=123 | 활성 회원 본인 |
| 상세 | GET /api/v1/notifications/{notificationId} | 수신자 본인 |
| 읽음 처리·상세 반환 | PATCH /api/v1/notifications/{notificationId}/read | 수신자 본인 |
| 답변·개인 알림 생성 | POST /api/v1/admin/operations/feedback/{receiptId}/replies | 운영 관리자 |
| 의견 처리 상태 변경 | PATCH /api/v1/admin/operations/feedback/{receiptId}/status | 운영 관리자 |

`db` 프로필과 기존 `ontop.feedback.enabled=true`가 필요하다. 미설정이면 503이며 브라우저에서 가짜 성공으로 대체하지 않는다. 실제 보상·응모권 지급·수령 API는 이번 범위에 없다. 보상 탭은 빈 상태만 표시한다.

## 관리자 요청

답변 본문은 NFC 정규화·제어문자 제거 후 1~2,000 UTF-16 단위의 일반 텍스트다. 줄바꿈·탭은 유지한다. 허용한 필드 외 추가 필드와 클라이언트 수신자 ID는 거절한다.

```json
{
  "operationId": "5467d58d-3f10-4df1-adb5-8d47bde7c227",
  "text": "알려주신 문제를 수정했습니다. 소중한 의견 감사합니다!",
  "status": "RESOLVED",
  "expectedVersion": 0
}
```

상태는 `RECEIVED`(접수), `REVIEWING`(확인 중), `RESOLVED`(완료). `expectedVersion`은 관리자 조회의 최신 값인 0 이상 정수다. 상태만 변경할 때에는 `status`, `expectedVersion` 두 필드만 보낸다. 상태 변경만으로 알림은 생성하지 않는다.

답변 성공은 200이며 `replyId`, `receiptId`, `notificationId`, `status`, `version`, `createdAt`을 반환한다. `operationId`는 소문자 표준 UUID다. 타임아웃·응답 유실 시 같은 UUID·본문·상태로 재전송하면 같은 답변·알림 ID를 반환하고 추가 알림을 만들지 않는다. 같은 키의 내용 변경은 409다. 새 답변에는 새 UUID를 사용한다.

관리자 목록의 추가 필드: `authorNickname`(탈퇴·없음 시 null), `status`, `version`, `latestReply`(없음 시 null; 있으면 id/text/createdAt). 기존 필드를 유지한다. 닉네임·최근 답변은 페이지 단위로 묶어 조회한다.

## 회원 알림

목록은 ID 내림차순, limit 기본 20·최대 50, cursor에는 이전 응답의 nextCursor를 사용한다. ID는 양수 십진 문자열이다. `unreadCount`는 현재 페이지가 아닌 본인 전체 유효 알림의 미읽음 개수다. 목록에 답변 본문이나 다른 사람의 식별 정보를 넣지 않는다.

```json
{
  "items": [
    {
      "id": "12",
      "type": "FEEDBACK_REPLY",
      "title": "운영진에게 메시지가 도착했어요",
      "createdAt": "2026-11-07T09:00:00Z",
      "readAt": null
    }
  ],
  "nextCursor": null,
  "unreadCount": 1
}
```

상세는 목록 항목에 `body`, `feedbackId`, `feedbackText`, `feedbackStatus`를 더한다. GET 상세는 읽음을 변경하지 않으며 PATCH 읽음은 본문 없이 요청하고 상세를 반환한다. 이미 읽은 알림의 `readAt`은 재요청해도 바뀌지 않는다. 읽은 메시지를 다시 볼 수 있다.

타인·만료·없는 알림은 동일한 404로 처리한다. 소리함 접수 시각부터 90일 경계를 답변·알림에도 적용한다. 답변을 늦게 보냈다고 보관 기간을 연장하지 않는다. 만료 의견 삭제 시 FK CASCADE로 답변·알림도 삭제한다. 기존 탈퇴 트랜잭션에서 개인 알림을 삭제하고 의견의 작성자·요청키 연결을 제거하며, 탈퇴 실패 시 함께 롤백한다.

## 실시간 알림과 UI

성공한 DB 커밋 이후 현재 접속한 수신자의 소켓에만 아래 변경 힌트를 보낸다. 본문·닉네임·회원 ID는 방송하지 않는다. 재연결 시 과거 이벤트를 재생하지 않고 REST 목록을 조회한다.

```json
{
  "requestId": null,
  "type": "PERSONAL_NOTIFICATION_CHANGED",
  "payload": {
    "notificationId": "12"
  }
}
```

알림함은 이벤트 수신 시 목록을 다시 조회한다. 이벤트 누락을 보완해 화면이 보이는 동안 10초마다 재조회하고, 숨겨진 탭에서는 폴링하지 않는다. 로그아웃·계정 변경·언마운트 시 요청을 취소하며 로컬 저장소에 개인 메시지를 남기지 않는다. 게임 집중 화면에서는 버튼·알림창·토스트를 숨긴다.

## 정합성과 오류

답변·처리 상태·개인 알림은 한 JPA 트랜잭션이다. 수신 회원 → 의견 순서로 잠그고 잠금 이후 의견을 refresh한다. 알림 서비스 트랜잭션에 국소 READ_COMMITTED를 적용해 잠금 대기 전 MySQL RR 스냅샷이 선행 커밋을 가리는 문제를 피한다. 상태 버전·UUID PK·알림 reply_id 유일 제약도 유지한다. DB 쓰기를 TableHub 잠금 안에서 수행하지 않는다. AFTER_COMMIT 이벤트는 전달 힌트이며 내구성의 기준은 REST로 조회하는 DB다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | INVALID_REQUEST | 필드·ID·본문·상태·페이지 오류 |
| 401 | UNAUTHENTICATED 또는 기존 인증 오류 | 로그인 필요 |
| 403 | FEEDBACK_OPERATION_REQUIRED 또는 기존 운영 권한 오류 | 운영 관리자 아님 |
| 404 | NOTIFICATION_NOT_FOUND | 본인 유효 알림·의견 없음 |
| 409 | IDEMPOTENCY_CONFLICT | 같은 요청 키의 내용 변경 |
| 409 | FEEDBACK_VERSION_CONFLICT | 최신 상태 재조회 필요 |
| 409 | FEEDBACK_RECIPIENT_UNAVAILABLE | 탈퇴한 작성자에게 답변 불가 |
| 503 | NOTIFICATION_NOT_CONFIGURED / NOTIFICATION_UNAVAILABLE | 저장소 미설정·저장 실패, 동일 키로 재확인 |

V158: `feedback_messages.status/version` 추가, `feedback_replies`, `personal_notifications` 생성. 기존 SQL·지갑·정산·회원 인증 코드는 변경하지 않는다. 배포 시 팀의 V158 번호·적용 순서 확인 → V158 적용 → BE → FE 순서로 확인한다. 실제 DEV 적용과 실제 계정 공동 검수는 아직 하지 않았다.
