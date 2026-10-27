# 붕어빵 v4 FE·BE REST API 계약과 구현 상태

- 작성일: 2026-10-27 (Asia/Seoul)
- 상태: **사용자 확정 정책을 유지하며 Story 1(규칙·판·현재 주문 발급)과 Story 2(납품 승인·영수증·checkpoint 복구)를 구현한 계약 문서. Story 3 최종 정산은 미구현이다.**
- Story 1 구현 브랜치: feat/S15P31B105-224-minigame (원격 fetch 없이 로컬 저장소 기준)
- 최초 조사 BE: feat/S15P31B105-171-game-wallet / eb18ece
- 조사 FE: 로컬 origin/feat/frontend-bungeoppang-v4 / f67024956e93e57840941b2d7098add2af3a3caf
- 원격 fetch·배포 서버·DB 조회는 하지 않았다. 로컬 참조가 원격 최신 또는 배포 버전이라는 뜻이 아니다.
- Story 1은 BE 운영 코드·테스트·V124를, Story 2는 BE·FE 연동 코드·테스트·V125·OpenAPI·이 문서를 함께 변경한다. 기존 FE v4 화면·연출은 유지한다.

읽는 순서: §0 확정 정책 → §2 API/호환성 → §3 시간 → §5 로그/영수증 → §6 요청·응답 → §8 경합·지급 → §9 복구 → §10 시나리오 → §11/12 BE·FE 변경 → §14 인수 조건.

## 0. 해석 기준과 참고 자료

### 0.1 표시와 우선순위

- **[확정]** 이번 사용자의 16개 정책. 이전 문서의 미정·권장 표시보다 우선한다.
- **[유지]** 최종기획·BE/FE 작업명세의 기존 게임 규칙.
- **[현행]** 조사 버전에서 확인한 코드. 새 설계가 이미 실행된다는 의미가 아니다.
- **[설계 기본안]** FE·BE 구현에 적용할 구체 제안. 사용자 확정 정책과 구별하며 FE 추가 답변을 기다리는 차단 항목으로 두지 않는다.
- **[조정 가능]** 권장 기술 수치. 바꾸면 configVersion을 올리고 새 판에만 적용한다.

handoff의 실제 연동 요청을 우선 반영하되 최종기획·BE/FE 작업명세의 규칙을 누락하지 않는다. FE 내부 함수명·미리보기 fixture는 기존 승인 네트워크 계약이 아니다.

### 0.2 확인 자료

| 자료 | 실제 위치·작성 시점 | 적용 |
| --- | --- | --- |
| 최종기획 v4 | 사용자 제공 Downloads/미니게임/붕어빵_뒤집기_최종기획.md, 2026-10-26 | 게임 규칙 |
| BE 작업명세 v4 | 같은 폴더의 붕어빵_뒤집기_BE_작업명세_v4.md, 2026-10-26 | 검증·보관·정산·테스트 |
| FE 작업명세 v4 | 같은 폴더의 붕어빵_뒤집기_FE_작업명세_v4.md, 2026-10-26 | 입력·예상 진행·화면 책임 |
| FE handoff | 사용자 제공 Downloads/bungeoppang-v4-be-handoff.md, 2026-10-26 | 연동·실패·재시도 |
| 기존 API | docs/minigame-api.md, v2 계약 및 당시 검증 기록 | v2 호환성 |
| BE | backend/src/main/java/com/ssafy/ontop/minigame/ | 실제 v2 |
| FE | 아래 고정 커밋의 frontend/src/features/bungeoppang/ | v4 미리보기 |
| fixture | 같은 커밋의 frontend/tests/fixtures/bungeoppang-v4.json | 순수 규칙 비교 자료 |

FE 고정 자료:
- https://lab.ssafy.com/s15-final/S15P31B105/-/blob/f67024956e93e57840941b2d7098add2af3a3caf/frontend/docs/BUNGEOPPANG_V4_FE.md
- https://lab.ssafy.com/s15-final/S15P31B105/-/blob/f67024956e93e57840941b2d7098add2af3a3caf/frontend/src/features/bungeoppang/rulesV4.ts
- https://lab.ssafy.com/s15-final/S15P31B105/-/blob/f67024956e93e57840941b2d7098add2af3a3caf/frontend/src/features/bungeoppang/service.ts
- https://lab.ssafy.com/s15-final/S15P31B105/-/blob/f67024956e93e57840941b2d7098add2af3a3caf/frontend/src/features/bungeoppang/serviceV4Preview.ts
- https://lab.ssafy.com/s15-final/S15P31B105/-/blob/f67024956e93e57840941b2d7098add2af3a3caf/frontend/src/features/bungeoppang/store.ts

현재 작업 트리에 FE v4 파일과 docs/bungeoppang-v4-be-handoff.md는 없다. Git 객체와 제공 파일을 읽었다. GAME_PLAN.md라는 저장소 파일 대신 제공된 최종기획 v4를 사용했다. 원문의 “현재 v3 목업”과 packages/apps 경로는 당시 설명이며 현행 구현으로 간주하지 않는다.

### 0.3 사용자 확정 정책 16개

| # | [확정] 정책 | 반영 |
| --- | --- | --- |
| 1 | v2 유지, v4 명시 선택 | 버전 미지정=v2, 저장 버전별 dispatch |
| 2 | 회원당 활성 판 1개 | v2/v4 전체에서 Wallet 잠금으로 직렬화 |
| 3 | 불 85~115%, 특수 주문 20%, 보너스 50%, 첫 주문 팥2, FIFO | 판별 규칙 스냅샷 |
| 4 | 서버가 플레이 시작 시각 확정 | 미래 playStartsAt, 서버 시각 조회 |
| 5 | 0 이상 60000ms 미만 행동 | t 정수, 0..59999 |
| 6 | 납품 대기 중 타이머·조리 지속 | 납품 prefix 고정, 후속 로그 별도 유지 |
| 7 | 탭 비활성·단절에도 시간 진행 | 서버 deadline 유지 |
| 8 | 기존 REST 확장 + 납품 API | 기존 5개 operation + POST deliveries |
| 9 | 영속 납품 영수증 | 키·본문 식별·최초 응답·승인 주문 UNIQUE |
| 10 | 안정적 빵 ID·종류별 FIFO | 판 내 꺼내기 번호, 배열 위치와 구별 |
| 11 | 서버 거부 시 checkpoint 복구 | 승인 prefix 보존·미승인 suffix 재생 |
| 12 | 완료에서 마지막 미승인 납품 검증 | DELIVER에 deliveryKey 포함, 영수증 합성 |
| 13 | 최초 유효 종료 확정 | 동일 잠금 아래 최초 유효 terminal 커밋 |
| 14 | 최초 성공 정산일 KST 한도 | 확정 시각·날짜 저장 |
| 15 | v2 결과 필드 + v4 상세 | made/verifiedCompletedCount 보존 |
| 16 | 납품 중 무지급, 최종 1회 지급 | 완료 시에만 MINIGAME_REWARD |

“최초”는 HTTP 도착 시각의 전역 순번이 아니라 **DB 잠금 안에서 유효성을 통과하고 커밋된 최초 전이**다. 잘못된 완료·롤백·응답 미확정은 성공한 종료가 아니다.

## 1. 현재 코드와 충돌하는 계약

| [현행] 코드 | 필요한 변경 |
| --- | --- |
| BungeoppangRules.VERSION과 Record 생성자 v2 고정 | 전역 상수만 교체 금지. 저장 버전별 검증기 |
| 시작 본문 minigameType 한 필드 | v4 rulesVersion 허용, 기존 v2 본문 보존 |
| 시작 영수증에 본문 fingerprint 없음 | 같은 키의 버전 충돌 검증 |
| 불 64개, 로그 1200개, t<=60000 | v4 불 512개 기본안, 로그 상한 유지, t<60000 |
| 꺼내기 즉시 총점 증가 | 쟁반 보관 점수와 납품 총점 분리 |
| 주문·납품 영수증·checkpoint 없음 | v4 영속 구조 추가 |
| 서버 발급+60초, FE 응답+3.5초 | 서버 미래 원점에 FE 동기화 |
| GET은 상태·점수·지급액 중심 | v4 원본·checkpoint·영수증·최종 결과 확장 |
| v2 LOG_INVALID는 INVALID로 확정 | v4 복구 가능한 거부와 terminal 종료 구분 |
| GET도 Wallet 잠금·만료 갱신 가능 | 읽기 전용이라고 설명하지 않음 |
| FE nextOrder는 내부 미리보기 포트 | deliveries REST 어댑터 |
| FE 쟁반 index, 주문 index | 안정 빵 ID·서버 주문 ID로 변환 |
| FE rulesV4 순수 검증기는 t=60000 허용 | 59999까지로 보완 |

[현행] MINIGAME은 local/dev용이며 prod/production에서는 비활성이다. DB 서비스는 db + ontop.minigames.enabled=true가 필요하다. 이 문서로 운영 프로필·배포·기능 플래그를 확대하지 않는다.

### 1.1 Story 1·2 구현 상태

| 범위 | 상태 | 비고 |
| --- | --- | --- |
| v2/v4 명시 선택·저장 버전 dispatch | **Story 1 구현** | 버전 생략/v2는 기존 계약, v4만 새 계약 |
| v4 순수 규칙 재계산 | **Story 1 구현** | 네 소·불·가속·품질·콤보·쟁반4·FIFO·납품 시 점수 |
| 서버 시간 원점·규칙 snapshot·불512·첫 주문 | **Story 1 구현** | 같은 시작 키 재시도에서 불변 |
| v4 시작/로비/본인 판 조회 | **Story 1 구현** | 기존 REST 경로 확장, 새 공개 경로 없음 |
| 납품 승인·다음 주문 발급·영속 영수증 | **Story 2 구현** | 동일 키·동일 본문 성공/거부 재생, 다음 주문 단일 발급 |
| checkpoint 진행·거부 복구 | **Story 2 구현** | 승인 prefix 저장, GET includeProgress/deliveryKey 복구 |
| 마지막 납품·완료·Wallet 정산 | **Story 3 미구현** | v4에 기존 v2 완료/지급을 적용하지 않음 |

표의 “구현”은 현재 작업 트리의 범위를 뜻한다. 관련 자동 테스트·Flyway/JPA 검증 결과와
커밋 여부는 각 Story 완료 보고를 기준으로 하며, 이 표가 DEV 배포 완료를 뜻하지 않는다.

## 2. 공통 HTTP·인증·버전

### 2.1 API 목록

| Method | 경로 | 용도 | 구현 단계 |
| --- | --- | --- | --- |
| POST | /api/v1/minigames/sessions | 시작·v4 미래 시각 확정 | Story 1 |
| GET | /api/v1/minigames/sessions | 기본 v2, ?rulesVersion=v4 선택 | Story 1 |
| GET | /api/v1/minigames/sessions/{id} | 저장 버전 기준 상태·복구·결과 | Story 1의 초기 상태·원본 조회 |
| POST | /api/v1/minigames/sessions/{id}/complete | 버전별 최종 검증·정산 | v2만 현행, v4는 Story 3 |
| POST | /api/v1/minigames/sessions/{id}/abandon | 무보상 포기 | 기존 경로 유지 |
| POST | /api/v1/minigames/sessions/{id}/deliveries | 납품 승인·다음 주문 | **Story 2 구현** |

모든 API의 공통 계약:
- 기존 Access JWT·ROLE_MEMBER·활성 회원·sid 검증. JSESSIONID/Refresh 쿠키/온보딩 토큰으로 대체 불가.
- userId/walletId/서버 불/품질/지급액을 입력받지 않는다.
- session ID는 양의 BIGINT 십진수 문자열. JS Number로 변환하지 않는다.
- 본인 세션과 없는 세션은 같은 404.
- JSON Content-Type 필수. 미정의 필드·중복 JSON 키·비정수·숫자 문자열 거절.
- 성공·오류·GET·재생 모두 Cache-Control: no-store. 인증 정보·원본 로그·불을 서버 로그에 출력하지 않는다.
- 기존 AUTH_ALLOWED_ORIGINS 및 Authorization/Content-Type/Idempotency-Key CORS를 유지하고 deliveries OPTIONS만 추가한다. 와일드카드·쿠키 인증 확대 금지.
- 인증은 영수증 재생보다 먼저 수행한다.

### 2.2 v2 호환성

1. 시작 rulesVersion 미지정 또는 v2는 기존 v2. v4만 새 처리.
2. 컬렉션 GET 버전 미지정은 기존 v2 응답 그대로.
3. 세션 GET/complete/abandon은 저장된 버전으로 dispatch.
4. v4 필드·헤더·마감·오류 의미를 v2 요청에 강제하지 않는다.
5. 과거 v2 로그·최초 결과·거부 결과는 기존 규칙으로 재응답한다.
6. 새 키의 v2/v4 시작은 기존 활성 판을 기존 정책대로 무보상 종료한다. 같은 키 재생은 새 판·추가 포기를 만들지 않는다.
7. 같은 시작 키를 다른 버전으로 재사용하면 409 IDEMPOTENCY_KEY_CONFLICT.
8. 시작 응답은 최초 영수증이다. 그 후 종료됐어도 최초 PLAYING 응답을 재생할 수 있으므로 v4도 직후 GET으로 현재 상태를 확인한다.

### 2.3 멱등 키

