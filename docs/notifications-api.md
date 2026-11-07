# 소리함 운영진 답변·개인 알림함

2026-11-07 구현. Jira S15P31B105-366. 사용자 요청으로 최신 dev와 뽑기를 통합하고 V157~V160 검증 후 dev 대상 MR을 준비한다. 공용 DB 적용·배포·실제 계정 인수는 별도다. 아래 로컬 단계의 권한·미병합 설명은 당시 이력이며 현재 통합 검증은 마지막 절을 따른다.

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

`db` 프로필과 기존 `ontop.feedback.enabled=true`가 필요하다. 미설정이면 503이며 브라우저에서 가짜 성공으로 대체하지 않는다. 아래 보상 확장은 V160 로컬 구현이며, 뽑기권은 의상 뽑기용 `gacha_inventory.tickets`다. 주간 이벤트의 `raffle_tickets`(응모권)와 구분한다.

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

알림함은 이벤트 수신 시 목록을 다시 조회한다. 이벤트 누락을 보완해 화면이 보이는 동안 10초마다 재조회하고, 숨겨진 탭에서는 폴링하지 않는다. 로그아웃·계정 변경·언마운트 시 요청을 취소하며 로컬 저장소에 개인 메시지를 남기지 않는다. 게임 집중 화면에서는 버튼·알림창·토스트를 숨긴다. 알림함을 열고 닫을 때 위아래 봉과 노출 영역을 420ms 동안 움직이는 두루마리 효과를 적용한다. 일반 닫기는 접기 종료 후 창을 제거하고, 접는 중 입력·늦은 상세 응답을 차단한다. 게임 전환·인증 종료는 즉시 닫고, 기기의 동작 줄이기 설정에서는 애니메이션을 생략한다.

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

## 수령형 보상 · V160 로컬 확장

관리자 페이지의 기존 **엽전 지급** 메뉴 안에 **알림함으로 선물 보내기**를 추가했다. 기존 전 회원 즉시 지급과 구분하며, 이 기능은 단일 활성 회원에게 알림만 발송한다. 수령 전에는 재화를 늘리지 않는다. 발급은 기존 `ADMIN_GRANT`/`canGrant` 권한을 재사용한다. 운영 답변 권한만으로 재화를 발급할 수 없다.

| 기능 | 메서드·경로 | 권한 |
| --- | --- | --- |
| 한 회원에게 수령형 보상 발송 | POST /api/v1/admin/wallet-grants/rewards | 재화 지급 관리자 |
| 본인 보상 수령·영수증 재확인 | POST /api/v1/notifications/{notificationId}/claim | 수신자 본인 |

발송 요청 예시(수량·기한은 예시이며 고정 지급 규칙이 아니다):

```json
{
  "operationId": "5467d58d-3f10-4df1-adb5-8d47bde7c227",
  "userId": "202",
  "kind": "GACHA_TICKET",
  "amount": 3,
  "title": "소중한 의견 감사합니다",
  "text": "온탑에서 보내는 작은 선물입니다.",
  "expiresAt": "2030-01-01T00:00:00Z"
}
```

`kind`는 `COIN`(엽전) 또는 `GACHA_TICKET`(의상 뽑기권). `userId`는 내부 회원 ID의 십진 문자열, `amount`는 1~9,007,199,254,740,991의 안전한 정수다. 제목 1~100자, 본문 1~1,000자(UTF-16 길이, NFC·제어문자 제거), 기한은 미래 UTC Instant·밀리초 정밀도다. MySQL TIMESTAMP 범위에 맞게 2038-01-19T03:14:07Z 이하만 허용한다. UI에서는 관리자 로컬 시각 입력을 ISO UTC로 변환한다. 발송 전 수신자 ID·수량·기한을 확인한다. 성공은 `operationId`, `notificationId`, `createdAt`이다.

실패/응답 유실은 같은 UUID와 같은 내용을 재전송한다. 같은 키로 종류·수량·회원·본문·기한을 바꾸면 409다. 네트워크/503은 입력과 UUID를 잠그고 같은 요청 재확인만 제공하며, 확정 거절 400/403/404/409는 입력 수정을 허용한다. 보상 수정·회수·일괄 발급은 이번 기능에 포함하지 않는다.

목록 `type: "REWARD"`에는 아래 `reward` 필드가 추가된다. 기존 답변은 `reward: null`이며 기존 필드를 유지한다. 보상 상세의 `body`는 관리자 메시지, `feedbackId/feedbackText/feedbackStatus`는 null이다. 상세 조회/읽음은 보유량을 늘리지 않는다.

```json
{
  "kind": "GACHA_TICKET",
  "amount": 3,
  "expiresAt": "2030-01-01T00:00:00Z",
  "claimedAt": null
}
```

수령 요청은 본문 없음 또는 `{}`만 허용한다. 클라이언트가 회원 ID·종류·수량을 제출할 수 없다. 성공/같은 요청 재확인은 200이며 아래 최초 영수증을 유지한다. `balanceAfter`와 `ticketsAfter`는 **최초 수령 당시** 값이며 현재 잔액 조회가 아니다. 후속 구매·뽑기 후 재수령해도 재화를 추가하지 않는다.

