# 두 계정 로컬 연동 테스트

## 개발 서버 공원 진입

2026-10-23 인프라 안내 기준 개발 BE는 `https://dev-api.on-top.world`, 운영 BE는
`https://api.on-top.world`다. 이번 공원 진입 수정의 배포 대상은 개발 서버만이다.
개발 WebSocket은 `wss://dev-api.on-top.world/ws/tables?ticket=<매번 새 접속권>`을 사용한다.

개발 배포는 수정 소스로 이미지를 다시 빌드하고, 서버의 `compose.dev.yaml`도 함께 갱신해
`SPRING_PROFILES_ACTIVE=dev,db`를 적용해야 한다. 기존 이미지의 프로필만 바꿔서는 해결되지 않는다.
Compose 변경은 현재 Jenkins 분류에서 `MANUAL_REVIEW=1`이므로 자동 이미지 발행·배포가 생략된다.
인프라 담당자가 수정 이미지와 서버 Compose를 함께 반영한 뒤 실제 회원 Access로
`GET /api/v1/channels`와 `GET /api/v1/tables?channelId=channel-1`의 200,
새 접속권으로 WSS 연결 및 `CHANNEL_JOIN` 성공을 확인한다. 비밀키·DB 데이터는 변경하지 않는다.

개발 설정의 채널은 `channel-1`(개발 공원, 정원 40)이다. 테이블 ID는 조회 응답을 사용한다.
개발 조회 API는 공통 REST 인증·CORS 정책을 유지한다. `/dev/tables`, `/dev/world-config`,
local 전용 게임 시작·정산 대역은 활성화하지 않는다. 게임 엔진·판돈 예약/정산의 실제 배포와
프론트의 공원 테이블 모델 매핑은 별도 확인이 필요하며, 공원 입장 복구만으로 완료로 보지 않는다.
이 문서의 주소·절차는 실행 결과가 아니며 실제 원격 배포 확인은 별도다.

## 주소와 실행

### 상점·보유·의상 장착 활성화

SHOP-01/02·INVENTORY-01/02는 local/dev에서 등록한다. dev,db의 SHOP_ENABLED는 기본 false다.
기존 V100 적용 이력·Flyway 버전 순서를 확인한 뒤 기존 locations에 classpath:db/shop을 추가하고 활성화한다.
공유 DB가 이미 V110/V111 이상이면 낮은 V100 적용 절차를 DB 담당과 먼저 조율한다.
이 작업에서 Flyway 경로/이력·데이터를 자동 변경하지 않는다. 코드 등록과 실제 dev 배포/상품 준비는 구분한다.
활성화 후 구매 → 본인 보유 → 의상 장착 → 같은 채널 equipment 반영·재접속 복구를 확인한다.
HTTP/WS 필드는 기존 계약과 같으며 실제 3D 에셋·렌더링은 FE 검수 대상이다. 상세는 [상점 안내](shop-inventory.md).
Postman 예제의 Origin={{baseUrl}}는 허용된 실제 프론트 주소로 바꾸거나 비브라우저 테스트에서 제외한다.
API 호스트를 프론트 Origin과 같은 값으로 가정하지 않는다.

### 경기 시작·엔진·복구·결과 활성화

경기 연결부와 네 엔진 설정은 `local`/`dev`에서 등록할 수 있다(`prod`/`production` 혼합 시 제외).
dev에서는 `GAME_START_ENABLED=true`와 사용할 엔진의 `GAME_OMOK_ENABLED`, `GAME_FARKLE_ENABLED`,
`GAME_ONECARD_ENABLED`, `GAME_BRIDGE_ENABLED`를 명시적으로 켠다. 기본값은 모두 false다.
실제 DB `GameStartGateway`가 없으면 시작 옵션을 켠 서버는 기동하지 않는다.
실제 `GameResultGateway`와 정산 커밋 알림도 연결해야 저장 결과 조회·다음 판 전환이 완성된다.
인증 설정·메시지 필드는 유지하며 local 시연용 예약 대역은 dev에 등록하지 않는다.
소스 등록 범위 변경이며 실제 개발 서버 활성화·DB 정산 검증·배포 완료를 뜻하지 않는다.
dev 단독 프로필의 JWT/접속권·착석·준비·예약 확정·엔진·복귀·결과 알림 테스트는
`DevCommittedStartFlowTests`이며 회원 조회/예약/결과 저장은 테스트 대역이다.