| 요청 | 식별 |
| --- | --- |
| start | 필수 Idempotency-Key, (userId, start key) |
| deliveries | 필수 Idempotency-Key, (sessionId, DELIVERY, key) |
| v4 complete | 필수 Idempotency-Key, (sessionId, COMPLETE, key) |
| abandon | session ID + 빈 본문 자체, 별도 키 불필요 |
| GET | 없음 |

- 키는 ASCII 영숫자/_/- 1~64자. 중복 헤더 거절.
- 같은 키·같은 의미 본문은 최초 HTTP 상태·JSON을 재생한다. 전송 헤더/공백의 byte-identical은 요구하지 않는다.
- 같은 키·다른 의미 본문은 409, 원래 영수증 불변.
- 이 비교는 형식 검증·실제 log 해시 재계산을 통과한 요청에 적용한다. JSON 자체가 잘못됐거나 주장 hash가 log와 다르면 기존 영수증을 변경하지 않고400을 우선 반환한다.
- JSON 필드 순서·공백은 차이가 아니다. clientScore 변경은 complete 본문 차이다.
- 영수증 재생은 소유권 이후, 현재 상태·기한 검사 이전.
- DB/커밋 실패는 503 및 결과 불명으로 취급한다. 새 키 자동 재시도 금지.

## 3. 시간·카운트다운·종료 순서

### 3.1 [설계 기본안] 시작 POST로 미래 시각 예약

별도 /begin API를 추가하지 않는다. 한 번의 시작 트랜잭션에서 다음을 저장한다.

| 값 | 기본안 |
| --- | --- |
| issuedAt | 서버 시작 결정 시각 |
| countdownStartsAt | issuedAt + 준비 여유 1000ms |
| playStartsAt (=v4 startedAt) | countdownStartsAt + 3500ms |
| playEndsAt | playStartsAt + 60000ms |
| submitDeadline | playEndsAt + 제출 유예 15000ms |
| expiresAt | submitDeadline + 처리 drain 10000ms |

3500/60000ms는 기존 UX·확정 정책, 나머지는 조정 가능한 기술 수치다. 제출/drain 여유가 새 입력 시간을 늘리지는 않는다.

- 공통 status는 준비 중도 PLAYING. 파생 phase는 WAITING_START/COUNTDOWN/PLAYING/AWAITING_COMPLETION/terminal.
- 카운트다운 구간은 정확히 3500ms. v4 started_at은 playStartsAt, issuedAt은 별도 저장하고 시작 빈도는 issuedAt 기준.
- 같은 키는 지난 시각이어도 최초 원점을 반환한다. 원점·기한 재설정 금지.

### 3.2 FE 시간 동기화

1. 시작 POST 후 즉시 GET으로 현재 상태를 확인한다. GET serverNow는 응답 직전 샘플이다.
2. GET 송신 m0/수신 m1을 performance.now()로 잰다.
3. 수신 시 추정 서버 시각=serverNow+(m1-m0)/2, 이후 monotonic 경과로 진행한다.
4. countdownStartsAt 전에는 “준비 중”, 그 뒤 남은 카운트다운, playStartsAt 이후 플레이.
5. t=floor(추정 서버 시각-playStartsAt), 0<=t<60000일 때만 행동.
6. 끝나면 모달·탭 비활성·단절과 무관하게 입력을 닫고 최종 로그를 고정.
7. 복귀 GET으로 재동기화하되 기존 행동 t를 고치지 않는다. 보정 시 역행하면 다음 합법 간격까지 입력을 막는다.
8. RTT>1000ms면 재샘플링·지연 안내. 서버 원점은 바꾸지 않는다.

불변 시작 응답의 issuedAt은 현재 시각 샘플이 아니다. 재시도 응답으로 시계를 보정하지 않는다.

**한계:** 무제한 지연에서 “FE가 항상 3.5초 전체를 보고 서버 원점도 고정”은 동시에 보장할 수 없다. 1000ms 여유 안에 동기화하면 전체 카운트다운을 유지한다. 늦으면 남은 시간만 표시하고 서버 원점을 미루지 않는다. 종료 뒤에는 플레이하지 않고 결과/만료를 조회한다. 자동 새 판 반복 생성 금지.

### 3.3 서버 검증·수신 순서

- 서버 진입 시 requestReceivedAt을 기록한다. 클라이언트의 수신 시각 주장은 사용하지 않는다.
- t 정수 0..59999, 전체 간격>=50ms, 같은 철판 칸>=300ms.
- 최초 prefix의 마지막 t는 requestReceivedAt-playStartsAt+250ms 이하여야 한다. 250ms는 조정 가능한 추정 오차이며 60000 이상 허용이 아니다.
- playStartsAt 이전 행동 승인 금지. 과도한 미래 t는 422 TIME_AHEAD.
- 완료의 최초 수신은 playEndsAt 이상, submitDeadline 이하. 이른 완료는 422 TOO_EARLY, 판·로그를 소비하지 않는다.
- 새 납품도 submitDeadline까지 수신 가능하지만 모든 t는 플레이 구간 안이어야 한다.
- 기한 내 수신해 DB 잠금을 기다린 요청은 requestReceivedAt 기준으로 검사한다. 무한 대기하지 않는다.
- 만료 전이는 expiresAt 이후. drain 동안 새로운 제출 권리는 없다.
- HTTP 도착순 전역 FIFO를 보장하지 않는다. 같은 판 잠금 아래 최초 유효 terminal 커밋이 승리한다. 장기 서버 정지/과부하로 만료가 먼저 확정되면 소급 지급하지 않는다.
- 권장 예산: 본문 수신 2초, 잠금 대기 2초, DB 처리 5초. 구현 때 query/transaction timeout·commit 실패를 검증한다. 브라우저 AbortSignal은 서버 롤백 증거가 아니다.
- 서버 시각 동기화 전제. 큰 시계 역행은 기한 연장 대신 새 시작/정산을 503 보류.
- 합법처럼 조작한 로그·자동화를 모두 차단한다는 보장은 없다.

## 4. 규칙·불·주문

### 4.1 버전과 스냅샷

- rulesVersion=v4는 알고리즘, configVersion은 불변 설정 식별자.
- 판별 전체 설정 저장. 같은 configVersion의 값 변경 금지. 기존 판에는 변경 미적용.
- 예시 configVersion=v4-20261027.1은 미배포 설계 식별자.
- 네 소 bean/custard/pizza/chocolate는 같은 불 분포·조리 시간.
- 익힘=floor(h*(N*6000+R*8000)/(8000*6000)), long 중간 범위 검사, 구간별 선내림 금지.
- 품질: 0..49/100 이상 전체 실패, 50..69/91..99 면당2, 70..90 면당5.
- 양면 황금 콤보+1, GOOD 혼합 유지, 실패·철판/쟁반 폐기 초기화.
- 갱신 콤보3..5는 *1.2, 6이상 *1.5, 내림 후 빵에 저장. 총점은 납품 때만.
- 특수 납품 빵 각각 floor(보관 점수*50/100). 기본 재료·미납품·폐기에 보너스 없음.

### 4.2 [설계 기본안] 불 512개 일괄 발급

서버 SecureRandom으로 85..115 정수 512개 생성·보관·전달. FE 400/BE 64를 자동 승계하지 않는다.

로그 1200개, 초기 빈 칸6개에서 FILL F회는 최소 3F-6개 행동이 필요하다. 각 빵 POUR/FILL 두 번과 마지막6개를 제외한 칸 재사용의 최소 제거 한 번 때문이다. 따라서 F<=floor((1200+6)/3)=402라는 보수적 상한이며 512개로 충분하다. 다른 간격 제약은 상한을 늘리지 않는다.

- 성공 FILL만 값 소비, 양면 동일, 폐기 후 재사용 금지.
- 현 한도에서는 추가 공급 API 없음. 한도가 바뀌면 상한 재산정.
- 원본 비정상·소진은 409 HEAT_SOURCE_UNAVAILABLE, 상태 진행·FE 추첨/재활용 금지.
- 전체 불 노출에 따른 최적 입력 가능성은 남으며 공급 지연 최소화를 우선한다.

### 4.3 주문

- 첫 주문 bean2.
- 둘째부터 주문 단위 특수 여부20%, 총 수량1..4 균등 추첨.
- 기본은 각 빵 bean/custard 균등 선택. 특수는 pizza/chocolate 중 하나를 먼저1개, 나머지는 네 소에서 균등 선택.
- 위 세부 분포는 FE makeOrderList를 존중한 설계 기본안. 특수 포함 주문의 확률이20%다.
- 네 수량 모두 정수>=0, 합1..4.
- orderId는 판 내1부터 십진수 문자열, FE orderIndex는0부터 정수.
- 첫 주문만 제공. 성공 납품에서 다음 한 건 생성·저장, 재조회·재시도 재추첨 금지.
- 미래 주문 배열/시드 비노출.
- 종류별 FIFO, 정확한 전체 주문만 원자 소비. 여분 유지·부분 납품/대체 금지.

## 5. 행동 로그·승인 범위·checkpoint

### 5.1 행동 DTO

이름은 이 설계에서 FE와 맞추기 위해 채택한 네트워크 기본안이다.

| action | 공통 seq/action/t 외 필수 | 의미 |
| --- | --- | --- |
| POUR | slot 0..5 | 빈 칸 |
| FILL | slot, filling | 반죽 칸, 불 소비 |
| TURN | slot | front 뒤집기/back 꺼내기 |
| DISCARD | slot | 철판 폐기 |
| TRAY_DISCARD | breadId 양의 정수 | 배열 index 아님 |
| DELIVER | orderId, deliveryKey | 네트워크에 slot=-1/order index 없음 |

- seq는1부터 연속, 성공 행동만 기록. 미정의 필드 거절.
- breadId는 판 내 made 꺼내기 번호. 실패도 번호 소비하나 쟁반에는 없음. FE TrayBread.id=made+1과 일치한다.
- 승인 prefix의 ID 불변. 배열 위치 변경과 무관.
- log는 최초부터 throughSeq까지 전체 prefix, 최대1200개. throughSeq=log.length=마지막seq. 빈 complete는0 가능.
- deliveries 마지막은 DELIVER, 그 deliveryKey=헤더 키.
- complete 마지막은 조리·폐기여도 된다.
- 요청 UTF-8 JSON 최대256KiB 기본안. 전체 트리 파싱 전 크기 검사, 압축 요청 미지원415.
- 위 한도·압축 정책은 **v4 전용**이다. session 경로는 저장 버전으로 선별하고, 혼합 start 경로는 streaming으로 버전·크기를 확인한 뒤 트리를 만든다. rulesVersion 필드 순서를 강제하지 않으며 기존 v2 요청에256KiB를 소급 적용하지 않는다.
- 원본·점수·품질·잔액은 입력하지 않는다.

### 5.2 prefix 해시

해시는 신원·합법성·승인의 증명이 아니다. 서버 재계산과 원본 대조가 필수다.

1. H0=SHA-256(UTF-8("BUNGEOPPANG/v4") || LF || UTF-8(sessionId) || LF || UTF-8(configVersion) || LF). LF는 값 0x0A 한 바이트다. 문자열 backslash+n을 넣지 않는다.
2. tuple=[seq,action,t,slotOrNull,fillingOrNull,breadIdOrNull,orderIdOrNull,deliveryKeyOrNull].
3. tuple은 공백 없는 JSON 배열, 정수는 십진수, enum/식별 키는 ASCII.
4. Hi=SHA-256(H(i-1)을 hex decode한32byte || LF1byte || tuple UTF-8).
5. wire prefixHash=Hi 소문자64자리 hex.
6. 이미 승인된 seq의 해시·저장 원본이 다르면409 PREFIX_MISMATCH.
7. DELIVERY 본문 식별=[sessionId,rulesVersion,throughSeq,prefixHash]의 canonical JSON SHA-256. deliveryKey는 prefix에 포함됨.
8. COMPLETE는 위 배열 뒤에 정렬·중복 제거 seenTips와 clientScore(null 포함)를 추가. 누락 seenTips=[].
9. 주장한 prefixHash만 믿고 최초 요청을 승인하지 않는다.

### 5.3 승인 경계

- checkpoint는 승인 prefix 시점의 상태이며 현재 시각에 자동 뒤집은 상태가 아니다.
- revision은 저장 때 증가, throughSeq/prefixHash는 승인 경계.
- 오래된 base라는 이유만으로 거절하지 않는다. 전체 prefix가 현재 승인 원본을 포함하고 같으면 확장 검증.
- 승인 prefix 수정 금지. 같은 주문을 다른 키로 다시 승인하지 않는다.
- 원본 이벤트는 한 번 저장하고 영수증은 경계를 참조하여 반복 저장을 줄인다.
- checkpoint: 6칸·쟁반·불 cursor·마지막t·현재 주문·combo/누계.
- GET: 승인 로그·이미 발급된 주문 이력까지 제공하여 처음부터 재생 가능.
- 다음 주문 대기 중 조리는 계속, 새 DELIVER는 차단.

### 5.4 영속 납품 영수증

저장: sessionId/key/orderId/본문hash/seq/prefixHash/ACCEPTED 또는 REJECTED/HTTP상태/최초JSON/시각/checkpoint/다음주문.

