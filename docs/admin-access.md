# 관리자 API 접근 정책

관리자 권한은 Access JWT의 임의 클레임이 아니라, 요청마다 검증한 활성 회원의 내부 `user_id`와 서버 설정으로 결정한다. 설정이 없으면 관리자 권한을 부여하지 않는다.

## 서버 설정

| 환경변수 | 용도 |
| --- | --- |
| `ADMIN_READ_IDS` | 소리함·집계 조회가 가능한 내부 회원 ID의 쉼표 구분 목록 |
| `ADMIN_GRANT_IDS` | 일괄 엽전 지급이 가능한 내부 회원 ID의 쉼표 구분 목록 |

`ADMIN_GRANT_IDS`의 모든 ID는 `ADMIN_READ_IDS`에도 있어야 한다. 누락되거나 양수가 아닌 ID가 있으면 앱 시작 시 설정 오류로 중단한다. 실제 값은 서버 환경 파일에만 보관한다. 기존 `FEEDBACK_ADMINISTRATOR_IDS`는 `ADMIN_READ_IDS`가 없을 때만 쓰는 전환용 대체값이다. 새 배포에는 `ADMIN_READ_IDS`를 사용한다.

## 경로별 권한

| 요청 | 필요 권한 |
| --- | --- |
| `GET /api/v1/admin/me` | 조회 |
| `GET /api/v1/admin/feedback` | 조회 및 기존 소리함 서비스의 활성 회원 확인 |
| `GET /api/v1/admin/analytics/**` | 조회 (후속 구현 예정) |
| `/api/v1/admin/wallet-grants`, `/api/v1/admin/wallet-grants/**` | 지급 (후속 구현 예정) |
| 그 밖의 `/api/v1/admin/**` | 거절 |

`GET /api/v1/admin/me`는 `{ "canRead": true, "canGrant": false }` 형식으로 현재 권한을 반환하며 캐시하지 않는다. 미로그인은 401, 권한이 없는 회원은 403이다. 프론트엔드의 화면 접근 처리는 서버 권한 검사를 대신하지 않는다.

관리자 화면은 로그인 후 `/admin` 주소로 직접 연다. 공원 UI에는 관리자 진입 메뉴를 두지 않는다. 화면도 `/api/v1/admin/me`로 권한을 확인한 뒤 소리함 목록을 표시하며, 일반 회원에게는 권한 없음 화면을 보여준다. `/admin/feedback` 주소로 직접 들어와도 같은 권한 확인을 거친다.

소리함 테이블은 공통 Flyway V127로 적용되지만 API는 `FEEDBACK_ENABLED`가 true일 때만 등록된다.
관리자 권한 설정만으로 소리함 저장 기능이 켜지지는 않는다.
