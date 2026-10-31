# 온탑 꼬치왕 이용권 계약

1인 꼬치왕의 PC/VR 플레이에 공통으로 사용하는 **한 판 10냥 이용료**다. 판돈·승패 정산·점수 보상은 없다. 게임 진행과 점수는 클라이언트의 연습 게임 상태이며 서버는 이용권 구매와 실제 지갑 원장을 확정한다. 기존 테이블 GameEngine·WS·붕어빵 세션으로 유료 꼬치판을 가장하지 않는다.

## API

`POST /api/v1/minigames/skewer/admissions`

- 인증된 활성 회원의 Access JWT와 허용 Origin을 사용한다. 사용자 ID는 인증 Principal에서만 가져온다.
- `Idempotency-Key`: 단 하나의 헤더, `[A-Za-z0-9_-]{1,64}`. 새 판마다 새 키를 사용하며 같은 판의 응답 유실은 같은 키로 재확인한다.
- 본문은 없으며 가격·회원 ID·점수 등 본문을 보내면 400이다.
- 성공·재확인 모두 201 및 `Cache-Control: no-store`다.

```json
{"id":"skewer-17","game":"skewer","fee":10,"availableBalance":90}
```

`id`는 서버 원장 ID 기반 영수증이다. `availableBalance`는 응답 시점 잠근 지갑의 전체 잔액에서 예약금을 뺀 현재 사용 가능 금액이다. 동일 키의 재확인 시 다른 거래로 달라진 현재 잔액을 반환할 수 있지만 영수증 ID와 이용료는 동일하다.

| 상태 | 코드/의미 |
| --- | --- |
| 400 | SKEWER_INVALID_REQUEST: 잘못된/중복 키 또는 요청 본문 |
| 401/403 | 기존 인증·회원·출처 정책 실패 |
| 409 | INSUFFICIENT_COINS / WALLET_NOT_READY |
| 429 | SKEWER_TOO_MANY_STARTS: 분당 새 구매 10회 제한 |
| 503 | SKEWER_UNAVAILABLE: 서비스 미설정·DB/트랜잭션 오류 |

## 지갑·멱등성

`game/skewer/service/SkewerAdmissionService`는 공통 WalletRepository의 지갑 행 잠금 아래 기존 영수증을 먼저 찾는다. 새 구매만 사용 가능 잔액을 검사하고 지갑 10냥 차감과 `wallet_transactions`의 `MINIGAME_ENTRY_FEE` 기록을 같은 READ_COMMITTED 트랜잭션으로 커밋한다. 원장 실패 시 지갑도 롤백한다. 예약금은 소비하지 않는다.

서버 원장 고유 키는 `skewer:<인증 회원 ID>:<요청 키>`이며 최대 120자 이내다. 동시 같은 키는 한 영수증, 다른 키는 각각 새 판이며, 다른 회원은 서로 다른 원장이다. 기존 고유 제약·행 잠금·영속 원장으로 재시작 후에도 구매 멱등성을 유지한다. 게임 진행 상태 재시작 복원과는 별개다.

**신규 Flyway/DB 변경 없음. V133은 2026-10-31 사용자 전달로 확인한 팀원 사용 번호이며 본 작업에서 생성·수정·예약하지 않는다. 초기 검토의 V134 영수증 테이블 제안도 기존 원장 재사용으로 철회했다.** 기존 migration 파일과 locations는 변경하지 않는다.

## FE 연결과 복구

공원 기본은 ServerVrAdmission과 기존 SpringParkRuntime의 인증·재갱신 REST 경로다. 브라우저에서 공개할 별도 서버 토큰·자격 증명은 없다. DEV에서 명시적으로 켠 테스트 이용권만 별도 LocalVrAdmission을 사용하며 서버 실패에 따른 자동 대체는 없다.

서버로 POST하기 전에 현재 공원 사용자별 sessionStorage에 요청 키를 저장한다. 성공 영수증 검증 후 키를 지우고 기존 지갑 갱신 이벤트로 권위 있는 GET을 다시 읽는다. 네트워크·503·응답 형식 오류와 인증 종료는 이전 차감 여부를 확정할 수 없으므로 키를 유지해 재확인한다. 서버가 기존 영수증을 먼저 찾고 반환하는 409/429와 최초 시도의 400만 확정 거절로 처리한다. 저장 공간을 사용할 수 없으면 POST 전에 멈춘다.

VR 세션 연결 성공 후 이용권을 요청한다. 가이드·플레이 방식 선택·목록 열기·주문 넘김·정지·결과 닫기는 구매하지 않는다. 재도전은 새 요청이다. 계정/채널 전환 시 이전 방문의 늦은 구매 응답이 새 UI에 반영되지 않게 한다. tab 메모리의 게임 진행은 새로고침 시 초기화되며 이미 사용한 이용료를 자동 환불하지 않는다.

## 검증

- SkewerAdmissionServiceTests: 고정 10냥, 예약금, 재시도·재도전·잘못된 키·요청 제한.
- SkewerAdmissionHttpTests: 실제 서명 JWT·보안 필터·본인 식별·위조 본문/중복 헤더 거절·CORS·no-store.
- SkewerAdmissionMySqlTests: loopback의 별도 `ontop_skewer_test_` MySQL 8.4 DB만 허용. 기존 Flyway 적용, 실제 같은/다른 키 동시성, 회원 분리, 트리거로 원장 실패를 주입한 롤백.
- FE 단위 및 공원 E2E: 응답 유실·새로고침 키 복구, 저장 공간 오류·계정 변경, 실제 입장 클라이언트 경로, 두 판·중복 요청·HUD 갱신·결과·복귀·채팅 입력 충돌.

공원 자동 E2E는 실제 화면과 서버 입장 클라이언트를 사용하되 HTTP/WS는 fixture다. 개발 서버 실제 로그인·지갑 검수와 구분한다. Quest 실기기의 조작·높이·성능은 별도 검수다.