- 성공 및 업무상 명시 거부의 최초 응답을 저장. 형식·인증·크기·rate·DB 장애는 판정 영수증 아님.
- UNIQUE(sessionId, operation, key), 성공에 UNIQUE(sessionId, acceptedOrderId). 거부 행 acceptedOrderId=NULL.
- 승인 checkpoint·다음 주문·영수증은 같은 트랜잭션.
- 재생은 **그 당시** checkpoint/다음 주문, 최신 상태는 GET.
- 이후 완료됐어도 영수증 재생은 활성화·코인 지급을 하지 않는다.

## 6. API별 상세 계약과 JSON

### 예시 읽는 방법

이하 901/주문1·2/키는 합성 예시이며 실제 회원·토큰이 아니다. 불 배열이 모두100인 것은 공통 fixture 설명용 원본이다. **실서비스 기본값을 고정100으로 만드는 것이 아니다.** 실제 서버는 규칙 범위에서 SecureRandom으로 생성한다.

S1/D1/A1/C1/C2/R2/R3/P9 같은 이름은 이 문서에 실린 **완전한 JSON 객체**의 별칭이다. 이후 “본문 D1 그대로”는 필드를 생략하거나 바꾸라는 뜻이 아니다. 로그·해시는 문서 예시로 계산한 값이다.

### 6.1 POST /api/v1/minigames/sessions — v4 준비·시작 예약

헤더: Authorization: Bearer <Access JWT>, Content-Type: application/json, Idempotency-Key: start-v4-001

요청:
```json
{
  "minigameType": "BUNGEOPPANG",
  "rulesVersion": "v4"
}
```

**201 S1**:
```json
{
  "minigameSessionId": "901",
  "minigameType": "BUNGEOPPANG",
  "status": "PLAYING",
  "phase": "WAITING_START",
  "rulesVersion": "v4",
  "configVersion": "v4-20261027.1",
  "issuedAt": "2026-10-27T00:00:00.000Z",
  "startedAt": "2026-10-27T00:00:04.500Z",
  "timing": {
    "countdownStartsAt": "2026-10-27T00:00:01.000Z",
    "playStartsAt": "2026-10-27T00:00:04.500Z",
    "playEndsAt": "2026-10-27T00:01:04.500Z",
    "submitDeadline": "2026-10-27T00:01:19.500Z",
    "expiresAt": "2026-10-27T00:01:29.500Z"
  },
  "rules": {
    "slots": 6,
    "durationMs": 60000,
    "countdownMs": 3500,
    "sideMs": 8000,
    "rushSideMs": 6000,
    "rushFromMs": 40000,
    "heatMin": 85,
    "heatMax": 115,
    "heatListLength": 512,
    "trayCapacity": 4,
    "maxOrderItems": 4,
    "specialOrderChancePercent": 20,
    "specialBonusPercent": 50,
    "firstOrder": {
      "bean": 2,
      "custard": 0,
      "pizza": 0,
      "chocolate": 0
    },
    "okFrom": 50,
    "goldenFrom": 70,
    "goldenTo": 90,
    "burntFrom": 100,
    "okPoint": 2,
    "goldenPoint": 5,
    "pointsPerCoin": 15,
    "dailyCoinCap": 100,
    "minGapMs": 50,
    "sameSlotGapMs": 300,
    "maxLogEntries": 1200
  },
  "heats": [
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100
  ],
  "isFirstGame": true,
  "checkpoint": {
    "revision": 0,
    "throughSeq": 0,
    "prefixHash": "57b9fe339b296f349f03b006a396e0d29e865f7770ab36162eb5ee606c7fd2e7",
    "heatCursor": 0,
    "lastAt": null,
    "slots": [
      {
        "slot": 0,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      },
      {
        "slot": 1,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      },
      {
        "slot": 2,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      },
      {
        "slot": 3,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      },
      {
        "slot": 4,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      },
      {
        "slot": 5,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      }
    ],
    "tray": [],
    "stats": {
      "score": 0,
      "made": 0,
      "successfulMade": 0,
      "golden": 0,
      "failed": 0,
      "wasted": 0,
      "grillDiscarded": 0,
      "trayDiscarded": 0,
      "combo": 0,
      "maxCombo": 0,
      "served": 0,
      "customersServed": 0,
      "specialServed": 0,
      "bonusScore": 0
    },
    "currentOrder": {
      "orderId": "1",
      "orderIndex": 0,
      "items": {
        "bean": 2,
        "custard": 0,
        "pizza": 0,
        "chocolate": 0
      }
    }
  }
}
```

- rules의 모든 필드는 필수. 단위는 ms/정수/%로 명시된 값 그대로. firstOrder 네 필드 필수.
- checkpoint 구조의 모든 필드는 필수이며 nullable은 filling/lastAt과 명시된 currentOrder뿐이다.
- 1000ms 준비 여유·마감·오차/크기 등 기술 정책도 config 스냅샷에 저장하고 timing으로 유도값 제공. 수신자가 상수를 재추정하지 않는다.
- 동일 키 재생도201, 같은 S1. 다음 주문·불·원점 새 생성 금지.
- Wallet→기존 활성 세션 ID 오름차순→새 세션 순으로 잠금. 시작 한도·기존 판 종료·새 판·원본·시작 영수증을 원자 커밋.
- **지갑 생성/보너스/차감 없음.**
- 오류: 공통401/403/400, 키 충돌409, 시작 한도429, Wallet/DB503.
- FE: 키·요청 고정→S1 수신→GET 시각/현재 상태 확인→카운트다운. 종료된 시작 영수증을 다시 플레이하지 않는다.
- v2: 기존 본문·응답·64개 불 유지.

### 6.2 GET /api/v1/minigames/sessions?rulesVersion=v4 — 시작 화면·활성 판 발견

본문 없음, Authorization 필수. **200**:
```json
{
  "rulesVersion": "v4",
  "serverNow": "2026-10-27T00:00:00.000Z",
  "todayEarned": 0,
  "dailyCap": 100,
  "isFirstGame": true,
  "seenTips": [],
  "activeSessionId": null,
  "supportedRulesVersions": [
    "v2",
    "v4"
  ]
}
```

- activeSessionId는 활성 판이 없으면 null, 있으면 문자열. v2 판이어도 ID를 돌려주고 실제 GET에서 버전을 확인한다.
- 오늘 todayEarned는 응답 처리 시각의 KST 누계이며 과거 결과 영수증의 todayEarned와 구별한다.
- 잘못된 rulesVersion은400 INVALID_REQUEST. 지원하지 않는 정상 버전 문자열은409 RULES_VERSION_MISMATCH.
- 새 키로 무조건 시작하지 말고 기존 활성 판을 복구하거나 사용자가 포기/새 판을 선택하게 한다.
- Wallet→세션 순서로 만료 정리·조회. 현재 v2의 profile 최초 생성 특성을 유지할 수 있다. GET이 코인을 지급하지는 않는다.
- 오류: 공통401/403, 버전400/409, DB503.
- v2: query 미지정/v2는 기존 JSON을 그대로 반환. v4 목록 필드를 강제 추가하지 않는다.

### 6.3 GET /api/v1/minigames/sessions/{id} — 상태·복구·결과

본문 없음. 저장 버전이 v4인 판의 기본 **200 P9**:
```json
{
  "minigameSessionId": "901",
  "rulesVersion": "v4",
  "configVersion": "v4-20261027.1",
  "status": "PLAYING",
  "phase": "PLAYING",
  "score": null,
  "rewardAmount": 0,
  "endedAt": null,
  "endReason": null,
  "serverNow": "2026-10-27T00:00:32.000Z",
  "startedAt": "2026-10-27T00:00:04.500Z",
  "timing": {
    "countdownStartsAt": "2026-10-27T00:00:01.000Z",
    "playStartsAt": "2026-10-27T00:00:04.500Z",
    "playEndsAt": "2026-10-27T00:01:04.500Z",
    "submitDeadline": "2026-10-27T00:01:19.500Z",
    "expiresAt": "2026-10-27T00:01:29.500Z"
  },
  "checkpoint": {
    "revision": 1,
    "throughSeq": 9,
    "prefixHash": "3390310f411991a992eabfe657bc5022cb0d10fe4dcff34f1e33813164407d34",
    "heatCursor": 2,
    "lastAt": 26400,
    "slots": [
      {
        "slot": 0,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": 13100
      },
      {
        "slot": 1,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": 26300
      },
      {
        "slot": 2,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      },
      {
        "slot": 3,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      },
      {
        "slot": 4,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      },
      {
        "slot": 5,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      }
    ],
    "tray": [],
    "stats": {
      "score": 20,
      "made": 2,
      "successfulMade": 2,
      "golden": 2,
      "failed": 0,
      "wasted": 0,
      "grillDiscarded": 0,
      "trayDiscarded": 0,
      "combo": 2,
      "maxCombo": 2,
      "served": 2,
      "customersServed": 1,
      "specialServed": 0,
      "bonusScore": 0
    },
    "currentOrder": {
      "orderId": "2",
      "orderIndex": 1,
      "items": {
        "bean": 0,
        "custard": 1,
        "pizza": 0,
        "chocolate": 0
      }
    }
  },
  "acceptedLog": [
    {
      "seq": 1,
      "action": "POUR",
      "t": 0,
      "slot": 0
    },
    {
      "seq": 2,
      "action": "FILL",
      "t": 300,
      "slot": 0,
      "filling": "bean"
    },
    {
      "seq": 3,
      "action": "TURN",
      "t": 6700,
      "slot": 0
    },
    {
      "seq": 4,
      "action": "TURN",
      "t": 13100,
      "slot": 0
    },
    {
      "seq": 5,
      "action": "POUR",
      "t": 13200,
      "slot": 1
    },
    {
      "seq": 6,
      "action": "FILL",
      "t": 13500,
      "slot": 1,
      "filling": "bean"
    },
    {
      "seq": 7,
      "action": "TURN",
      "t": 19900,
      "slot": 1
    },
    {
      "seq": 8,
      "action": "TURN",
      "t": 26300,
      "slot": 1
    },
    {
      "seq": 9,
      "action": "DELIVER",
      "t": 26400,
      "orderId": "1",
      "deliveryKey": "delivery-901-1"
    }
  ],
  "issuedOrders": [
    {
      "orderId": "1",
      "orderIndex": 0,
      "items": {
        "bean": 2,
        "custard": 0,
        "pizza": 0,
        "chocolate": 0
      }
    },
    {
      "orderId": "2",
      "orderIndex": 1,
      "items": {
        "bean": 0,
        "custard": 1,
        "pizza": 0,
        "chocolate": 0
      }
    }
  ],
  "result": null,
  "deliveryLookup": null
}
```

복구 원본:
- 기본 GET은 위 checkpoint/acceptedLog/issuedOrders를 반환한다.
- **?includeSource=true**는 S1과 같은 rules·heats·issuedAt·isFirstGame 필드를 추가한다. 브라우저 재시작/새로고침·원본 유실 때 사용한다. 설정·불 원본은 저장된 그대로다.
- 이미 발급된 주문 이력만 반환한다. 사용하지 않은 미래 주문은 없다.
- deliveryLookup 기본 null. **?deliveryKey=delivery-901-1**이면 deliveryKey/outcome/httpStatus/response 네 필드 객체다. ACCEPTED는 httpStatus=200, response=**§6.4 A1 JSON 객체 전체**다. REJECTED는 저장한 오류 상태와 §7 오류 객체다. response를 JSON 문자열로 한 번 더 인코딩하지 않는다. 아래는 실제 UNKNOWN 객체:
```json
{
  "deliveryKey": "delivery-901-1",
  "outcome": "UNKNOWN",
  "httpStatus": null,
  "response": null
}
```

- UNKNOWN은 아직 처리 중인 요청도 포함한다. “서버가 처리하지 않았다”는 확정 증거가 아니다.
- 저장된 최종 결과가 있으면 status=COMPLETED, phase=COMPLETED, result=R2 또는 R3 전체. GET이 재계산·지급을 실행하지 않는다.
- 기본 GET의 공통 필드는 minigameSessionId/rulesVersion/configVersion/status/phase/score/rewardAmount/startedAt/endedAt/endReason/serverNow/timing/checkpoint/acceptedLog/issuedOrders/result/deliveryLookup이다. 모두 키를 포함하며 명시한 null을 사용한다.
- 활성 판은 checkpoint가 필수이고 result/endedAt/endReason=null이다. terminal은 checkpoint=null, acceptedLog/issuedOrders=[]를 기본으로 하며 ?includeProgress=true면 마지막 보관 checkpoint·확정 로그·발급 이력을 채운다. COMPLETED의 endedAt은 settledAt과 같고 포기/만료는 해당 서버 결정 시각이다.
- ABANDONED/INVALID이면 result=null, rewardAmount=0, endReason 명시. 세션 응답 최상위 rewardAmount는 모든 상태에 포함한다.
- PLAYING 동안 최상위 score=null, COMPLETED이면 최종 score. 해당 필드는 v2와 같은 의미다. 진행 점수는 checkpoint.stats.score다.
- 응답 시각 serverNow와 파생 phase는 매번 최신이고 영수증 불변성이 적용되지 않는다.
- Wallet→세션 잠금으로 expiry 검사. 만료 시 INVALID/EXPIRED 전이만 가능, 자동 지급 없음.
- 400 잘못된ID/query, 404 타인/없는 판, 401/403 인증, 503 DB.
- v2: 기존 상태 JSON 유지. v4 전용 query로 v2 판을 v4로 변환하지 않는다.

