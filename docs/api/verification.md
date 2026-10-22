# USER-03 + Swagger MR 전 검증 기록

검증일: 2026-10-22. 브랜치: `feat/S15P31B105-122-user-withdrawal` 유지.
Swagger 작업 시작 시 작업 트리는 깨끗했으며 기존 USER-03 커밋을 보존했다.
이 기록의 테스트 수는 task별 실행 건수다. flowTest는 일부 시나리오를 다시 실행하므로 고유 테스트 수로 합산하지 않는다.

## 작업별 결과

| 구분 | 일반/선택 | flowTest | mysqlTest | 실패/오류/건너뜀 |
| --- | ---: | ---: | ---: | --- |
| 이전 USER-03 단계의 전체 회귀 | 1140 | 43 | 161 | 모두 0 |
| 이번 Swagger 선택 회귀 | 348 (신규 문서 테스트 17 포함) | 실행 안 함 | 실행 안 함 | 모두 0 |
| 이번 최종 전체 회귀 1회 | 1157 | 43 | 161 | 모두 0 |

최종 명령은 backend에서 다음과 같이 실행했으며 **BUILD SUCCESSFUL, 5m 39s**였다.

```powershell
.\gradlew.bat clean build flowTest mysqlTest --console=plain
git diff --check
```

`exportOpenApi`도 성공했다. 실제 HTTP `/v3/api-docs.yaml` 원문 저장, 생성 JSON/YAML 비교,
정적 YAML과 생성 결과 비교, Swagger parser 오류/경고 없음, 내부 `$ref` 연결 검사를 통과했다.
초기 선택 실행에서 발견된 성별 enum 중복, 테스트 JWT 설정 누락, parser의 javax/Jakarta core 충돌은
문서 어노테이션·테스트 설정/의존성 제외로 해결하고 재실행했다. 기존 인증/게임 비즈니스 로직은 수정하지 않았다.

### 선택 회귀 명령

```powershell
.\gradlew.bat test --tests 'com.ssafy.ontop.api.*' --tests 'com.ssafy.ontop.auth.controller.*' --tests 'com.ssafy.ontop.auth.security.*' --tests 'com.ssafy.ontop.user.controller.*' --tests 'com.ssafy.ontop.auth.websocket.WebSocketTicketTests' --tests 'com.ssafy.ontop.table.MemberWebSocketAuthenticationTests' --console=plain
```

### 신규 문서 테스트

| 클래스 | 건수 | 범위 |
| --- | ---: | --- |
| OpenApiLocalTests | 7 | 실제 HTTP UI/CSS/JS/JSON/YAML, 17 operation, DTO/인증/오류/명세 비교 |
| OpenApiDevTests | 6 | 실제 dev HTTP 문서/11 operation/보호 정책/스키마 |
| OpenApiDefaultTests | 1 | 기본 비활성/매핑 미등록/HTTP 차단 |
| OpenApiProductionTests | 1 | prod 비활성/매핑 미등록/HTTP 차단 |
| OpenApiMixedProductionTests | 1 | local,prod 혼합에서도 비활성/차단 |
| OpenApiProductionOverrideTests | 1 | dev,production + 외부 enabled=true 강제에도 문서/WebJar 차단 |

새 문서 테스트는 랜덤 포트의 실제 Spring HTTP 서버를 사용한다. 문서 생성/테스트에는 DB·실제 OAuth 계정이 필요 없다.
보호 API 무인증 401, 온보딩 Bearer의 회원 API 401, 공개 health 유지, 잘못된 Authorization의 문서 열람 영향 없음도 확인했다.
전체 회귀에서는 기존 OAuth 세션/교환/온보딩/닉네임 재시도/Rotation/Logout/REST/접속권/세션 무효화,
USER-03 실제 HTTP·WebSocket 4403/롤백/경합, 광장/게임/상점과 관련 FK 보존을 기존 테스트로 검증했다.
실제 외부 공급자 계정 로그인, 배포 프록시, 운영 브라우저의 쿠키 저장/전달은 이번 검증 범위가 아니다.

## DB 및 자원 보존

- 기존 격리 MySQL 테스트 DB와 상점 테스트 DB를 재사용했다. 새 컨테이너/볼륨을 생성·삭제하지 않았다.
- 개발 `ontop_dev`의 users/refresh_tokens 읽기 전용 건수·집계 체크섬과 Flyway version/checksum/installed_on/success가 전후 동일했다.
- 개발 DB 테스트 데이터 생성·수정·삭제, 기존 Flyway 변경, 서비스/Repository/Entity 변경은 없다.
- 기존 USER-03은 회원 상태·전체 로그인 계열 폐기와 커밋 후 연결 종료까지 구현되어 있다.
  Swagger 작업은 그 Controller/DTO의 문서 메타데이터만 보완했다.

