# 당첨자 연락처 API와 보관 정책

Jira S15P31B105-356. 당첨 결과는 `event_winners`가 원본이다. 연락처 API는 `dev,db` 또는 `prod,db`
프로필과 `EVENT_CONTACT_ENABLED=true`에서만 동작한다. DB에는 공통 V153·V155가 먼저 적용되어야 한다.

## 회원 API

| 요청 | 동작 |
| --- | --- |
| `GET /api/v1/events/winnings/me?weekStart=2026-11-02` | 로그인 회원의 발표된 당첨 내역. 주차 생략 시 최근 최대 100건 |
| `PUT /api/v1/events/winnings/weeks/{weekStart}/contact` | `{"phone":"010-1234-5678"}`로 본인 연락처 제출·수정 |

회원 ID는 Access JWT에서 검증된 내부 ID만 사용한다. 클라이언트가 임의의 회원 ID를 지정할 수 없다.
결과가 확정되고 `announces_at`도 지난 당첨만 표시한다. 실제 발표 시각은 두 값 중 늦은 시각이다.
각 당첨 항목은 부문·등수·상품·제출 마감 시각·연락처 상태를 반환한다. 같은 KST 주차에 여러 부문에서
당첨되면 연락처 한 건을 공유한다. `weekStart`는 KST 월요일 날짜다.

휴대전화 번호는 하이픈·공백을 제거한 국내 `010` 11자리 또는 `011`·`016`·`017`·`018`·`019`
10~11자리로 확인한다. 발표 후 7일이 되는
시각부터 제출·수정을 거절한다. 같은 번호 재요청은 기존 암호문과 제출 시각을 유지한다. 다른 번호로
수정해도 최초 제출 시각 및 만료 시각은 바뀌지 않는다. 최초 입력 14일 후 번호 조회를 즉시 차단하며,
주기적 정리 작업이 암호문 행을 삭제한다. 당첨 이력과 최초 제출·만료 메타데이터는 남아 관리자 화면에
`EXPIRED`를 표시할 수 있다. 상태는 `NOT_SUBMITTED`, `SUBMITTED`, `EXPIRED` 중 하나다.

## 관리자 API

| 요청 | 필요 권한 | 반환 |
| --- | --- | --- |
| `GET /api/v1/admin/events/winners?weekStart=&type=&contactStatus=&limit=50&offset=0` | `ADMIN_READ_IDS` | 당첨자 목록·상태·마스킹 번호. `type`은 `RAFFLE`, `BUNGEOPPANG`, `JUMPMAP`, `ASSET_VALUE`; `limit` 1~100 |
| `GET /api/v1/admin/events/winners/{winnerId}/contact` | `ADMIN_CONTACT_IDS` | 만료 전 번호 원문. 성공한 조회마다 관리자·당첨자·시각을 DB에 기록 |

모든 API 응답은 `Cache-Control: no-store`다. 번호 원문은 목록·공개 랭킹·오류·애플리케이션 로그에
포함하지 않는다. 원문 조회 감사 기록이 저장되지 않으면 조회 자체가 실패한다. 관리 화면에서는 목록을
기본 마스킹하고 GM이 원문 조회 버튼을 누를 때만 두 번째 API를 호출한다. `GET /api/v1/admin/me`의
`canViewContacts`로 버튼 노출 여부를 결정할 수 있다.

## 서버 설정 및 키 관리

서버의 저장소 밖 `app.env`에 다음 값을 설정한다. 실제 키를 Git·Jira·채팅·빌드 로그에 넣지 않는다.

```text
ADMIN_READ_IDS=<GM 내부 회원 ID>
ADMIN_CONTACT_IDS=<원문 조회할 GM 내부 회원 ID>
EVENT_CONTACT_ENABLED=true
EVENT_CONTACT_ACTIVE_KEY_ID=contact-2026-11
EVENT_CONTACT_KEYS=contact-2026-11=<32바이트 난수의 Base64>
```

32바이트 키는 서버의 안전한 셸에서 `openssl rand -base64 32`로 만든다. 활성 키 ID는 키 목록에 있어야
하며 누락·잘못된 길이는 기능을 켠 앱의 시작을 막는다. 암호화는 AES-256-GCM이고 매 저장마다 새 nonce를
사용하며 회원 ID·주차를 추가 인증 데이터로 묶는다. 키 교체는 새 키를 목록에 추가하고 활성 ID를 바꾼다.
기존 연락처가 모두 삭제될 때까지 이전 키는 목록에 남겨야 한다. 키 ID만 DB에 저장하고 키 원문은
서버 환경 파일에만 둔다. DEV와 운영은 서로 다른 키를 사용한다.

암호문 삭제는 DB의 현재 행에 적용된다. 과거 백업에는 만료 전 스냅샷의 암호문이 남을 수 있으므로,
실제 운영 보관 정책을 확정할 때 백업 수명도 함께 확인한다. 만료 전에도 경품 전달을 마쳐야 한다.