### 6.4 POST /api/v1/minigames/sessions/{id}/deliveries — 납품

헤더: Authorization, Content-Type, **Idempotency-Key: delivery-901-1**.

요청 **D1**:
```json
{
  "rulesVersion": "v4",
  "throughSeq": 9,
  "prefixHash": "3390310f411991a992eabfe657bc5022cb0d10fe4dcff34f1e33813164407d34",
  "log": [
    {
      "seq": 1,
      "action": "POUR",
      "t": 0,
      "slot": 0
    },
    {
      "seq": 2,
      "action": "FILL",
      "t": 300,
      "slot": 0,
      "filling": "bean"
    },
    {
      "seq": 3,
      "action": "TURN",
      "t": 6700,
      "slot": 0
    },
    {
      "seq": 4,
      "action": "TURN",
      "t": 13100,
      "slot": 0
    },
    {
      "seq": 5,
      "action": "POUR",
      "t": 13200,
      "slot": 1
    },
    {
      "seq": 6,
      "action": "FILL",
      "t": 13500,
      "slot": 1,
      "filling": "bean"
    },
    {
      "seq": 7,
      "action": "TURN",
      "t": 19900,
      "slot": 1
    },
    {
      "seq": 8,
      "action": "TURN",
      "t": 26300,
      "slot": 1
    },
    {
      "seq": 9,
      "action": "DELIVER",
      "t": 26400,
      "orderId": "1",
      "deliveryKey": "delivery-901-1"
    }
  ]
}
```

**200 A1**:
```json
{
  "minigameSessionId": "901",
  "deliveryKey": "delivery-901-1",
  "orderId": "1",
  "accepted": true,
  "acceptedAt": "2026-10-27T00:00:31.000Z",
  "throughSeq": 9,
  "prefixHash": "3390310f411991a992eabfe657bc5022cb0d10fe4dcff34f1e33813164407d34",
  "consumedBreadIds": [
    1,
    2
  ],
  "scoreDelta": 20,
  "bonusDelta": 0,
  "nextOrder": {
    "orderId": "2",
    "orderIndex": 1,
    "items": {
      "bean": 0,
      "custard": 1,
      "pizza": 0,
      "chocolate": 0
    }
  },
  "checkpoint": {
    "revision": 1,
    "throughSeq": 9,
    "prefixHash": "3390310f411991a992eabfe657bc5022cb0d10fe4dcff34f1e33813164407d34",
    "heatCursor": 2,
    "lastAt": 26400,
    "slots": [
      {
        "slot": 0,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": 13100
      },
      {
        "slot": 1,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": 26300
      },
      {
        "slot": 2,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      },
      {
        "slot": 3,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      },
      {
        "slot": 4,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      },
      {
        "slot": 5,
        "phase": "empty",
        "since": 0,
        "heat": 100,
        "filling": null,
        "front": 0,
        "lastAt": null
      }
    ],
    "tray": [],
    "stats": {
      "score": 20,
      "made": 2,
      "successfulMade": 2,
      "golden": 2,
      "failed": 0,
      "wasted": 0,
      "grillDiscarded": 0,
      "trayDiscarded": 0,
      "combo": 2,
      "maxCombo": 2,
      "served": 2,
      "customersServed": 1,
      "specialServed": 0,
      "bonusScore": 0
    },
    "currentOrder": {
      "orderId": "2",
      "orderIndex": 1,
      "items": {
        "bean": 0,
        "custard": 1,
        "pizza": 0,
        "chocolate": 0
      }
    }
  }
}
```

- consumedBreadIds는 FIFO 실제 소비 ID. scoreDelta에는 bonusDelta가 이미 포함된다.
- checkpoint.stats.score는 누적 승인 점수다. 납품마다 **코인 지급0, 원장0**.
- 요청 마지막 DELIVER의 주문이 현재 발급 주문이어야 한다.
- 같은 키·본문은 A1 그대로. 더 최신 checkpoint/주문으로 바꿔 돌려주지 않는다.
- 같은 주문을 다른 키로 새로 승인하려 하면409 ORDER_ALREADY_DELIVERED. 원래 키로 조회/재시도한다.
- 업무상 거부는 승인 prefix·재고·점수·주문을 바꾸지 않고 REJECTED 영수증을 저장한다.
- Wallet→세션→주문/영수증 순으로 잠금. prefix 재검증·FIFO 소비·checkpoint·다음 주문·영수증을 같은 트랜잭션에 저장한다.
- 입력·prefix hash를 실제 log로 재계산한 뒤 영수증 본문 일치를 확인한다. 주장된 hash만 비교하고 변조 log를 동일 요청으로 취급하지 않는다.
- 오류: 400 형식/hash 불일치, 409 키·승인 prefix·주문 충돌, 422 규칙 거부/미래시각, 413 크기, 429 요청률, 503 DB, 401/403/404 공통.
- FE: 로컬 DELIVER 예상 반영→고정 D1/키 보관→후속 조리 허용·다음 납품 차단→A1 검증→승인 경계 표시·다음 주문 연결. §9의 merge 절차를 따른다.
- v2 판은409 RULES_VERSION_MISMATCH. 기존 v2 operation에는 영향 없음.

### 6.5 POST /api/v1/minigames/sessions/{id}/complete — 최종 확정

v4 헤더: Authorization, Content-Type, **Idempotency-Key: complete-901-1**.

요청 **C1** — 납품 뒤 추가한 슈크림1개는 미납품 상태:
```json
{
  "rulesVersion": "v4",
  "throughSeq": 13,
  "prefixHash": "9659ebde878244b86d0127b9ecc109462b6b614ee462349aea5069ff28d9e86b",
  "log": [
    {
      "seq": 1,
      "action": "POUR",
      "t": 0,
      "slot": 0
    },
    {
      "seq": 2,
      "action": "FILL",
      "t": 300,
      "slot": 0,
      "filling": "bean"
    },
    {
      "seq": 3,
      "action": "TURN",
      "t": 6700,
      "slot": 0
    },
    {
      "seq": 4,
      "action": "TURN",
      "t": 13100,
      "slot": 0
    },
    {
      "seq": 5,
      "action": "POUR",
      "t": 13200,
      "slot": 1
    },
    {
      "seq": 6,
      "action": "FILL",
      "t": 13500,
      "slot": 1,
      "filling": "bean"
    },
    {
      "seq": 7,
      "action": "TURN",
      "t": 19900,
      "slot": 1
    },
    {
      "seq": 8,
      "action": "TURN",
      "t": 26300,
      "slot": 1
    },
    {
      "seq": 9,
      "action": "DELIVER",
      "t": 26400,
      "orderId": "1",
      "deliveryKey": "delivery-901-1"
    },
    {
      "seq": 10,
      "action": "POUR",
      "t": 26500,
      "slot": 2
    },
    {
      "seq": 11,
      "action": "FILL",
      "t": 26800,
      "slot": 2,
      "filling": "custard"
    },
    {
      "seq": 12,
      "action": "TURN",
      "t": 33200,
      "slot": 2
    },
    {
      "seq": 13,
      "action": "TURN",
      "t": 39600,
      "slot": 2
    }
  ],
  "seenTips": [
    "GOLD"
  ],
  "clientScore": 20
}
```

**200 R3**:
```json
{
  "minigameSessionId": "901",
  "status": "COMPLETED",
  "rulesVersion": "v4",
  "configVersion": "v4-20261027.1",
  "verifiedCompletedCount": 3,
  "rewardAmount": 1,
  "score": 20,
  "made": 3,
  "golden": 3,
  "failed": 0,
  "wasted": 0,
  "maxCombo": 3,
  "coinsCalculated": 1,
  "coinsGranted": 1,
  "todayEarned": 1,
  "dailyCap": 100,
  "capReached": false,
  "successfulMade": 3,
  "served": 2,
  "customersServed": 1,
  "specialServed": 0,
  "bonusScore": 0,
  "grillDiscarded": 0,
  "trayDiscarded": 0,
  "undeliveredCount": 1,
  "unfinishedGrillCount": 0,
  "rewardDate": "2026-10-27",
  "settledAt": "2026-10-27T00:01:04.700Z",
  "finalThroughSeq": 13,
  "finalPrefixHash": "9659ebde878244b86d0127b9ecc109462b6b614ee462349aea5069ff28d9e86b"
}
```

- 서버 원본/발급 주문/승인 prefix와 전체 로그를 다시 대조한다. clientScore는 진단 비교용이며 지급 근거가 아니다.
- throughSeq 이후 행동은 최종 결과에 넣지 않는다. FE는 최초 완료 요청의 로그/키를 고정한다.
- 마지막 미승인 DELIVER를 검증·승인하고 같은 키의 납품 영수증을 생성할 수 있다. 세부 규칙은 §8.
- 새 미승인 납품은 최대1건. FE는 다음 주문 ACK 전 다음 납품을 할 수 없기 때문이다. 미발급 주문 추정·다수 미승인 납품은 거절한다.
- Wallet→세션→주문/영수증 순으로 잠금, 전체 결과·최종 승인·일일 상한·Wallet·원장·최초 결과·안내 저장을 한 번 커밋.
- **커밋 전 성공 응답 금지.** 실패/rollback에 유효 결과·추가 지급 없음.
- 같은 키·본문은 최초 R3. 다른 키라도 최종 의미 본문이 같으면 같은 R3, 다르면409 FINAL_RESULT_CONFLICT 및 GET 안내.
- 422 TOO_EARLY는 재시도 가능. 422 LOG_INVALID/DELIVERY_REJECTED는 v4에서 복구를 요구하고 바로 terminal로 만들지 않는다. 입력 수정은 명시 거부를 확인한 뒤 새 complete 키로만 가능하다.
- 완전히 검증되지 않은 prefix의 일부만 건너뛰어 점수를 지급하지 않는다. 최종 요청이 실패하면 그 요청에서 합성한 납품/주문/점수도 rollback한다. 거부 영수증만 별도로 일관되게 보존한다.
- 오류: 400/413 입력, 409 prefix·종료·키 충돌, 422 이른 제출/규칙 거부, 429 요청률, 503 DB, 401/403/404 공통.
- FE: 완료 시점 로그 고정→C1→200 확정값 표시→Wallet 별도 조회. 유실은 같은 키 재시도/GET. 200 없이 예상 엽전을 실제 잔액에 더하지 않는다.
- v2: 기존 log/seenTips/clientScore 요청·키 없는 complete·v2의 terminal 거부 동작 유지.

### 6.6 POST /api/v1/minigames/sessions/{id}/abandon — 포기

Authorization, Content-Type. 요청:
```json
{}
```

**200**:
```json
{
  "minigameSessionId": "901",
  "status": "ABANDONED",
  "rewardAmount": 0,
  "rulesVersion": "v4",
  "endReason": "USER_ABANDONED"
}
```

- 준비/카운트다운/플레이/제출 대기에서 사용 가능. 완료되지 않은 판은 승인 점수가 있어도 무보상.
- Wallet→세션 잠금 아래 원본·영수증은 보존하고 terminal 기록. 다음 주문/입력/완료 신규 승인 금지.
- 이미 ABANDONED면 같은200. COMPLETED면409 MINIGAME_ALREADY_COMPLETED, INVALID면409 MINIGAME_ALREADY_INVALID.
- 완료와 경합하여 포기가 rollback되거나 지면200을 반환하지 않는다. DB 장애503은 포기 성공이 아니다.
- FE: 확인 UI 유지, 결과 불명 시 같은 요청/GET. 성공 확인 후 공원 복귀. 완료가 이겼으면 결과를 조회한다.
- v2: 기존200 필드만 반환, v4 endReason 등을 강제하지 않는다.

## 7. 오류·재시도 계약

### 7.1 공통 JSON

업무상 명시 거부 예시 **E1**:
```json
{
  "code": "DELIVERY_REJECTED",
  "message": "납품 기록을 승인하지 못했습니다. 진행 상태를 다시 확인해 주세요.",
  "details": null,
  "detail": "ORDER_NOT_READY",
  "index": 8,
  "recovery": {
    "action": "LOAD_CHECKPOINT",
    "minigameSessionId": "901",
    "checkpointRevision": 0,
    "acceptedThroughSeq": 0,
    "acceptedPrefixHash": "57b9fe339b296f349f03b006a396e0d29e865f7770ab36162eb5ee606c7fd2e7"
  },
  "retryAfterMs": null
}
```

추가 필드는 v4만 사용한다. index는 0-based log 배열 위치, seq는1-based다. details는 기존 호환 필드로 null이다. recovery에는 토큰/개인정보/전체 원본을 넣지 않는다.

