# 전체 흐름 테스트 도구

`backend/` 터미널에서 한 번 실행한다. 별도 서버·프론트·DB는 필요 없다.

```powershell
.\gradlew.bat flowTest
```

자동으로 임시 로컬 서버와 시나리오별 사용자 두세 명을 띄우고 아래 과정을 확인한다. 종료하면 테스트 서버와 연결도 정리한다. 이미 실행 중인 서버는 사용하지 않는다.

### 소리함·익명 메모 실제 DB 흐름

기본 `flowTest`와 별도로 실행한다. `ParkMessageFlowMySqlTests`는 실제 dev,db 서버·JWT·접속권·
Raw WebSocket·JPA를 사용해 미입장/거리/높이 거절, 공개 익명 목록과 비공개 의견 분리,
단절·복귀 후 동일 요청의 중복 저장 방지를 검사한다. 서버의 단절 정리가 끝나야 다음 검사를 시작한다.
간격 제한의 고정 시간 판정은 기존 단위/HTTP 검사에 두어 느린 환경에서도 이 흐름이 시간에 따라 바뀌지 않게 한다.

현재 터미널에 `TEST_PARK_MESSAGES_DB_URL`, `TEST_PARK_MESSAGES_DB_USERNAME`,
`TEST_PARK_MESSAGES_DB_PASSWORD`를 설정한다. URL은 loopback MySQL의 새
`ontop_park_messages_test_...` 스키마만 허용한다. V1~V6/V110/V111/V121/V127을 적용하며
검사마다 이 전용 DB의 소리함·메모 자료를 초기화하고 합성 회원을 준비한다. 새 마이그레이션은 없다.

```powershell
.\gradlew.bat mysqlTest --tests '*ParkMessageFlowMySqlTests'
```

물리 시간·서버 위치와 두 번째 채널은 fixture다. 실제 이동 경로·FE 3D 화면·개발 서버 적용은 별도다.

### 광장부터 테이블 준비까지

1. 인증 대역의 두 사용자 연결 → 서로 다른 채널 입장
2. 이동·채팅·감정표현이 다른 채널에 전달되지 않는지 300ms 관찰
3. 같은 채널로 이동 → 최신 위치 수신, 과거 채팅·감정표현 재생 없음 확인
4. 채팅·감정표현의 동일 payload 수신 → HTTP 테이블 목록 조회
5. 테이블 보기(좌석 미점유·준비 불가) → 착석으로 전환 → 게임 선택·전원 준비
6. Pong 중단 → heartbeat 종료 → 채널 인원·위치·좌석·준비 및 HTTP 목록 정리
7. 같은 계정 새 연결 → 위치·좌석 자동 복구 없음 → 채팅·표현 전송 → 다시 착석

### 기존 경기 복구 경계

1. 별도 서버에서 사용자 두 명 연결 → 같은 테이블 착석
2. 첫 착석자가 주사위 선택 → 한 명 준비는 대기 → 전원 준비를 양쪽에서 확인
3. **경기 담당 대역 주입** → 각자 본인 상태 조회 → 살아 있는 계정의 추가 연결 거절
4. 한 사용자의 Pong 응답 중단 → 실제 heartbeat로 끊김 감지
5. 29초 복귀: 같은 경기·최신 본인 상태·원래 턴 마감 확인
6. 별도 초기화한 시나리오에서 30초 복귀: 만료 요청·경기 정보/추가 착석 차단 확인

### dev 프로필 경기 전체 흐름

`DevCommittedStartFlowTests`는 local을 섞지 않은 dev의 실제 채널·테이블 설정으로 실행한다.
JWT·접속권 → 채널 입장·착석·전원 준비 → 예약 확정 전 미시작 → 실제 오목 착수 →
heartbeat 단절·29초 복귀 → 시간패 → 정산 대기·준비 거절 → 정산 알림 → 다음 판을 확인한다.
회원 조회·예약·결과 저장만 테스트 대역이며 실제 DB 잔액/원장·개발 서버 배포 검증은 아니다.
정산 결과와 테이블 상태 알림은 수신 순서와 관계없이 각각 확인한다.

### 경기 입력·상태·관전·복귀