```json
{
  "notificationId": "12",
  "kind": "COIN",
  "amount": 1000,
  "claimedAt": "2026-11-07T09:02:00Z",
  "balanceAfter": 1100,
  "ticketsAfter": null
}
```

뽑기권은 `balanceAfter: null`, `ticketsAfter: 정수`다. 기존 답변의 90일 보관 규칙과 달리 보상은 관리자가 입력한 기한까지 노출·수령한다. 미수령 만료는 410, 이미 수령한 보상은 만료 뒤에도 같은 영수증을 재확인할 수 있다. 탈퇴 시 기존 개인 알림 삭제에 FK CASCADE로 보상도 삭제한다. 엽전 원장은 별도로 보존하며 재지급하지 않는다.

### 지급 정합성·의존성

발급/수령은 회원 공유 잠금 → 지갑 배타 잠금 → 보상 행 잠금 순서다. 기존 `Wallet.creditAdminGrant`를 호출하고 엽전은 `wallet_transactions.transaction_type=NOTIFICATION_REWARD`, 멱등키 `notification-reward:<UUID>`로 기록한다. 뽑기권은 기존 V157 `gacha_inventory.tickets`만 증가시키며 상자·기계 회차는 바꾸지 않는다. 팀원 엔티티/정산/인증 제품 코드를 수정하지 않기 위해 모듈 내부 저장 경계에서 JPA native SQL로 공통 원장·기존 티켓 테이블을 사용한다. 신규 JDBC 저장 구현은 없다.

보유량 증가·원장·`claimed_at`·읽음은 같은 트랜잭션이며 실패 시 전부 롤백한다. 뽑기권 감사 이력은 보상 행과 최초 수령 영수증이다. 수량/총 보유량의 long overflow와 JS 안전 정수 초과를 409로 막는다. 신규 발송과 최초 수령 커밋 후 기존 수신자 전용 `PERSONAL_NOTIFICATION_CHANGED`를 사용한다.

FE는 리스트의 받기·수령 완료와 중앙 보상 팝업(뒤 알림함 기준 약간 위, `+` 없는 수량)을 제공한다. 수령 완료 시 현재 회원의 지갑을 권위 API로 재조회한다. `ontop:gacha-inventory-changed`는 뽑기 보유량 재조회용 FE 힌트이며 미병합 뽑기 FE의 실제 구독 연결은 별도 통합 확인이 필요하다. 알림함 자체는 REST 재조회로 완료 상태를 확인한다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 403 | REWARD_GRANT_REQUIRED 또는 기존 ADMIN_GRANT 거절 | 재화 지급 권한 필요 |
| 409 | REWARD_RECIPIENT_UNAVAILABLE / WALLET_NOT_READY | 활성 회원·지갑 초기화 확인 |
| 409 | REWARD_CAPACITY_EXCEEDED | 총 보유량의 정수 범위 초과, 지급 없음 |
| 410 | REWARD_EXPIRED | 미수령 보상 기한 만료 |
| 503 | REWARD_UNAVAILABLE | 저장소·필수 V157 미설정·지급 실패, 같은 요청 재확인 |

V160은 `personal_notifications.reply_id`를 nullable로 확장하고 `notification_rewards`를 추가한다. 기존 V158·V159 SQL은 수정하지 않는다. V158이 먼저 필요하고 뽑기권은 미병합 V157 저장소와 함께 적용해야 한다. 번호·순서 확인 후 스키마 → BE → FE로 인수한다. 이번 권한은 V160 로컬 작성·격리 DB 검증·로컬 커밋이며 푸시·MR·공용 DB·배포는 하지 않는다.


## 관리자 회원별 보상 관리 · 2026-11-07 로컬

관리자 메뉴는 **보상 관리**로 표시한다. 닉네임 전체 또는 내부 회원 ID 검색 → 닉네임/ID 선택 → 기존 발급 폼 확인·발송 → 회원별 내역 조회 순서다. 전 회원 즉시 엽전 지급은 기존 기능으로 분리한다.