| HTTP | code / detail | FE 동작 |
| --- | --- | --- |
| 400 | INVALID_REQUEST / LOG_HASH_MISMATCH | 클라이언트 형식 오류, 자동 본문 변경 재시도 금지 |
| 401 | 기존 AUTH 오류 | 인증 재확인. 게임 시간을 멈추지 않음 |
| 403 | 기존 Origin/권한 오류 | 설정/인증 문제. 상태 소비 금지 |
| 404 | MINIGAME_NOT_FOUND | 타인/없는 판 동일, 새 판 여부 안내 |
| 409 | IDEMPOTENCY_KEY_CONFLICT | 원래 본문/키 복구, 임의 덮어쓰기 금지 |
| 409 | PREFIX_MISMATCH / ORDER_ALREADY_DELIVERED / STALE_ORDER | GET checkpoint·영수증 확인 |
| 409 | DELIVERY_PREVIOUSLY_REJECTED | 원래 거부 영수증·최신 checkpoint로 복구 후 정정 요청 |
| 409 | RULES_VERSION_MISMATCH | 판 버전 확인, 잘못된 검증기 우회 금지 |
| 409 | GAME_NOT_ACTIVE / MINIGAME_ALREADY_* / FINAL_RESULT_CONFLICT | 최종 상태·결과 GET |
| 409 | HEAT_SOURCE_UNAVAILABLE | 입력 중단·원본 재조회, 임의 불 생성 금지 |
| 413 | REQUEST_TOO_LARGE | 자동 분할/기록 삭제 금지, 구현 한도 오류 |
| 415 | UNSUPPORTED_MEDIA_TYPE | application/json·무압축 요청으로 수정 |
| 422 | TOO_EARLY | retryAfterMs 뒤 같은 complete 재시도 |
| 422 | TIME_AHEAD | 재동기화·checkpoint 복구 |
| 422 | DELIVERY_REJECTED / ORDER_NOT_READY 등 | E1을 저장, §9 복구 후 새 의도 키 |
| 422 | LOG_INVALID | 최종 결과 아님. 복구 또는 포기, 기한 유지 |
| 429 | TOO_MANY_STARTS / TOO_MANY_REQUESTS | retryAfterMs 준수, 상태 미변경 |
| 503 | MINIGAME_NOT_CONFIGURED / MINIGAME_UNAVAILABLE | 결과 불명, GET·동일 키 재시도 |

TOO_EARLY 예시:
```json
{
  "code": "TOO_EARLY",
  "message": "플레이 종료 후 같은 요청으로 다시 확인해 주세요.",
  "details": null,
  "detail": null,
  "index": null,
  "recovery": {
    "action": "RETRY_SAME_REQUEST",
    "minigameSessionId": "901"
  },
  "retryAfterMs": 200
}
```

- 네트워크/5xx/timeout/abort는 명시적 납품 거부가 아니다. 납품 예상 상태를 즉시 rollback하지 않는다.
- 형식400·413·429·503에는 영수증이 없을 수 있다. GET UNKNOWN은 처리 중일 가능성을 남긴다.
- 기존 인증 필터의 code/message 전용 오류에는 위 추가 필드가 없을 수 있다. 이를 수용한다.
- 최종 판 상태와 영수증은 별개다. 예전 REJECTED 영수증 재생이 최신 COMPLETED를 취소하지 않는다.

## 8. 상태 전이·마지막 납품·지급

### 8.1 상태

| 공통 status | v4 phase/endReason | 처리 |
| --- | --- | --- |
| PLAYING | WAITING_START/COUNTDOWN/PLAYING/AWAITING_COMPLETION | 활성 판1개에 포함 |
| COMPLETED | COMPLETED / VERIFIED | 전체 로그 검증·한도·지급 동시 커밋 |
| ABANDONED | ABANDONED / USER_ABANDONED 또는 SUPERSEDED | 무보상 |
| INVALID | EXPIRED / SUBMISSION_EXPIRED | expiresAt 이후 무보상 |

입력 오류만으로 v4를 즉시 INVALID로 바꾸지 않는다. 복구 가능한 4xx는 terminal 전이가 아니다. 60초 종료는 조리를 닫는 것이며 자동 지급이나 즉시 INVALID가 아니다. COMPLETE/ABANDON/만료만 terminal 전이를 만든다. terminal 재활성화 금지.

### 8.2 마지막 미승인 납품

1. complete가 모든 저장 승인 prefix를 포함하는지 검사한다.
2. 승인되지 않은 DELIVER가 최대1건인지, 현재 서버 주문 ID인지 검사한다.
3. DELIVER의 deliveryKey로 해당 납품 prefix의 **동일 의미 본문**을 재구성한다. throughSeq는 DELIVER의 seq, prefixHash는 그 지점의 해시다.
4. 기존 성공 영수증이 있으면 같은 원본임을 확인해 재사용. 기존 거부면409 DELIVERY_PREVIOUSLY_REJECTED로 복구 요구. 같은 키 다른 내용도409.
5. 없으면 해당 prefix를 검증해 FIFO 납품·다음 주문·영수증을 같은 최종 트랜잭션에 생성한다.
6. 이후 조리 suffix도 검증. 모두 합법일 때만 최종 결과·지급을 커밋한다.
7. 마지막 납품 영수증은 일반 배송과 동일한 checkpoint/다음 주문 구조를 저장한다. 완료에서 먼저 승인하더라도 다음 주문1건을 영수증 일관성 목적으로 생성한다. 종료 뒤 플레이 권한을 주는 주문은 아니다.
8. FE ending/result 상태는 늦은 다음 주문 응답을 화면에 적용하지 않는다. GET 최종 결과를 우선한다.

| 도착/잠금 순서 | 결과 |
| --- | --- |
| delivery 성공 → complete | 승인 재사용, 최종1회 |
| complete 성공 → delivery 재시도 | 합성된 원래 납품 영수증 재생, 추가 지급0 |
| delivery 거부 → complete에 같은 거부 로그 | 복구 요구, 지급0 |
| complete 최종 suffix 검증 실패 | 그 complete에서 새 승인한 납품도 rollback, 기존 승인 유지 |
| complete와 abandon | 최초 유효 terminal 커밋만 승리 |
| expiry와 요청 | 기한·terminal을 같은 잠금에서 재검증, 최초 유효 전이만 승리 |

명시 거부 전송은 거부 영수증 커밋 뒤 수행한다. 성공 트랜잭션을 exception catch로 성공처럼 숨기지 않는다.

### 8.3 지급·일일 한도

- coinsCalculated=floor(서버 확정 납품 score/15).
- settlementAt은 Wallet·세션 잠금 아래 검증을 마친 성공 정산 결정 시각이다. 그 트랜잭션이 커밋돼야 유효하다.
- rewardDate=settlementAt의 Asia/Seoul 날짜. 시작일/플레이 종료일/HTTP 도착일이 아니다.
- 해당 날짜 COMPLETED 보상 합계를 기존 Repository.earned로 조회한다. v2/v4를 합쳐 하루100.
- coinsGranted=min(coinsCalculated, max(0,100-todayBefore)).
- rewardAmount=coinsGranted, todayEarned=todayBefore+coinsGranted.
- 0냥이어도 COMPLETED, 원장은 생성하지 않는다. 양수면 기존 MINIGAME_REWARD / minigame-reward:{id} UNIQUE 키1건.
- Wallet.creditReward의 overflow/예약금 불변식을 유지. reserved_balance는 바꾸지 않는다.
- 완료 상태·결과·Wallet·원장·안내·최종 납품을 동일 트랜잭션. DB 실패 때 부분 반영 금지.
- 정산 실패가 자정을 넘겨 재시도되면 **처음 실제 성공한** 결정 시각의 날짜로 귀속된다.
- 성공 후 다음 날 재조회/재시도는 원래 rewardDate/todayEarned/지급액을 그대로 반환. 현재 오늘 누계는 컬렉션 GET에서 따로 조회한다.
- 별도 지갑·일일 집계 원본·Redis·분산 정산을 추가하지 않는다.

### 8.4 결과 필드 의미

| 필드 | 의미 |
| --- | --- |
| made / verifiedCompletedCount | 실패 포함 정상적으로 처리된 꺼내기 횟수, 두 값 동일 |
| successfulMade | made-failed |
| golden | 양면 PERFECT 꺼내기 수 |
| failed | RAW/BURNT가 포함된 꺼내기 수 |
| wasted | 명시적 철판·쟁반 폐기 합 |
| grillDiscarded / trayDiscarded | 폐기 원인별 수 |
| served | 주문에 실제 납품한 빵 수 |
| customersServed | 승인 완료 주문 수 |
| specialServed | 실제 납품 pizza/chocolate 수 |
| bonusScore | score에 이미 포함된 특수 추가 점수 |
| undeliveredCount | 종료 때 남은 정상 쟁반 수 |
| unfinishedGrillCount | 종료 때 비어 있지 않은 철판 수 |
| maxCombo | 꺼내기 기준 최고 콤보 |
| coinsCalculated / coinsGranted | 계산 보상 / 실제 지급 |
| rewardDate / settledAt | 불변 한도 귀속일 / 성공 결정 시각 |

잔여 쟁반·철판을 자동 DISCARD로 추가해 wasted를 늘리지 않는다. made·failed·wasted는 서로 배타적인 분류가 아니므로 더해서 총 생산 수로 쓰지 않는다.

## 9. FE 복구·ACK 병합 절차

### 9.1 응답 유실/503/timeout

1. 고정한 deliveryKey·D1·후속 로컬 로그를 보존한다. 새 key로 같은 납품을 보내지 않는다.
2. 다음 납품만 막고 조리·철판/쟁반 폐기·타이머는 계속한다.
3. 같은 D1을 재시도하거나 GET ?deliveryKey=... 조회.
4. ACCEPTED면 원래 A1을 적용. REJECTED면 §9.3. UNKNOWN이면 아직 결과 불명으로 동일 요청 재시도.
5. 단절이 길어 종료되면 마지막 DELIVER·같은 deliveryKey를 포함한 고정 complete를 제출한다. 임의로 DELIVER를 삭제하지 않는다.
6. 인증 실패는 기존 로그인 복구 흐름을 사용하되 판의 시간은 멈추지 않는다. 종료 결과 조회는 새로운 유효 Access로도 같은 회원이면 가능하다.

### 9.2 성공 ACK와 후속 조리

- 영수증 checkpoint의 throughSeq까지 승인 표시.
- 현재 로컬 로그가 그 prefix와 같으면 **현재 grill/tray를 통째로 교체하지 않는다.** 뒤에 계속한 조리 suffix를 유지하고 nextOrder만 붙인다.
- 필요한 경우 서버 checkpoint를 복원하고 suffix를 순서대로 재생한다. 같은 납품 점수를 두 번 더하지 않는다.
- revision이 더 낮은 중복/지연 ACK는 승인 이력 확인용이지 최신 상태를 되돌리는 근거가 아니다.
- 같은 key의 ACK 중복으로 주문 index를 또 올리지 않는다.
- 방문 토큰·sessionId·rulesVersion·orderId·seq/hash 확인을 기존 visit 방어와 함께 사용한다.
- ending/result/다른 방문이면 다음 주문 카드는 표시하지 않는다. ACK의 승인 사실은 기록하고 결과 GET을 우선한다.

### 9.3 명시적 거부

1. 409/422의 업무상 REJECTED 영수증 또는 그에 해당하는 GET 결과를 확인한다. 단순 timeout으로 이 절차를 시작하지 않는다.
2. 서버의 **최신** GET checkpoint를 가져온다. 오류에 담긴 revision은 당시 값일 수 있다.
3. 승인 prefix는 절대 수정하지 않는다. 로컬 원본 사용자 행동 큐와 미승인 suffix를 별도로 보존한다.
4. 거부된 납품 및 이후 아직 미승인인 DELIVER는 재생 대상에서 제외한다. 납품을 자동 재실행하지 않고 사용자가 새 현재 주문을 확인하도록 한다.
5. checkpoint부터 나머지 조리·폐기 의도를 원래 t·소·칸/빵 ID로 재생한다. 실제 합법인 행동만 새 미승인 로그로 만든다.
6. 대상 빵이 없거나 간격·상태가 맞지 않는 의도는 복구 로그에 넣지 않고 안내한다. 임의 시간 이동·원본 불 변경·기본 재료 대체 금지.
7. 새 미승인 seq는 acceptedThroughSeq+1부터 다시 연속 부여하고 prefixHash를 재계산한다. 승인 구간 seq는 불변.
8. breadId는 재생된 made 순서로 결정한다. 과거 예측에만 있던 빵을 잘못 가리키지 않도록 사용자 행동 큐에서 생산 의도와 현재 breadId 매핑을 확인한다.
9. 바뀐 납품/complete 본문에는 **새 키**. 원래 거부 key는 최초 거부 재생용으로 보존한다.
10. 이미 ending이라면 새 입력은 금지하고 종료 전 의도의 합법 재생만 허용한다. 제출 기한은 늘어나지 않는다.
11. latest GET이 terminal이면 복구를 중단하고 그 결과/무보상 종료를 따른다.

이 절차는 **FE의 미승인 예상 상태 재구성**이다. 서버가 불법 로그를 조용히 건너뛰어 부분 점수를 지급하는 기능이 아니다. 서버는 새로 제출된 전체 로그가 합법인지 다시 검증한다.

### 9.4 결과 응답 유실

- 최초 complete body/key를 유지하고 GET을 수행한다.
- COMPLETED면 result 그대로 사용. Wallet은 별도 조회하고 예상 보상을 직접 더하지 않는다.
- PLAYING/AWAITING_COMPLETION은 원래 complete가 실패했다는 증거가 아니다. 동일 요청 재시도.
- ABANDONED/INVALID는 지급0. 완료로 되돌리지 않는다.
- 원본이 없어졌으면 서버 승인 prefix만으로 최종 원본을 임의 생성하지 않는다. 이미 완료한 결과만 복구하고, 미완료는 기한 후 무보상 종료한다.

## 10. FE·BE 공동 시나리오 9개