1. 진행 경기 대역의 참가자 두 명과 관전자 한 명 연결 → 경기 관전 시작
2. 참가자 입력 → 본인 처리 확인과 각 참가자의 개인 상태, 관전자 공개 상태 수신
3. 관전자 입력 거절 → 경기 담당 호출 수가 늘지 않는지 확인
4. 첫 참가자의 Pong 중단 → heartbeat 종료 → 남은 참가자 입력으로 경기 버전 증가
5. 같은 계정이 유예 안에 새 연결 → 최신 본인 경기 복구·상태 조회 → 입력 재개
6. 관전 해제 → 다음 입력은 참가자만 갱신, 관전자는 300ms 동안 상태 미수신 확인
7. **경기 담당의 종료 결과 대역 주입** → GAME_RECONNECT_CHECK로 FINISHED 반영 → 추가 입력 거절·경기 담당 호출 수 불변
8. 본인 결과 PENDING/null → 정산 완료 대역으로 SETTLED/+1 또는 -1 수신 → 같은 결과 재조회, 관전자 결과 미수신 확인

관전 소켓은 위 동작 중 손패·다른 사용자의 입력 처리 확인·개인 종료 결과를 받으면 실패한다. 미수신 관찰은 정해진 구간의 검사이며 영구 미전송 보장은 아니다. 이미 생성된 진행 경기 대역으로 시작하며 착석·준비·경기 생성은 앞 시나리오와 별도다. 종료와 정산 완료는 테스트가 대역에 주입하며 실제 승패·지급을 계산하지 않는다. 결과 알림 자체가 입력 권한을 바꾸는 것은 아니므로 기존 복구 조회로 FINISHED를 먼저 반영한다. 이 시나리오는 실제 시계로 유예 안 복귀를 확인하고, 29/30초 경계는 앞 시나리오가 테스트 Clock으로 검사한다.

각 단계는 단언에 성공한 뒤 `[PASS]`를 출력한다. 대역을 사용하는 곳은 `[SIMULATED]`로 표시한다. 중간에 실패하면 명령은 실패로 끝나고 결과에 해당 테스트와 이유가 남는다. 반복 실행해도 캐시로 건너뛰지 않는다.

### 20m 채팅·관전 이탈과 복귀

같은 명령에서 실제 거리 검사도 함께 실행한다. 별도 프로그램을 띄울 필요 없다.

1. 서버 내부 두 사용자 경계 위치 주입 → 19m 안·20m 경계 채팅 수신 → 21m 밖 미수신 → 20m 복귀 수신
2. 대기 테이블 보기·경기 관전 → 21m 이동 → 두 관전 해제 알림과 범위 밖 재구독 거절
3. 좌석·경기 상태가 바뀌어도 미전송 → 20m 복귀만으로 자동 구독되지 않음
4. 명시적 재구독 → 변경된 좌석·최신 공개 경기 상태 수신, 개인 상태·내부 tableId 미노출
5. Pong 중단 → 서버 heartbeat 종료 → 같은 계정 재접속 → 서버 스폰 위치 확인
6. 서버 내부 경계 위치 주입만으로 관전 자동 재개 없음 → 채팅 재수신·명시적 관전 재구독·이후 상태 수신

서버의 실제 거리 서비스와 TCP/WebSocket을 사용한다. 정확한 경계 검사는 물리 시간을 멈추는 FrozenWorldFixture와 서버 내부 위치 주입을 사용한다. 이동 엔진은 별도 시나리오로 검증한다. 테이블 중심 원점은 이 테스트에만 주입하며 실제 맵 배치가 아니다. 인증·경기 상태는 테스트 대역이고, 관전자 연결은 참가자의 30초 경기 복구와 구분한다. 빠른 검증용 이동/채팅 제한1ms·heartbeat200ms/2초를 사용하므로 제품의 실제 전송 간격을 측정하는 시험은 아니다.

### 서버 입력 이동·충돌·위치 동기화

두 실제 소켓 검사에서 좌표 주입 거절 → 방향 입력 → 같은 채널 자동 위치 수신·다른 채널 격리 → 과거 순번 무시 → 250ms 입력 만료 → 착석 중 이동 거절 → heartbeat 정리 → 재입장 새 스폰·seq0을 확인한다. 지도 벽·테이블·팔각정 계단·전망대·점프·수영/징검다리의 상세 물리 회귀는 일반 `test/build`의 `WorldPhysicsTests`에서 검사한다.

## 실제 프론트 상점 연결 검증

기존 FE 상점 controller/service와 실제 Spring·인증·소켓·JPA/MySQL을 이어서 검사한다.
기존 데이터가 없는 새 loopback 검증 DB가 필요하고, 사용자/상품이 있으면 거절한다.
기존 공통·상점 마이그레이션만 새 검증 DB에 적용하며 기존 DB나 SQL을 수정하지 않는다.

