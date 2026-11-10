# 관리자 API 접근 정책

관리자 권한은 Access JWT의 임의 클레임이 아니라, 요청마다 검증한 활성 회원의 내부 `user_id`와 서버 설정으로 결정한다. 설정이 없으면 관리자 권한을 부여하지 않는다.

## 서버 설정

| 환경변수 | 용도 |
| --- | --- |
| `ADMIN_READ_IDS` | 소리함·집계 조회가 가능한 내부 회원 ID의 쉼표 구분 목록 |
| `ADMIN_GRANT_IDS` | 일괄 엽전 지급이 가능한 내부 회원 ID의 쉼표 구분 목록 |
| `ADMIN_OPERATION_IDS` | 운영 상태 전환·일반 공지 관리가 가능한 내부 회원 ID의 쉼표 구분 목록 |
| `ADMIN_CONTACT_IDS` | 당첨자 전화번호 원문 조회가 가능한 내부 회원 ID 목록 |

`ADMIN_GRANT_IDS`와 `ADMIN_OPERATION_IDS`, `ADMIN_CONTACT_IDS`의 모든 ID는 `ADMIN_READ_IDS`에도 있어야 한다. 운영 전환 ID를
생략하면 기존 지급 관리자에게 운영 전환 권한을 부여한다. 누락되거나 양수가 아닌 ID가 있으면 앱 시작 시
설정 오류로 중단한다. 실제 값은 서버 환경 파일에만 보관한다. 기존 `FEEDBACK_ADMINISTRATOR_IDS`는
`ADMIN_READ_IDS`가 없을 때만 쓰는 전환용 대체값이다. 새 배포에는 `ADMIN_READ_IDS`를 사용한다.

## 경로별 권한

| 요청 | 필요 권한 |
| --- | --- |
| `/api/v1/admin/operations/skins/**` 및 목록 자체 | 운영 + 별도 `SKIN_ADMIN_USER_IDS`. [스킨 등록 계약](skin-registration-api.md) |
| `GET /api/v1/admin/me` | 조회 |
| `GET /api/v1/admin/events/winners` | 조회. 번호 끝 네 자리만 표시 |
| `GET /api/v1/admin/events/winners/{winnerId}/contact` | 별도 연락처 권한. 원문 조회를 감사 기록에 저장 |
| `GET /api/v1/admin/feedback` | 조회 및 기존 소리함 서비스의 활성 회원 확인 |
| `GET /api/v1/admin/analytics/**` | 조회 (후속 구현 예정) |
| `POST /api/v1/admin/wallet-grants/preview` | 지급 미리보기 |
| `POST /api/v1/admin/wallet-grants` | 지급 실행 |
| `GET /api/v1/admin/operations/status` | 운영 상태 조회 |
| `PUT /api/v1/admin/operations/status` | 운영 상태 전환 |
| `GET /api/v1/admin/operations/announcements` | 공지 관리(운영) |
| `POST/PUT/DELETE /api/v1/admin/operations/announcements/{id}` | 공지 관리(운영) |
| 그 밖의 `/api/v1/admin/**` | 거절 |

`GET /api/v1/admin/me`는 `{ "canRead": true, "canGrant": false, "canOperate": true, "canViewContacts": false }` 형식으로 현재
권한을 반환하며 캐시하지 않는다. 미로그인은 401, 권한이 없는 회원은 403이다. 프론트엔드의 화면 접근
처리는 서버 권한 검사를 대신하지 않는다.

일반 공지는 `/admin/announcements`에서 관리한다. 공원 회원 조회는 `GET /api/v1/announcements`이며
점검 모드 안내와 별개다. 신규 저장소 V148은 현재 로컬 작성만 완료했고 실제 DB 적용 전이다.
요청·예약 기간·충돌 처리 계약은 [공지 API](announcements-api.md)를 따른다.

관리자 화면은 로그인 후 `/admin` 주소로 직접 연다. 공원 UI에는 관리자 진입 메뉴를 두지 않는다. 화면도 `/api/v1/admin/me`로 권한을 확인한 뒤 소리함 목록을 표시하며, 일반 회원에게는 권한 없음 화면을 보여준다. `/admin/feedback` 주소로 직접 들어와도 같은 권한 확인을 거친다.

소리함 테이블은 공통 Flyway V127로 적용되지만 API는 `FEEDBACK_ENABLED`가 true일 때만 등록된다.
관리자 권한 설정만으로 소리함 저장 기능이 켜지지는 않는다.

## 전 회원 엽전 지급

일괄 지급은 탈퇴하지 않은 활성 회원만 대상으로 한다. 먼저 `POST /api/v1/admin/wallet-grants/preview`에
1인당 지급액과 사유를 보내 대상 인원, 누락 지갑 수, 총 지급액을 확인한다. 실행 가능 여부가 true일 때만
클라이언트가 새 UUID를 만들고, 미리보기에서 받은 대상 인원을 함께 `POST /api/v1/admin/wallet-grants`로 보낸다.

```json
{
  "amountPerMember": 100,
  "reason": "출시 기념"
}
```

```json
{
  "requestId": "378eb951-f173-4ca2-bdfc-eb291054777f",
  "amountPerMember": 100,
  "reason": "출시 기념",
  "expectedRecipientCount": 30
}
```

- 1인당 지급액은 1~1,000,000냥, 사유는 공백을 제외한 1~200자다.
- 미리보기 이후 대상 인원이 달라지거나 활성 회원의 지갑이 누락되면 409로 거절한다.
- 실행 시작 시점의 활성 회원 ID를 지급 대상으로 고정하고, 지갑만 ID 순서로 잠근다.
- 잔액, `ADMIN_BULK_GRANT` 원장, 배치 감사 기록은 한 트랜잭션에 저장한다.
- 같은 `requestId`와 같은 내용의 재요청은 기존 실행 결과를 반환하고 재지급하지 않는다.
- 같은 `requestId`를 다른 관리자나 다른 지급 내용으로 사용하면 409로 거절한다.
- V142가 배치와 회원별 지급 감사 테이블을 생성한다. 이미 적용된 V141 뒤에 순서대로 적용해야 한다.