각 시나리오는 합성 판901을 사용하는 독립 예시다. §6의 S1/D1/A1/C1/R3과 아래 C2/R2는 실제 JSON 본문 별칭이다. 서로 다른 분기의 요청을 한 판에 섞지 않는다. 인증 헤더의 실제 토큰은 기재하지 않는다.

### 10.1 v4 준비 → 카운트다운 → 플레이

- POST /api/v1/minigames/sessions, Idempotency-Key: start-v4-001, §6.1 요청 →201 S1.
- GET /api/v1/minigames/sessions/901, 본문 없음 →200, 초기 checkpoint는 S1과 같고 아래 시간:
```json
{
  "minigameSessionId": "901",
  "rulesVersion": "v4",
  "status": "PLAYING",
  "phase": "WAITING_START",
  "serverNow": "2026-10-27T00:00:00.400Z",
  "timing": {
    "countdownStartsAt": "2026-10-27T00:00:01.000Z",
    "playStartsAt": "2026-10-27T00:00:04.500Z",
    "playEndsAt": "2026-10-27T00:01:04.500Z",
    "submitDeadline": "2026-10-27T00:01:19.500Z",
    "expiresAt": "2026-10-27T00:01:29.500Z"
  }
}
```
이 JSON은 **시각 관련 필드 발췌**다. 실제 기본 GET 전체 필드는 §6.3처럼 모두 포함한다.
- FE: 시각 보정→00:00:01.000Z부터3.5초 카운트다운→00:00:04.500Z부터t=0 플레이.
- 상태 전이·키 재시도로 원점 재설정 없음. FE가 늦으면 남은 카운트다운만.

### 10.2 팥2 조리 → 납품 → 다음 주문

- FE 최초 주문은 팥2, 불100 두 개라는 합성 원본.
- seq1..8을 하면 made2/golden2/combo2, 쟁반 breadId1·2, **총점0**.
- POST /api/v1/minigames/sessions/901/deliveries, 키 delivery-901-1, **본문 D1 전체** →200 **A1 전체**.
- FE: 예상 납품20점→승인20점. 쟁반 비움, 다음 주문2(예시 슈크림1).
- 서버 Wallet·원장 변화0.

### 10.3 납품 응답 유실 → 동일 요청 재시도

- 서버 D1 승인·커밋 후 A1 응답만 유실.
- FE는 새 key를 만들지 않고 같은 경로·키·D1을 다시 보냄 →200 **동일 A1**.
- GET ?deliveryKey=delivery-901-1도 ACCEPTED와 A1.
- 서버 주문은 계속2이며 재추첨/추가 납품/코인 지급 없음.
- 같은 키로 log/throughSeq를 바꾸면409 IDEMPOTENCY_KEY_CONFLICT. log와 주장 hash가 맞지 않으면400.

### 10.4 납품 대기 중 추가 조리

D1을 보낸 뒤 응답 대기 중 로컬 suffix:
```json
[
  {
    "seq": 10,
    "action": "POUR",
    "t": 26500,
    "slot": 2
  },
  {
    "seq": 11,
    "action": "FILL",
    "t": 26800,
    "slot": 2,
    "filling": "custard"
  },
  {
    "seq": 12,
    "action": "TURN",
    "t": 33200,
    "slot": 2
  },
  {
    "seq": 13,
    "action": "TURN",
    "t": 39600,
    "slot": 2
  }
]
```

- 서버에는 D1의 seq9까지만 요청된 상태. 이 suffix를 원래 D1 재시도에 덧붙이지 않는다.
- FE 조리·타이머 지속, 다음 DELIVER는 차단.
- A1 수신 때 seq10..13을 지우지 않는다. checkpoint9 + suffix 재생 시 custard breadId3/보관12점, combo3, **총점은20**.
- 이후 POST complete 키 complete-901-1, 본문 **C1 전체** →200 **R3 전체**. 미납품 custard의12점은 지급 점수에 포함하지 않는다.

### 10.5 서버 납품 거부 → checkpoint 복구

첫 판에서 두 번째 FILL이 custard라 팥이1개뿐인 별도 예시. 키 delivery-901-1, POST deliveries:
```json
{
  "rulesVersion": "v4",
  "throughSeq": 9,
  "prefixHash": "7fa285cd02bc56b6217eae7598dbab656b413dd434469c649c093cdd7ce2b9ff",
  "log": [
    {
      "seq": 1,
      "action": "POUR",
      "t": 0,
      "slot": 0
    },
    {
      "seq": 2,
      "action": "FILL",
      "t": 300,
      "slot": 0,
      "filling": "bean"
    },
    {
      "seq": 3,
      "action": "TURN",
      "t": 6700,
      "slot": 0
    },
    {
      "seq": 4,
      "action": "TURN",
      "t": 13100,
      "slot": 0
    },
    {
      "seq": 5,
      "action": "POUR",
      "t": 13200,
      "slot": 1
    },
    {
      "seq": 6,
      "action": "FILL",
      "t": 13500,
      "slot": 1,
      "filling": "custard"
    },
    {
      "seq": 7,
      "action": "TURN",
      "t": 19900,
      "slot": 1
    },
    {
      "seq": 8,
      "action": "TURN",
      "t": 26300,
      "slot": 1
    },
    {
      "seq": 9,
      "action": "DELIVER",
      "t": 26400,
      "orderId": "1",
      "deliveryKey": "delivery-901-1"
    }
  ]
}
```

응답은422 **E1 전체**. 해당 납품 prefix는 승인되지 않고 checkpoint0 유지. 재요청도 같은 E1.

- FE 예상 납품을 취소하려면 GET으로 최신 checkpoint0을 확인한다.
- seq1..8의 합법 조리를 재생하면 쟁반 bean1/custard1, score0. 잘못된 DELIVER9는 재생하지 않는다.
- 그 뒤 실제로 팥을 더 구우면 그 행동을 새 suffix로 기록하고, 현재 주문1을 새 key로 다시 납품한다.
- 원래 t/불 원본·FIFO를 유지하고 “빵만 환급”하는 보정 이벤트는 만들지 않는다.
- 이미 끝났으면 기한 내 기존 행동의 복구만 가능. 새 조리를 늦게 수행해 t를 과거로 넣는 것은 금지.

### 10.6 59900ms 납품 → 60000ms 종료 → 최종 정산

동일한 두 팥을 쟁반에 보관하다 마지막에 전달하는 독립 분기다. **D2**:
```json
{
  "rulesVersion": "v4",
  "throughSeq": 9,
  "prefixHash": "94970ad3b1fb5221a6f7098aa448e737ed6021dcd76f13d34702a1b1f72cefd0",
  "log": [
    {
      "seq": 1,
      "action": "POUR",
      "t": 0,
      "slot": 0
    },
    {
      "seq": 2,
      "action": "FILL",
      "t": 300,
      "slot": 0,
      "filling": "bean"
    },
    {
      "seq": 3,
      "action": "TURN",
      "t": 6700,
      "slot": 0
    },
    {
      "seq": 4,
      "action": "TURN",
      "t": 13100,
      "slot": 0
    },
    {
      "seq": 5,
      "action": "POUR",
      "t": 13200,
      "slot": 1
    },
    {
      "seq": 6,
      "action": "FILL",
      "t": 13500,
      "slot": 1,
      "filling": "bean"
    },
    {
      "seq": 7,
      "action": "TURN",
      "t": 19900,
      "slot": 1
    },
    {
      "seq": 8,
      "action": "TURN",
      "t": 26300,
      "slot": 1
    },
    {
      "seq": 9,
      "action": "DELIVER",
      "t": 59900,
      "orderId": "1",
      "deliveryKey": "delivery-901-1"
    }
  ]
}
```

- POST deliveries 키 delivery-901-1. 행동 t=59900은 유효. 서버 수신 예: playEndsAt+80ms로 지연돼도 submitDeadline 이내이면 검증 가능.
- FE t=60000에 새 입력을 닫는다. 서버 수신이 늦었다고 조리시간을 추가하지 않는다.
- 완료 요청 **C2**, 키 complete-901-last:
```json
{
  "rulesVersion": "v4",
  "throughSeq": 9,
  "prefixHash": "94970ad3b1fb5221a6f7098aa448e737ed6021dcd76f13d34702a1b1f72cefd0",
  "log": [
    {
      "seq": 1,
      "action": "POUR",
      "t": 0,
      "slot": 0
    },
    {
      "seq": 2,
      "action": "FILL",
      "t": 300,
      "slot": 0,
      "filling": "bean"
    },
    {
      "seq": 3,
      "action": "TURN",
      "t": 6700,
      "slot": 0
    },
    {
      "seq": 4,
      "action": "TURN",
      "t": 13100,
      "slot": 0
    },
    {
      "seq": 5,
      "action": "POUR",
      "t": 13200,
      "slot": 1
    },
    {
      "seq": 6,
      "action": "FILL",
      "t": 13500,
      "slot": 1,
      "filling": "bean"
    },
    {
      "seq": 7,
      "action": "TURN",
      "t": 19900,
      "slot": 1
    },
    {
      "seq": 8,
      "action": "TURN",
      "t": 26300,
      "slot": 1
    },
    {
      "seq": 9,
      "action": "DELIVER",
      "t": 59900,
      "orderId": "1",
      "deliveryKey": "delivery-901-1"
    }
  ],
  "seenTips": [
    "GOLD"
  ],
  "clientScore": 20
}
```

**200 R2**:
```json
{
  "minigameSessionId": "901",
  "status": "COMPLETED",
  "rulesVersion": "v4",
  "configVersion": "v4-20261027.1",
  "verifiedCompletedCount": 2,
  "rewardAmount": 1,
  "score": 20,
  "made": 2,
  "golden": 2,
  "failed": 0,
  "wasted": 0,
  "maxCombo": 2,
  "coinsCalculated": 1,
  "coinsGranted": 1,
  "todayEarned": 1,
  "dailyCap": 100,
  "capReached": false,
  "successfulMade": 2,
  "served": 2,
  "customersServed": 1,
  "specialServed": 0,
  "bonusScore": 0,
  "grillDiscarded": 0,
  "trayDiscarded": 0,
  "undeliveredCount": 0,
  "unfinishedGrillCount": 0,
  "rewardDate": "2026-10-27",
  "settledAt": "2026-10-27T00:01:04.700Z",
  "finalThroughSeq": 9,
  "finalPrefixHash": "94970ad3b1fb5221a6f7098aa448e737ed6021dcd76f13d34702a1b1f72cefd0"
}
```

- delivery가 먼저면 그 영수증 재사용.
- complete가 먼저면 D2의 seq/hash/key로 납품 영수증을 같은 Tx에서 생성 후 지급1회.
- 이후 D2 재시도는200 저장 영수증. nextOrder는 이미 종료된 FE에 표시하지 않는다.
- t=60000 또는60001이면 거절. 서버 수신이 늦어도 59900을60000으로 고치지 않는다.

### 10.7 완료와 포기 동시 요청

- A: POST /901/complete, 키 complete-901-last, C2.
- B: POST /901/abandon, 본문 {}.
- 둘 다 유효한 시각이라면 동일 Wallet→세션 잠금으로 직렬화.

A가 먼저 유효 커밋:
- A→200 R2.
- B→409:
```json
{
  "code": "MINIGAME_ALREADY_COMPLETED",
  "message": "이미 보상이 확정된 미니게임입니다.",
  "details": null,
  "detail": null,
  "index": null,
  "recovery": {
    "action": "LOAD_RESULT",
    "minigameSessionId": "901"
  },
  "retryAfterMs": null
}
```
- FE는 GET으로 R2를 표시. 보상 취소 없음.

B가 먼저 유효 커밋:
- B→200 §6.6 포기 응답.
- A→409:
```json
{
  "code": "MINIGAME_ALREADY_ABANDONED",
  "message": "이미 종료된 미니게임입니다.",
  "details": null,
  "detail": null,
  "index": null,
  "recovery": {
    "action": "LOAD_RESULT",
    "minigameSessionId": "901"
  },
  "retryAfterMs": null
}
```
- Wallet 지급0, 기존 승인 점수도 코인으로 전환하지 않는다.
- A가 TOO_EARLY/불법 로그면 terminal 경쟁 승자가 될 수 없다.

### 10.8 최종 응답 유실 → GET 결과