### 소리함·익명 메모 활성화 전 확인

두 API는 dev 기본 비활성이다. **V112·V120·V121 적용 순서를 팀과 맞춘 뒤에만** 실제 공유 DB에 적용한다.
기존 Flyway locations/이력/데이터를 보존하며 repair·outOfOrder·초기화를 자동 실행하지 않는다.

- dev,db: `FEEDBACK_ENABLED=true`, `FEEDBACK_ADMINISTRATOR_IDS=<관리자 회원 ID 목록>`.
- dev,db: `NOTES_ENABLED=true`, `NOTES_PRIVACY_SECRET=<32자 이상 전용 비밀키>`.
- 기존 `SPRING_FLYWAY_LOCATIONS` 목록에 `classpath:db/feedback`, `classpath:db/notes`를 추가한다.
  공통·미니게임·상점·경기 등 기존 활성 경로를 두 경로로 덮어쓰지 않는다.
- 일반 `.env`는 자동 로딩되지 않는다. 실행 환경변수에 지정한다. 아래 로컬 실행기는 별도 허용 목록의
  `.env.frontend-test`를 사용하므로 이 옵션을 그 파일에 임의 추가하면 거절된다.
- 프론트는 현재 두 서비스가 `unavailable`이다. REST 포트 연결과 ISO 시각→ms 변환이 필요하다.
  API 본문에 FE 내부 userId/position을 보내지 않는다. 메모 재시도 키는 시각 포함 동일 키를 유지한다.

2026-10-25 `ParkContentDevMySqlTests`로 **별도 빈 MySQL DB**에서 실제 dev 환경변수,
공통+미니게임+소리함+메모 스키마를 함께 켜서 접수·재시도·관리자 조회·익명 목록·미니게임 시작/조회/포기를
검증했다. 팀원 인증/FE 코드는 변경하지 않았고 실제 공유 DB/서버에는 적용하지 않았다.
REST·WS는 실제 회원 인증을 사용하며 위치는 서버 fixture/고정 물리 시간으로 준비한다.
브라우저 쿠키·3D UI·보상 지급·개발 서버 배포의 완료를 뜻하지 않는다.

검증 재현은 backend 폴더에서 실행한다. 테스트는 기존 회원이 있는 DB를 거절하고 삭제하지 않는다.

```powershell
$env:TEST_PARK_CONTENT = 'true'
$env:TEST_PARK_CONTENT_DB_URL = 'jdbc:mysql://127.0.0.1:<port>/ontop_content_test_dev_<unique>?serverTimezone=UTC'
$env:TEST_PARK_CONTENT_DB_USERNAME = '<test-db-user>'
$env:TEST_PARK_CONTENT_DB_PASSWORD = '<test-db-password>'
.\gradlew.bat mysqlTest --tests 'com.ssafy.ontop.table.ParkContentDevMySqlTests'
```

### 두 계정 로컬 실행

- BE: `http://localhost:8080`
- WebSocket: `ws://localhost:8080/ws/tables?ticket=<매번 새 접속권>`
- 프론트: `http://localhost:5173`
- 프로필: `local,db,frontend-test`
- 상태 확인: `GET http://localhost:8080/actuator/health`