## 이번 Swagger 변경 파일 전체

아래 경로는 프로젝트 루트 기준이다. 총42개(이 검증 기록 포함).

### 구성·안내 (3)

- `README.md`
- `backend/build.gradle`
- `backend/src/main/resources/application.yml`

### 문서 구성 (3)

- `backend/src/main/java/com/ssafy/ontop/api/OpenApiConfiguration.java`
- `backend/src/main/java/com/ssafy/ontop/api/OpenApiSchemaCustomizer.java`
- `backend/src/main/java/com/ssafy/ontop/api/OpenApiSecurityConfiguration.java`

### Controller 어노테이션·개발 문서 제외 (15)

- `backend/src/main/java/com/ssafy/ontop/auth/controller/AuthController.java`
- `backend/src/main/java/com/ssafy/ontop/auth/controller/AuthCallbackController.java`
- `backend/src/main/java/com/ssafy/ontop/auth/controller/AuthExchangeController.java`
- `backend/src/main/java/com/ssafy/ontop/auth/controller/AuthRefreshController.java`
- `backend/src/main/java/com/ssafy/ontop/auth/controller/AuthLogoutController.java`
- `backend/src/main/java/com/ssafy/ontop/auth/websocket/WebSocketTicketController.java`
- `backend/src/main/java/com/ssafy/ontop/user/controller/UserProfileController.java`
- `backend/src/main/java/com/ssafy/ontop/user/controller/UserNicknameUpdateController.java`
- `backend/src/main/java/com/ssafy/ontop/user/controller/UserWithdrawalController.java`
- `backend/src/main/java/com/ssafy/ontop/user/controller/NicknameAvailabilityController.java`
- `backend/src/main/java/com/ssafy/ontop/user/controller/UserOnboardingController.java`
- `backend/src/main/java/com/ssafy/ontop/world/controller/ChannelQueryController.java`
- `backend/src/main/java/com/ssafy/ontop/table/controller/TableQueryController.java`
- `backend/src/main/java/com/ssafy/ontop/table/websocket/TableDevController.java`
- `backend/src/main/java/com/ssafy/ontop/shop/ShopController.java`

### DTO 스키마 어노테이션 (9)

- `backend/src/main/java/com/ssafy/ontop/auth/dto/AuthCallbackResponse.java`
- `backend/src/main/java/com/ssafy/ontop/auth/dto/AuthErrorResponse.java`
- `backend/src/main/java/com/ssafy/ontop/auth/dto/AuthExchangeResponse.java`
- `backend/src/main/java/com/ssafy/ontop/auth/dto/AuthRefreshResponse.java`
- `backend/src/main/java/com/ssafy/ontop/user/dto/NicknameAvailabilityResponse.java`
- `backend/src/main/java/com/ssafy/ontop/user/dto/UserNicknameUpdateRequest.java`
- `backend/src/main/java/com/ssafy/ontop/user/dto/UserOnboardingRequest.java`
- `backend/src/main/java/com/ssafy/ontop/user/dto/UserOnboardingResponse.java`
- `backend/src/main/java/com/ssafy/ontop/user/dto/UserProfileResponse.java`

### 테스트 (8)

- `backend/src/test/java/com/ssafy/ontop/api/OpenApiHttpTestSupport.java`
- `backend/src/test/java/com/ssafy/ontop/api/OpenApiDisabledTestSupport.java`
- `backend/src/test/java/com/ssafy/ontop/api/OpenApiLocalTests.java`
- `backend/src/test/java/com/ssafy/ontop/api/OpenApiDevTests.java`
- `backend/src/test/java/com/ssafy/ontop/api/OpenApiDefaultTests.java`
- `backend/src/test/java/com/ssafy/ontop/api/OpenApiProductionTests.java`
- `backend/src/test/java/com/ssafy/ontop/api/OpenApiMixedProductionTests.java`
- `backend/src/test/java/com/ssafy/ontop/api/OpenApiProductionOverrideTests.java`

### 문서 (4)

- `docs/api/README.md`
- `docs/api/openapi.yaml`
- `docs/api/websocket.md`
- `docs/api/verification.md`

## MR 및 후속 확인

자동화 기준 MR 준비 가능. 기존 USER-03과 이번 문서 변경을 같은 MR에서 검토할 수 있다.
운영 HTTPS/프록시·Origin·쿠키/SameSite 및 실제 외부 OAuth는 수동 검증이 남는다.
상점/광장/게임의 운영 프로필·스키마 준비, 7일 경과 재가입·영구 삭제, 즉시 기권/정산 연동은 후속 작업이다.
현재 브랜치를 유지했고 커밋·Push·MR 생성은 실행하지 않았다.