C1이 커밋되어 R3이 저장됐으나 응답 유실:
- GET /api/v1/minigames/sessions/901 →200:
```json
{
  "minigameSessionId": "901",
  "rulesVersion": "v4",
  "configVersion": "v4-20261027.1",
  "status": "COMPLETED",
  "phase": "COMPLETED",
  "score": 20,
  "rewardAmount": 1,
  "endedAt": "2026-10-27T00:01:04.700Z",
  "endReason": "VERIFIED",
  "serverNow": "2026-10-27T00:01:06.000Z",
  "startedAt": "2026-10-27T00:00:04.500Z",
  "timing": {
    "countdownStartsAt": "2026-10-27T00:00:01.000Z",
    "playStartsAt": "2026-10-27T00:00:04.500Z",
    "playEndsAt": "2026-10-27T00:01:04.500Z",
    "submitDeadline": "2026-10-27T00:01:19.500Z",
    "expiresAt": "2026-10-27T00:01:29.500Z"
  },
  "checkpoint": null,
  "acceptedLog": [],
  "issuedOrders": [],
  "result": {
    "minigameSessionId": "901",
    "status": "COMPLETED",
    "rulesVersion": "v4",
    "configVersion": "v4-20261027.1",
    "verifiedCompletedCount": 3,
    "rewardAmount": 1,
    "score": 20,
    "made": 3,
    "golden": 3,
    "failed": 0,
    "wasted": 0,
    "maxCombo": 3,
    "coinsCalculated": 1,
    "coinsGranted": 1,
    "todayEarned": 1,
    "dailyCap": 100,
    "capReached": false,
    "successfulMade": 3,
    "served": 2,
    "customersServed": 1,
    "specialServed": 0,
    "bonusScore": 0,
    "grillDiscarded": 0,
    "trayDiscarded": 0,
    "undeliveredCount": 1,
    "unfinishedGrillCount": 0,
    "rewardDate": "2026-10-27",
    "settledAt": "2026-10-27T00:01:04.700Z",
    "finalThroughSeq": 13,
    "finalPrefixHash": "9659ebde878244b86d0127b9ecc109462b6b614ee462349aea5069ff28d9e86b"
  },
  "deliveryLookup": null
}
```
- COMPLETED의 checkpoint는 **null**, acceptedLog/issuedOrders는 **빈 배열**이다. ?includeProgress=true로 보관된 진행·감사 자료를 요청할 수 있다.
- FE는 R3 그대로 표시, 재제출로 보상을 만들지 않음. 같은 C1·키 재요청도200 R3.
- 별도 GET /api/v1/wallets/me 예:
```json
{
  "balance": 101,
  "reservedBalance": 0,
  "availableBalance": 101
}
```
초기 잔액100/예약0의 합성 예시다. 서버가 실제 반환한 지갑을 사용하며 클라이언트가 +1 계산으로 대체하지 않는다.

### 10.9 기존 v2 정상 유지

POST /api/v1/minigames/sessions, 키 start-v2-001:
```json
{
  "minigameType": "BUNGEOPPANG"
}
```
→201, 기존 v2 시작 응답·heats64·v2 규칙. GET 컬렉션 버전 미지정도 v2.

POST /api/v1/minigames/sessions/902/complete, **Idempotency-Key 없이**:
```json
{
  "log": [
    {
      "slot": 0,
      "action": "POUR",
      "t": 0
    },
    {
      "slot": 0,
      "action": "FILL",
      "t": 300
    },
    {
      "slot": 0,
      "action": "TURN",
      "t": 6700
    },
    {
      "slot": 0,
      "action": "TURN",
      "t": 13100
    }
  ],
  "seenTips": [
    "GOLD"
  ],
  "clientScore": 10
}
```
불100인 해당 v2 합성 판에서 기존 최소60초 경과 후 **200**:
```json
{
  "minigameSessionId": "902",
  "status": "COMPLETED",
  "verifiedCompletedCount": 1,
  "rewardAmount": 0,
  "score": 10,
  "made": 1,
  "golden": 1,
  "failed": 0,
  "wasted": 0,
  "maxCombo": 1,
  "coinsCalculated": 0,
  "coinsGranted": 0,
  "todayEarned": 0,
  "dailyCap": 100,
  "capReached": false
}
```
- v2는 꺼내기 즉시10점,15점 미만0냥. v4 납품·seq·기한·checkpoint를 요구하지 않는다.
- v2의 t=60000 허용·10분 만료 등 기존 규칙도 그대로 유지한다.
- 별도 회원/날짜 또는 기존 누계0의 독립 예시다. 같은 회원이면 v2/v4 지급을 합쳐 하루100을 적용한다.

## 11. BE 저장 구조·잠금·복구 기본안

### 11.1 기존 공통 구조 보존

- minigame_sessions / minigame_start_requests / bungeoppang_records / bungeoppang_profiles 유지.
- v2 시작이 기존 v4 판을 종료하는 경우에도 공통 종료 helper로 v4 메타데이터의 SUPERSEDED·revision을 함께 기록한다. 공통 status만 바꾸고 v4 상태를 열어 두지 않는다. 기존 v2 응답은 변경하지 않는다.
- Wallet·WalletTransaction·MINIGAME_REWARD·minigame-reward:{id} 재사용.
- 기존 V110/V111 및 적용 SQL 수정 금지. 기존 판 데이터 변환/초기화 없음.
- Story 1 착수 시 로컬 저장소의 최고 migration은 V123이었고 V124 충돌이 없음을 확인해
  `V124__create_bungeoppang_v4_rounds_and_orders.sql`을 추가했다. 사용자 지시로 fetch하지 않았으므로
  원격 진행 중 MR의 번호 예약 여부까지 확인했다는 뜻은 아니다.

### 11.2 추가 영속 구조

Story 1은 판 원점과 발급 주문에 필요한 두 테이블을 V124와 JPA로 구현했다.
Story 2는 승인 로그와 영속 납품 영수증을 V125와 JPA로 구현했다. 최종 정산 필드는 Story 3 범위다.

| 구조 | 최소 필드·제약 | 상태 |
| --- | --- | --- |
| bungeoppang_v4_rounds | session_id PK/FK, config_version/json, 발급·카운트다운·플레이·제출·만료 시각, terminal_reason, revision, 승인 seq/hash, 초기 checkpoint JSON | **V124 구현** |
| bungeoppang_v4_orders | (session_id,order_id) UNIQUE, order_index UNIQUE per session, 네 수량, issued_at, 합1..4 CHECK | **V124 구현** |
| bungeoppang_v4_receipts | session_id, operation, key, request_hash, 대상order_id, accepted_order_id nullable, 판정·HTTP상태·response_json, 승인seq/hash, 시각 | **V125 Story 2 구현** |
| bungeoppang_v4_progress | session_id PK/FK, 승인 원본 로그 JSON | **V125 Story 2 구현** |

- accepted_order_id는 성공 DELIVERY만 채운다. REJECTED/COMPLETE는NULL이므로 정정 시도·완료 영수증과 충돌하지 않는다.
- start 요청의 의미 본문 비교는 기존 key→session→저장 type/version으로 가능하다. 신규 fingerprint 컬럼은 다른 필드가 늘어날 때 추가 검토한다.
- 성공한 final 결과는 기존 records.result_json에도 저장하여 공통 결과 재응답을 재사용한다. final hash와 terminal이 있어 삭제/재시도 후 새 지급을 만들지 않는다.
- JSON만으로 저장하는 대안은 단순하지만 성공 주문 UNIQUE·이력 조회가 약해진다. 본 문서는 주문·영수증을 행으로 저장하는 안을 권장한다.
- DB CHECK/FK는 기존 users soft delete와 충돌하지 않게 구성. 회원·지갑·원장 물리 삭제를 추가하지 않는다.

### 11.3 잠금과 커밋

1. 기존 인증에서 활성 회원/sid 검증.
2. Wallet PESSIMISTIC_WRITE.
3. 같은 회원의 대상 세션 PESSIMISTIC_WRITE. 시작으로 여러 판을 닫으면 ID 오름차순.
4. v4 메타데이터·주문·영수증을 고정 순서로 잠금.
5. 기존 영수증/terminal 확인, 실제 원본·prefix·기한·현재 상태 재검증.
6. 모든 검증 후 상태·자료·지급을 저장하고 flush.
7. **실제 commit 성공 이후** HTTP 성공 응답.
8. UNIQUE 경합·deadlock·commit 불명은 새 요청으로 무조건 반복하지 않는다. 동일 키 재조회로 수렴.

delivery에서는 Wallet balance/reserved를 바꾸지 않는다. Wallet 잠금은 기존 시작/완료/포기와의 일관된 순서를 우선한 최소안이다. 향후 배송에 Wallet 잠금을 빼려면 session→Wallet 역순 경로가 없다는 별도 경합 검증이 필요하다.

- 규칙 거부 자료는 서버 변경을 부분 커밋하지 않도록 분리한다. 검증은 새 상태 사본으로 먼저 끝내고, 거부면 승인 상태 변경 없이 영수증만 커밋한다.
- complete의 마지막 납품을 검증하다 최종 suffix가 불법이면 그 요청 전체의 성공 변경을 반영하지 않는다.
- DB commit/영수증 저장 실패를 정상 거부 영수증으로 가장하지 않는다. 결과 불명503과 GET 안내.
- HTTP 응답 전송 실패는 commit을 되돌리지 못한다. 영속 영수증·GET으로 해결한다.
- 메모리 캐시/Redis에만 원본·영수증을 두지 않는다. 애플리케이션 재시작 후에도 DB로 같은 결론을 반환한다.
- 재시작은 플레이 시각을 멈추거나 연장하지 않는다. 기한 내 같은 회원이면 복구, 미완료·만료는 무보상. 엔진/월드 장애를 사용자 기권으로 간주하지 않는다.

### 11.4 BE 파일·DTO 작업

아래는 전체 v4 예상 범위이며 Story 1에서 완료한 항목과 후속 항목을 구분한다.

| 파일/영역 | 변경 | 상태 |
| --- | --- | --- |
| backend/src/main/java/com/ssafy/ontop/minigame/controller/MinigameController.java | 엄격한 시작 v2/v4 dispatch, GET query | Story 1 |
| backend/src/main/java/com/ssafy/ontop/minigame/service/MinigameService.java | 기존 v2 유지·공통 생명주기·v4 원점/첫 주문 | Story 1 |
| backend/src/main/java/com/ssafy/ontop/minigame/service/BungeoppangV4Rules.java | v2와 분리한 v4 순수 규칙 | Story 1 |
| backend/src/main/java/com/ssafy/ontop/minigame/service/BungeoppangV4Spec.java | 설정 snapshot·시간·첫 주문·초기 checkpoint | Story 1 |
| backend/src/main/java/com/ssafy/ontop/minigame/repository/MinigameRepository.java | v4 원점·주문 조회와 기존 잠금 순서 | Story 1 |
| backend/src/main/java/com/ssafy/ontop/minigame/domain/BungeoppangV4*.java | round/order 엔티티 | Story 1 |
| backend/src/main/java/com/ssafy/ontop/minigame/dto/BungeoppangV4Responses.java | 시작·로비·판 조회 DTO | Story 1 |
| prefix canonicalizer·납품 DTO·서비스 | 승인·거부·복구 | Story 2 구현, 최종 정산은 Story 3 |
| backend/src/main/java/com/ssafy/ontop/minigame/config/MinigamePreflightFilter.java | deliveries OPTIONS | Story 2 구현, 기존 Origin 유지 |
| backend/src/main/java/com/ssafy/ontop/minigame/config/MinigameOpenApiCustomizer.java | 버전별 oneOf·nullable·Story 경계 | Story 1 |
| 미니게임 전용 입력 제한 경계 | 256KiB·중복 JSON 키·미지원 압축 거절 | Story 2 구현 |
| backend/src/main/resources/db/minigame/V124__create_bungeoppang_v4_rounds_and_orders.sql | Story 1 추가 구조 | Story 1 |
| backend/src/main/resources/db/minigame/V125__create_bungeoppang_v4_delivery_receipts.sql | 진행 원본·영속 납품 영수증 | Story 2 |
| 관련 테스트·docs/minigame-api.md | 실제 Story 1·2 계약 대조 | Story 1·2 |

현재 Wallet/원장 모델은 지급에 충분하므로 별도 경제 테이블·원장 유형·Reward API를 중복 추가하지 않는다.

## 12. FE 구현 영향과 유지 범위

### 12.1 그대로 유지

- 6칸·네 소·기존 입력/IME/F1/휠·이동 잠금·카메라·2D 손님·연출.
- 로컬 예상 조리·쟁반4개·종류별 FIFO·예상 납품 점수.
- 납품 대기 중 타이머·조리·폐기 지속.
- 3.5초 카운트다운의 시각적 흐름. 원점 연결만 서버 기준으로 변경.
- visit/session 가드, 늦은 이전 방문 응답 무시, frozen submission 재시도.
- 실제 지급과 예상 엽전 분리·Wallet 별도 조회.
- 기존 v2 기본 경로 및 명시적 개발 미리보기. API 실패 뒤 미리보기 fallback 금지.

### 12.2 예상 FE 파일별 변경

Story 2에서 FE v4 고정 커밋의 화면·연출을 보존하면서 아래 네트워크 연동을 구현했다.

| 파일 | 변경 이유·범위 |
| --- | --- |
| frontend/src/features/bungeoppang/service.ts | v2 유지, v4 어댑터 선택·DTO 검증·deliveries/GET/키/영수증·오류 구분. 내부 nextOrder를 서버 이름으로 복사하지 않음 |
| frontend/src/features/bungeoppang/serviceV4.ts | 실제 HTTP v4 어댑터·해시·복구 요청. 기존 BungeoppangService 포트에 연결 |
| frontend/src/features/bungeoppang/store.ts | 서버 시간 매핑, seq·key·frozen prefix, 후속 로그 ACK merge, checkpoint 복구·최종 경합·결과 재조회 |
| frontend/src/features/bungeoppang/rulesV4.ts | t<60000, checkpoint import/export/순수 복구 helper. 품질·콤보·FIFO 계산 재작성 불필요 |
| frontend/src/features/bungeoppang/config.ts | v4 네트워크 설정/512개를 서버 snapshot에서 적용. preview 400을 운영 계약으로 쓰지 않음 |
| frontend/src/features/bungeoppang/bungeoppangView.ts | gameNow를 동기화된 monotonic playAt에 연결. 기존 애니메이션 구조 유지 |
| frontend/src/features/bungeoppang/BungeoppangHud.tsx | 준비/승인 대기/복구/만료·계산/실지급 표시만 최소 보완. 현재 화면·손님 연출 유지 |
| frontend/tests/unit/bungeoppangV4.test.ts | 경계·안정 ID·checkpoint 재생·공통 fixture |
| frontend/tests/unit/bungeoppangService.test.ts | 실제 DTO·같은 키·유실·상세 오류·v2 호환 |
| frontend/tests/unit/bungeoppangSession.test.ts | server clock·늦은ACK·추가조리·완료경합·방문가드 |
| frontend/tests/fixtures/bungeoppang-v4.json | 순수 fixture 유지, 별도 네트워크 fixture로 seq/주문 ID/키 매핑 검증 |
| frontend/tests/bungeoppang-v4-e2e/ | 기존 UI 회귀와 실제 BE 계약 테스트를 구분 |