이 주소는 **백엔드를 실행한 PC 안에서만** 접속한다. 두 계정은 같은 BE에 접속해야 하므로
같은 PC의 일반 창·시크릿 창 또는 서로 다른 브라우저에서 테스트한다.
다른 팀원 PC에서 이 PC의 localhost로 접속할 수는 없다.

처음 실행하는 PC에서는 MySQL에 빈 `ontop_frontend_test` DB를 준비하고
`.env.frontend-test.example`을 `.env.frontend-test`로 복사해 DB와 OAuth 설정을 입력한다.
이 파일은 Git 제외이며 실제 비밀키를 공유 문서·Postman 공유 환경에 넣지 않는다.
JWT 키는 안전한 난수 32바이트 이상을 Base64로 인코딩한 값을 사용한다.
실제 회원 DB·상점 테스트 DB와 다른 스키마이며 임의 로그인 우회 계정을 만들지 않는다.

저장소 루트에서 실행한다. 기존 8080 서버가 있으면 실행기가 덮어쓰거나 종료하지 않는다.

```powershell
.\scripts\start-frontend-test.ps1 -Check
.\scripts\start-frontend-test.ps1
```

실행기는 환경 파일의 허용된 KEY=value만 읽는다. PowerShell 코드로 평가하지 않으며
출력에 비밀값을 쓰지 않는다. 프로필·인증 필수 설정을 적용하고 종료 시 호출 프로세스의
환경변수를 복구한다. `-Background`는 별도 숨김 Java 프로세스로 실행하며 출력한 PID로 식별한다.
기본 포트는 OAuth 콜백과 맞춘 8080으로 고정한다.

기존 프론트의 `/api/v1` Vite 프록시 기본 대상은 `http://127.0.0.1:8080`이다.
브라우저 주소는 localhost로 통일한다. WebSocket 프록시는 없으므로 소켓은 위 BE 주소로 직접 연결한다.
프론트 주소를 바꾸면 `FRONTEND_ORIGIN`과 `AUTH_FRONTEND_CALLBACK_URI`를 함께 바꾸고 BE를 재시작한다.

프론트 의존성이 설치된 상태에서 별도 터미널로 실행한다.

```powershell
cd frontend
corepack pnpm dev --host localhost --port 5173 --strictPort
```

## 로그인

1. 각 브라우저에서 서로 다른 실제 회원 계정으로 로그인한다.
   SSAFY는 프론트의 로그인 버튼 또는 `http://localhost:8080/api/v1/auth/ssafy/authorize`로 진입한다.
   네이버 서버 진입 URL은 `http://localhost:8080/api/v1/auth/naver/authorize`이다.
2. OAuth 제공자 앱에 다음 callback URI가 등록되어 있어야 한다.
   - SSAFY: `http://localhost:8080/api/v1/auth/ssafy/callback`
   - 네이버: `http://localhost:8080/api/v1/auth/naver/callback`
3. BE는 `http://localhost:5173/auth/callback#exchange_code=...`로 돌려보낸다.
   기존 프론트가 같은 브라우저 쿠키로 교환하며 신규 회원은 닉네임·캐릭터 설정을 완료한다.
4. Access JWT를 Bearer로 `POST /api/v1/auth/websocket-ticket`에 보낸다.
   프론트에서 직접 호출할 때도 `Origin: http://localhost:5173`은 브라우저가 넣는 실제 출처를 사용한다.
5. 받은 접속권으로 WebSocket에 연결한다. 접속권은 최대 30초·1회용이며 재접속마다 다시 발급한다.
   임의 userId나 제공자 토큰을 소켓 인증으로 보내지 않는다.

같은 회원의 살아 있는 연결은 중복 접속이 거절된다. 두 계정 검증에는 서로 다른 내부 회원 ID가 필요하다.
로컬 HTTP용 Secure=false 쿠키 설정은 이 명시적 테스트 프로필에 한정하며 인증은 계속 필수다.
OAuth 제공자 권한·실제 계정 로그인은 사용자가 직접 확인한다.

## 채널과 테이블