- GET /api/v1/admin/wallet-grants/rewards/recipients?query=닉네임또는ID: 활성 회원 정확 검색. 최대20건의 [{userId,nickname}]. 이메일·로그인 식별자 등 비노출. 검색어 NFC 정규화·공백 제거·1~19자, 제어문자 거절. 부분검색 아님.
- GET /api/v1/admin/wallet-grants/rewards?userId=202&cursor=123: 해당 회원 발송 이력. 최신 ID 순20건, {items:[{notificationId,title,kind,amount,createdAt,expiresAt,claimedAt,status}],nextCursor}. claimedAt와 nextCursor는 nullable. status는 PENDING(수령 대기), CLAIMED(수령 완료), EXPIRED(미수령 기한 만료). 수령한 뒤 만료돼도 CLAIMED다. 조회는 보존 중인 내역이며 회원 탈퇴 시 기존 알림 삭제 정책을 따른다.
- 두 GET 모두 ADMIN_GRANT와 활성 관리자 canGrant 확인, no-store. 읽기 관리자만으로는 조회 불가. 잘못된 ID/커서/검색어400. 기존 인증 오류·저장소503 계약 유지.
- 확인/발송 중에는 회원 변경 금지. 확정 거절은 입력 수정, 응답 유실은 같은 UUID로 재시도한다. 성공하면 이력을 다시 불러온다. 관리자 새로고침으로 수령 상태 확인, 이전 내역 더 보기 제공.
- 보상 종류/수량/제목/메시지/기한/수령 처리는 기존 공통 발급·수령 경계를 재사용한다. 향후 종류 추가 시 명시적 kind 및 해당 재화 처리/검증을 추가한다. 임의 종류를 신뢰하지 않는다.
- 추가 SQL·스키마 변경 없음. V160 로컬 승인 및 V157 티켓 통합 의존성은 기존과 같다. 푸시·배포 없음.

검증: 단독 작업 당시 격리 MySQL15건(관리자 조회3건 포함), FE 단위25건, 브라우저8건(관리자 선택/발송/수령상태 포함, 인증·REST 대역) 통과. 독립 읽기전용 리뷰 새 P1/P2 없음. API 인벤토리2개를 추가해 실제 OpenAPI 재생성 검사16건 통과. Postman 로컬10예제 생성, 웹 저장 미확인.

### 공원 알림 UI 정리 · 로컬
알림 버튼은 프로필 아래 같은 HUD 배경·축척을 사용하고, 프로필 위치가 공지/반응형으로 바뀌어도 함께 배치한다. 새 소식은 큰 문장형 토스트 대신 버튼 아래 금색 봉투 아이콘·테두리와 17px 제목/13px 보조문구의 안내 카드로 5초 표시한다. 알림함을 열면 바로 숨긴다. 닫기는 뽑기 화면과 같은 짙은 나무색·밝은 X·얇은 테두리로 두루마리 위 봉에 겹쳐 배치했다. 펼침/접힘·키보드 포커스·게임 중 숨김은 유지한다. 보상 그림을 기존 엽전/티켓 리소스 3개 조합으로 보강하고, 짧은 목록에서도 수령 팝업 제목이 잘리지 않게 공간·포커스 스크롤을 보완했다. 지급/수령 API와 스키마 변경 없음. 실제 UI 캡처와 시안을 구분한다.
읽음 표시는 readAt 기준으로 안 읽음에 작은 붉은 점·안 읽음 접근성 텍스트, 읽음에 회색빛 배경/글자·읽음 라벨을 사용한다. 기존 왼쪽 초록선은 제거한다. 보상 수령 claimedAt와 별개이며 읽은 보상의 받기 버튼은 활성 상태를 유지한다.

### 뽑기와 통합 · 2026-11-07

최신 dev43ef65ec의 이벤트/운영/공지 메뉴를 보존하고 보상 관리 화면에 회원별 발급·수령 이력과 기존 전체 엽전 지급을 함께 연결했다. 읽기 관리자에게 지급 메뉴를 노출하지 않으며 서버의 지급 권한 검증을 유지한다.

V157~160은 동일 classpath의 원본 SQL로 새 격리 DB에 순서대로 적용했다. 미병합 V157을 임시 filesystem에서 복사하던 테스트 의존성은 제거했다. 기존 SQL/Flyway 이력을 수정하지 않고 상점 V100/V152와 함께 검증했다. 실제 알림 보상 수령→가챠 HTTP 추첨/개봉/구매·동시 수령/추첨을 포함해 MySQL36건 통과. 개인정보/외부 로그인·실상품·개발/운영 배포 검증은 아니다.

기존 알림 컴포넌트 브라우저8건, 실제 공원 제품 컴포넌트의 알림/수령·열린 기계 재고 갱신3건, 관리자 조회·전체 지급·권한 보호8건 통과. 브라우저 인증/HTTP/WS는 테스트 대역이며 실제 DB 저장 검증은 별도 HTTP/MySQL 검사다. FE 전체 단위2694건 통과(기존8스킵). 저장 후 동기화는 변경 알림→GET이며 클라이언트가 보상액을 직접 가산하거나 자동 추첨하지 않는다.

사용자 요청에 따라 통합 검증 후 커밋·푸시·dev 대상 MR까지 진행하고 병합은 사용자가 수행한다. 공용 DB/배포는 이 단계에서 직접 적용하지 않는다. 기존 Notion/웹 Postman 반영 미확인 항목은 저장소 계약 생성·검증과 구분한다.
최종 기준은 df32a4d0까지 포함한 통합 브랜치다. FE전체2695통과/8기존스킵, 오목 후속 브라우저1건, BE전체3494건(27기존스킵)실패/오류0·마지막 명세 HTTP/규칙/OpenAPI11건 재검증 및 운영JAR 성공. 원본 SQL4개·README·팀 인프라 설정은 수정하지 않았다. 실제 개발 서버 배포/인수는 병합 이후 확인한다.