- 네트워크 TRAY_DISCARD의 breadId는 로컬 액션 시점 tray[index].id를 캡처한다. 납품 후 현재 배열을 보고 과거 index를 다시 해석하지 않는다.
- FE orderIndex는 orderId와 별도로 어댑터가 매핑한다.
- specialOrderChancePercent=20은 내부 규칙의0.2로 변환한다. 네트워크에 미래 orderListLength는 없다. 그 속성은 preview 전용으로 분리한다.
- 고정된 서버 rules를 순수 계산에 전달하고 global preview R로 덮어쓰지 않는다.
- 이번 연출 때문에 Grill/Feedback/월드·다른 아바타/서버 실시간 메시지를 새로 바꾸지 않는다.
- HTTP 추상화가 응답 헤더를 숨겨도 GET body.serverNow만으로 동기화할 수 있으므로 ParkRuntime 공통 구조를 바꿀 필요가 없다.

## 13. 기술 기본값·남은 선택

FE 확인 대기를 차단 조건으로 두지 않는다. 아래 기본안으로 구현 가능하며 변경 시 설정 버전과 문서를 함께 바꾼다.

| 항목 | 추천 기본안 | 대안·영향 |
| --- | --- | --- |
| 준비 여유 | 1000ms | RTT가 큰 환경에서는 더 길게. 항상 전체3.5초 보장은 불가능 |
| 제출 유예 / drain | 15초 / 10초 | 짧으면 응답 유실에 취약, 길면 결과 대기·상태 보관 증가 |
| 시간 추정 허용 | 250ms | 확대하면 미래 입력 허용 위험, 축소하면 정상 지연 오거절 |
| 불 목록 | 512, 추가 API 없음 | 분할 발급은 노출 감소하지만 지연·추가복구 필요 |
| 로그·본문 | 1200개 / 256KiB | 상한 변경 시 FILL 상한·불·검증 비용 재산정 |
| 새 mutation rate | 회원당 초당10, burst20 | Redis 없이 단일 인스턴스 제한. 시작은 기존 분당10 유지 |
| 거부 영수증 한도 | 판당128건 | 초과는429, 판이나 기존 영수증을 삭제하지 않음 |
| 단일 판 | v2/v4 전체1개 | 새 키 시작 시 이전 판 무보상, 다중 판은 범위 외 |
| 저장 원본 정리 | 초기 구현에서 자동 삭제 없음 | 추후30일 원본 정리 검토. terminal/성공결과/지급 중복 방지 tombstone은 보존 |
| 종료 우선순위 | 잠금 내 최초 유효 terminal 커밋 | HTTP 도착순 강제는 durable admission queue까지 필요하므로 이번 최소안에 추가하지 않음 |
| 만료 작업 | GET/시작/완료에서 lazy 검사, 필요 시 같은 로직의 주기 sweep | 어느 경우도 자동 지급 없음 |
| PROD 활성화 | 기존 비활성 유지 | 실제 운영 노출은 별도 배포 승인·프로필 검증 |

[안전 조건] Clock 급변·장기 DB 중단에서 정상 사용자 보상을 무한 보장하지 않는다. 기한과 최초 terminal을 임의로 뒤집지 않고 상태·거부 이유·재시도 결과로 관측한다. 실제 RTT/부하에 따른 수치 조정은 관련 검증 결과로 결정하며 기존 판 값은 변경하지 않는다.

### 13.1 FE·BE 공동 적용 세부조건

이전 문서의 “FE 합의 필요” 항목은 이 문서에서 추천 기본안까지 제시했다. 담당자가 그대로 적용할 수 있으며 FE 추가 답변을 착수 조건으로 요구하지 않는다.

- 시간: 미래 원점+1000ms 여유, GET 시각 샘플, 늦으면 남은 카운트다운만.
- 식별: breadId=꺼내기 번호, orderId=판 내 문자열 순번, DELIVER에 deliveryKey.
- 승인: 전체 prefix와 해시, frozen 요청 재시도, 영수증 내 다음 주문 고정.
- 복구: 유실은 동일 요청 확인, 명시 거부는 최신 checkpoint+의도 재생·새 키.
- 마지막 납품: 완료에서 같은 영수증 합성, 늦은 ACK는 결과를 덮지 않음.
- 지급: 최초 성공 정산 결정 시각 KST, 같은 결과 재생, 미납품·포기·만료 무지급.

아직 확인이 필요한 외부 사실은 실제 DEV의 적용 버전/기능 활성화/지갑 준비와 향후 migration 번호 예약이다. 임의로 설정하거나 본 문서에서 확인 완료로 표시하지 않는다.

## 14. Jira Story 3개 초안

기존 MINIGAME Epic·관련 MINI-01~04 이슈를 먼저 재사용/연결한다. 번호·브랜치를 추측하거나 생성하지 않는다. API 수로 쪼개지 않고 인수 가능한 흐름별 구성이다. 테스트·문서·OpenAPI는 각 Story에 포함한다.

### Story A — [BE] 붕어빵 v4 규칙 및 판·현재 주문 발급

**상태:** Epic S15P31B105-224의 Story 1 구현 범위. 관련 검증을 통과한 커밋에서 완료로 확정한다.

**Purpose**
v2를 보존하면서 v4 원본과 서버 시간으로 플레이를 시작한다.

**Tasks**
- 버전 dispatch, 설정 snapshot, 미래 원점·서버 시각, 회원당 활성1판.
- 네 소·불·쟁반·FIFO·콤보·납품 점수 순수 재계산.
- 첫/현재 주문·512개 불 보관, 시작 멱등성·충돌.
- 신규 migration 및 JPA validate를 격리 DB에서 검증.

**Acceptance Criteria**
- BE-01~08 경계/조리/불소비/4칸쟁반, 미납품0점, 3/6콤보12/15.
- v2 요청/응답/저장 결과 유지, 같은키 버전 충돌409.
- 시작 재시도에 불·주문·원점 동일, v2/v4 동시 시작에도 활성1판.
- RTT·늦은응답·탭복귀·60000 경계에서 원점 불변.
- 시각/키/주문/설정은 서버 보관, 토큰/원본 로그 노출 없음.

**References**
네 원문, 본 문서 §0~6.3, 기존 MINIGAME 코드/fixture.

### Story B — [BE] 붕어빵 납품 승인 및 checkpoint 복구

**Purpose**
예상 납품 UX를 유지하며 서버 승인·다음 주문·유실 복구를 일관되게 처리한다.

**Tasks**
- deliveries, 영속 성공/거부 영수증, seq/hash·원본 비교.
- stable breadId·주문 ID, GET checkpoint/영수증/발급 주문 이력.
- FE v4 어댑터·후속 조리 merge·명시 거부 복구.
- CORS preflight·요청 한도·관측·OpenAPI.

**Acceptance Criteria**
- 28점 예시, 특수7점 빵당 보너스3, 여분/FIFO·부족 주문 무부분반영.
- 같은키 동일응답/다른본문409, 같은주문 다른키 중복승인 차단.
- 응답 유실·거부·timeout을 구분하고 조리·타이머 유지.
- 납품 중 코인/원장0, DB rollback 시 승인·다음주문도 없음.
- checkpoint 복구 후 승인prefix 불변, 후속 합법 로그만 재생.
- 재시작 후 같은 영수증·다음주문·원본 복원.

**References**
본 문서 §5~7·9·10.2~10.5, handoff 우선요구1·3.

### Story C — [BE] 붕어빵 v4 종료 검증 및 멱등 보상 정산

**Purpose**
마지막 납품 경합을 해결하고 실제 지갑 지급·결과 복구를 완료한다.

**Tasks**
- complete의 마지막 납품 승인·전체 재계산·같은 영수증 생성.
- 완료/포기/만료 최초유효terminal, 결과 GET·재시도.
- Wallet·원장·KST상한·최종 응답 원자성.
- FE ending/result 처리·지급 구분·관련 통합 검증.

**Acceptance Criteria**
- 59900 유효/60000 거절, 납품/완료 순서가 달라도 결과·지급1회.
- 완료/포기/만료 경합은 terminal1개. 정상 완료 뒤 포기는 보상 취소 안 함.
- 동시 완료·다른 판/버전 일일 한도 경합·원장/commit 실패에서 중복·부분 지급 없음.
- 99냥 상태와44/45점, KST 자정 전후 실패/성공/다음날 재시도.
- 결과 유실 GET 복구와 Wallet SQL 대조, reserved 불변.
- v2·Shop 구매/보상·공통 Auth 회귀 유지.

**References**
본 문서 §8~11, handoff 우선요구2·4, 기존 MySQL 동시성 테스트.

## 15. 공동 인수 체크리스트와 검증 계획

### 15.1 FE handoff 반영

- [x] 세션·주문·승인 행동 경계 식별
- [x] 동일 납품 재시도에 최초 승인·같은 다음 주문
- [x] 미래 주문 목록 비노출
- [x] frozen 납품 prefix와 증가하는 후속 로그 연결
- [x] 유실과 명시 거부 분리·checkpoint 복원
- [x] 납품 대기 중 타이머·조리 지속
- [x] 59900 납품/60000 종료/완료 선행 처리
- [x] 완료·포기·만료 경쟁과 terminal 재조회
- [x] 시작 원점·3.5초·규칙/설정·불 길이·정확한 경계
- [x] FILL 소·stable 빵 ID·서버 주문 ID·seq/hash
- [x] made/served/보너스·계산보상/실지급·KST날짜 구분
- [x] 현재 FE 화면·연출 유지, 연출용 API 추가 없음

체크는 계약 반영 표시다. Story 1은 시작 원점·규칙/설정·불 길이·첫 주문·순수 FIFO 계산을,
Story 2는 납품 재시도·영수증·checkpoint 복구를 구현했다. 마지막 납품을 포함한 최종 정산·지급은 Story 3다.

### 15.2 구현 단계의 관련 검증

- BE-01~16과 공통 fixture를 Java/TypeScript에서 비교. 기존2개 팥20점 외에 납품 전0점·특수 내림·checkpoint 기대값 추가.
- 순수 규칙: 49/50/69/70/90/91/99/100,38~42초58, FIFO·잔여·거절 상태불변.
- HTTP: 역할·sid·소유권·버전·엄격본문·키충돌·413·CORS.
- 시간: 0/59999/60000, 서버원점 재시도·지연카운트다운·시계보정·입력미래시각·submitDeadline/drain.
- 경합: 납품/완료 두 순서, 명시 거부/최종 제출, 완료/포기/만료, 같은키/다른키 같은주문.
- MySQL: 신규전용DB migration/JPA validate, Wallet/세션/원장/영수증 rollback·commit 불명·재시작 복구, Shop 동시성.
- 기존 MinigameMySqlTests는 테스트 데이터 DELETE/트리거를 사용하므로 **기존 DB에 실행 금지**. 새 격리 DB에서만 수행한다.
- FE: 전체 화면 재작성 없이 서버시간·ACK merge·복구·종료경합·방문가드 관련 단위/계약 테스트, 실제 BE 연결 인수.
- 관측: 시작/납품승인/거부/복구/정산/상한·실패 지표, 로그에는 판정 코드·단계만. 인증정보·공급자ID·전체log·불원본 무분별 출력 금지.
- 전체 BE·FE 회귀/E2E는 도메인 MR 전 별도 계획이다. Story 1은 관련 MINIGAME 규칙·HTTP·Flyway/JPA
  테스트만 실행하고 결과는 커밋 보고에 기록한다.

## 16. 구현 인계 요약

- 최종 설계 계약은 기존 REST5개 + deliveries1개다. **Story 2에서 deliveries와 GET checkpoint/영수증 조회를 구현했다.**
  새 월드/WebSocket 메시지·FastAPI 역할·랭킹·공개NPC·벌점·재고부패 없음.
- v2와 v4는 저장 버전으로 분리한다. v4 규칙/설정·시간·영수증·checkpoint는 DB 원본이다.
- FE 예상 반영과 기존 UI를 유지하며 서버 원점·안정ID·ACK/복구·최종 경합 연결만 보완한다.
- 납품은 코인을 만들지 않는다. 성공한 최종 정산과 기록·지급만 같은 DB 트랜잭션으로 확정한다.
- 남은 구현은 Story 3의 마지막 미승인 납품 검증, 최종 결과 확정, Wallet 지급과 결과 재조회다. 기술 수치는 본 문서 기본안을 유지한다.