채널은 `channel-1`(A), `channel-2`(B), 각각 정원 4명이다. 두 계정 모두 `channel-1`로 입장한다.
실제 목록은 인증된 `GET /api/v1/channels`, `GET /api/v1/tables?channelId=channel-1`에서 조회한다.

| 채널 | 전송할 tableId | 공원 모델 ID | 좌표 X / Y / Z (m) |
| --- | --- | --- | --- |
| channel-1 | table-6fcc18fe-a301-3142-a69f-f3f67d026d62 | table-1 | -10 / 0 / 18 |
| channel-1 | table-69d1811f-c44e-32d4-bf72-1f4ebe5fb0dd | table-2 | 10 / 0 / 18 |
| channel-2 | table-c07ae818-2248-3150-8970-820b5529dfb7 | table-1 | -10 / 0 / 18 |
| channel-2 | table-ce87bea5-89c6-3892-b08e-489bcbef8533 | table-2 | 10 / 0 / 18 |

좌표는 받은 `world/park.json`의 기존 table-1·2 배치를 사용한다.
현재 서버의 채널당 두 테이블 구성에 맞춘 테스트이며 공원의 모든 장식 테이블을 개방한 설정은 아니다.
프론트 모델 ID `table-1`을 착석 요청에 그대로 보내지 말고 위 서버 tableId로 매핑한다.
기계가 읽을 목록·mapVersion은 [frontend-test-layout.json](frontend-test-layout.json)에 있다.
채팅은 같은 채널 사용자 사이 XZ 거리 20m 이내, 관전은 테이블 중심 XZ 거리 20m 이내다.
좌표 설정은 관전 거리 판정에 사용되며 착석 자체의 거리 검사와 구분한다.

## 두 계정 확인 순서

1. 각각 새 접속권으로 연결 → `CONNECTED` 확인.
2. `CHANNEL_JOIN`으로 channel-1 입장 → 상대 아바타의 `WORLD_STATE` 확인.
3. `WORLD_MOVE`에 입력 순서와 방향을 전송한다. 최종 x/y/z는 서버가 계산한다.
4. 가까운 위치에서 `WORLD_CHAT_SEND` → 상대 `WORLD_CHAT_MESSAGE` 확인.
5. 같은 서버 tableId로 `TABLE_JOIN`, 첫 착석자가 `GAME_SELECT`, 두 명 모두 `READY_SET`.
6. 한쪽 연결을 끊고 상대의 대기 좌석·준비 해제 확인. 새 접속권·채널 입장 후 다시 착석한다.
   대기 중 단절과 게임 중 30초 복귀는 서로 다른 흐름이다.

## 현재 확인 범위

- 프로필의 채널·테이블 ID와 실제 공원 좌표, 인증·Origin, 두 회원의 접속권·소켓 입장·이동 입력·채팅·관전·착석·준비·heartbeat 단절·새 접속권 재입장을 실제 격리 MySQL과 소켓으로 검증한다.
- 자동 테스트의 회원·로그인 세션은 테스트 fixture다. 실제 외부 OAuth 제공자 로그인을 통과했다는 뜻은 아니다.
- 저장소 프론트는 SSAFY 로그인·콜백·온보딩을 제공한다. 광장 소켓·네이버 버튼 등 프론트의 실제 연동 구현은 프론트 담당 범위다.
- 실제 경기 시작의 DB 판돈 차감·경기 종료 정산은 이 설정에 연결하지 않는다. 전원 준비 성공과 실제 경기 시작 완료를 혼동하지 않는다.
- 이 작업은 실행 설정 추가다. 기존 API·WebSocket 메시지 필드·팀원 인증/회원 코드·README는 변경하지 않는다.
- 이 프로필이 없는 dev/배포 서버에 같은 채널이 있다고 가정하지 않는다. 실행 서버의 프로필과 소스 커밋을 함께 확인한다.