backend 폴더에서 개인 환경변수를 지정한 뒤 실행한다. 비밀값은 공유 파일에 저장하지 않는다.

```powershell
$env:TEST_SHOP_FRONTEND = 'true'
$env:TEST_SHOP_FRONTEND_DB_URL = 'jdbc:mysql://127.0.0.1:<port>/ontop_shop_test_frontend_<unique>?serverTimezone=UTC'
$env:TEST_SHOP_DB_USERNAME = '<test-db-user>'
$env:TEST_SHOP_DB_PASSWORD = '<test-db-password>'
.\gradlew.bat mysqlTest --tests '*ShopFrontendMySqlTests'
```

Node24·설치된 저장소 frontend 의존성이 필요하다. Java가 인증값을 자식 프로세스 환경에만 전달한다.
`backend/src/test/js/shop-frontend/flow.test.ts`의 실제 FE 구매 재확인/과거 잔액 보호·장착·재접속과
Java의 독립 SQL 잔액/원장 검사를 함께 통과해야 성공이다. 시간·위치 고정 대역은 사용하지 않는다.
Node의 브라우저 API 어댑터·유실 응답 주입을 구분하고 실제3D UI/운영 적용·경기 정산 검증으로 확대하지 않는다.

## 결과 확인

붕어빵의 실제 FE 플레이 상태→HTTP/RawWS→MySQL 전체 검사는
[실제60초 연동 명령과 범위](minigame-api.md#실제-프론트-플레이-상태60초-연동-검증)를 따른다.
`BungeoppangFrontendFlowMySqlTests`는 mysql 태그·TEST_BUNGEOPPANG_FLOW=true 전용이며
일반 flowTest에 추가하지 않는다. 게임 시각/DB 시작 시각을 조정하는 기존 서비스 검사와 구분한다.

| 위치 | 내용 |
| --- | --- |
| 터미널 | 단계별 PASS / SIMULATED / 실패한 검사 |
| `backend/build/reports/tests/flowTest/index.html` | 브라우저에서 볼 성공·실패와 출력 |
| `backend/build/test-results/flowTest/` | JUnit XML 원시 결과 |

최종 성공은 선택된 로그인·광장·테이블·시작·경기 통신·4종 규칙·이동 시나리오 전체 PASSED와 BUILD SUCCESSFUL이다. 실행 수는 해당 실행의 JUnit XML을 확인한다. 시간 경계는 제어 시계이고 heartbeat는 실제 Pong 무응답이다. 중간 PASS만으로 전체 성공을 판단하지 않는다.

## 확인 범위

착석·선택·준비·heartbeat·재접속은 실제 앱과 TCP/WebSocket을 통과한다. heartbeat는 빠른 실행을 위해 200ms 주기·2초 제한이고, 29/30초 유예는 테스트 Clock을 움직여 확인한다. 실제 30초 대기나 네트워크 장애/부하 측정은 아니다.

광장 시나리오도 실제 HTTP/TCP/WebSocket을 사용한다. 두 채널·정원 3명·WAVE/CLAP·채팅/표현 간격 60초는 테스트 설정이다. 기존 광장/경기 흐름은 관전 거리 허용 대역을 사용하고, 위 근거리 왕복 시나리오는 실제20m 거리 서비스를 사용한다. 300ms 미수신 검사는 해당 관찰 구간의 검증이며 영구 미전송이나 성능 수치를 증명하지 않는다. 3D 모션·최종 표현 종류는 확정하지 않는다. 광장 대기 좌석의 끊김 정리와 경기의 30초 복구는 별도 시나리오다.

실제 JWT·접속권과 시작 확정 후 엔진 생성 연결은 별도 로그인/시작 시나리오에서 검증한다. 실제 DB 시작 차감·결과 저장·정산은 대역이다. 기존 복구·공통 통신 시나리오의 인증은 테스트 전용 필터, 경기는 FullFlowTests.Engine 또는 GameCommunicationFlowTests.Engine 대역이다. 이 기존 시나리오와 실제 로그인 시작 시나리오를 구분한다. 개발 rehearsal과 인증의 동시 활성화 제한은 유지한다.

DB Gateway 연결 후 실제 트랜잭션·결과 저장·정산 통합 검증이 필요하다. 현재 명령은 배포 서버 대상 도구가 아니다.

## 파일 역할

- `FullFlowTests`: 경기 복구 29/30초 경계 시나리오와 단계별 검증. 일반 `test/build`에도 포함된다.
- `WorldFullFlowTests`: 광장부터 테이블 준비·끊김 정리까지 연속 검증. 일반 `test/build`에도 포함된다.
- `GameCommunicationFlowTests`: 입력·상태·관전·끊김 후 최신 복귀·입력 재개·종료 후 입력 차단·개인 정산 결과를 실제 세 소켓으로 검증한다. 경기/결과는 대역이다.
- `ScenarioClient`: 사용자 소켓·백그라운드 Pong·Pong 중단·종료 정리. 테스트 소스에만 있다.
- `WorldProximityWebSocketTests`의 `채팅과관전_거리이탈부터_재접속까지_연속확인한다`: 실제20m 거리 검사와 관전 이탈·복귀·재접속을 이어서 검증한다. 이 클래스의 다른 거리·권한 회귀 검사는 일반 test/build에 포함된다.
- `OmokFlowTests`: 실제 오목 엔진의 착수·관전·복귀·승리 및 자동 시간패를 검사한다. [오목 계약](omok.md) 참고.
- `CommittedStartFlowTests`: 실제 JWT·접속권·착석·준비·시작 → 오목 30초 시간패 → 자동 PENDING → 커밋 알림 SETTLED → heartbeat 단절·FINISHED 복귀·저장 결과 재조회. 계정 조회·차감·결과/정산은 대역이다.
- `build.gradle`의 `flowTest`: 선택한 흐름 검사를 재실행하고 결과를 별도 폴더에 보관한다.

Java 21과 기존 Gradle 의존성 다운로드 환경이 필요하다. 실제 로그인 정보나 토큰은 입력하지 않는다.

## 실제 DB 의상·테이블 통합 검증

별도 격리 MySQL에서 `backend/gradlew.bat -p backend mysqlTest --tests '*WorldAppearanceMySqlTests'`로 실행한다. TEST_SHOP_DB_URL은 loopback의 `ontop_shop_test_*` 스키마만 허용하며 TEST_SHOP_DB_USERNAME/PASSWORD는 개인 환경에 설정한다. fixture가 해당 테스트 스키마를 초기화하므로 공용 개발/운영 DB를 연결하지 않는다. 일반 flowTest에는 DB 의존 검사를 섞지 않는다.

`장착후이동입력_착석준비_heartbeat정리와재입장을한흐름으로확인한다`는 실제 테스트 회원/JWT→접속권→채널 입장→장착 REST→WORLD_MOVE 입력 수락→2명 착석/오목 선택/전원 준비→착석 중 의상 교체→동일한 좌석·준비·테이블 버전 유지→Pong 중단/1001 종료→대기 좌석·준비 정리→새 접속권/채널 재입장→최신 의상·이동 seq0 복구→재착석/다시 전원 준비를 연속 확인한다. 외형 갱신 때문에 테이블 상태가 초기화되거나, 반대로 의상을 복구하면서 대기 좌석/준비를 자동 복구하는 오류를 구분한다.

MySQL·HTTP·Raw WebSocket·heartbeat는 실제 실행이다. 물리 시간은 FrozenWorldFixture로 고정해 입력 수락과 외형 캐시 보존을 확인하며 이동 거리/속도 검증이 아니다. 실제 경기 시작 DB Gateway는 연결하지 않아 전원 준비 상태가 WAITING인 것을 확인한다. 진행 경기30초 복귀·차감·정산·3D 렌더링의 통합 성공을 뜻하지 않는다. heartbeat200ms/2초는 테스트 설정이며 제품 기본 시간을 변경하지 않는다. 별도 기존 검사는 롤백 미전파·채널 격리·오프라인 장착 변경 복구를 확인한다.

결과는 `backend/build/reports/tests/mysqlTest/index.html` 및 `backend/build/test-results/mysqlTest/`에서 확인한다. XML 표준 출력의 APPEARANCE_FLOW와 PUBLIC_WORLD_STATE는 검사에 사용한 격리 테스트 계정·공개 외형 상태이며 인증 토큰/접속권은 출력하지 않는다.

FarkleFlowTests·OneCardFlowTests·BridgeFlowTests는 실제 게임 엔진·SecureRandom·소켓으로 각 게임의 상태/복구/시간/종료 흐름을 검사한다. 원카드는 본인 손패 격리, 다리는 비밀 눈·비공개/공개 판정을 포함한다. 인증/시작은 테스트 대역·시각은 제어시계, 원카드 기권 손패 정책은 테스트 조건으로 명시하고 제품 확정과 구분한다.
