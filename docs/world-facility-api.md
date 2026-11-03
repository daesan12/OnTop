# 시설 이용·점유 WebSocket

기존 `/ws/tables`의 인증·채널을 재사용한다. 벤치 80개(각 2석), 운동기구 12대(각 1명), 망원경 2대(각 1명).
사용자 ID와 위치는 연결·서버 물리에서 찾는다. DB 테이블·Flyway 추가 없음. 인증 코드는 변경하지 않는다.

## 운동 수입 조회 (2026-11-03)

`GET /api/v1/world/fitness/rewards/status`는 Access JWT로 인증된 본인의 상태만 반환한다.
사용자 ID를 입력받지 않으며 `Cache-Control: no-store`이다. 조회는 지갑 생성·지급·원장 기록을 하지 않는다.

| 필드 | 의미 |
| --- | --- |
| enabled | 현재 서버의 운동 보상 활성 여부. DB 없는 실행에서는 false |
| earningsDate | Asia/Seoul 기준 수입 날짜 (YYYY-MM-DD) |
| todayEarned / dailyCap | 확정된 운동 원장 수입 / 300냥. 점프맵·붕어빵 공통 500냥과 별도 |
| rewardIntervalSeconds | 실제 60초마다 1냥. 공원 가상 시계의 진행 속도와 무관 |
| serverNow | 조회 기준 서버 epoch milliseconds |
| nextRewardAt | 다음 지급 예정 경계의 epoch milliseconds. 미이용·한도 도달이면 null |
| activeLeaseId | 본인의 현재 운동기구 이용 식별자. 미이용이면 null |

`nextRewardAt`은 지급 확정값이 아니며 DB 지급 지연 중에는 과거일 수 있다.
현재 FE 패널은 실제 지급 기준과 재조회한 `todayEarned / dailyCap`을 한 줄로 표시한다.
기존 개인 `FITNESS_REWARD` 이벤트의 receipt로 지갑과 수입을 다시 조회하며, 중복 영수증은 다시 반영하지 않는다.
미이용·재접속·다른 이용 ID의 상태는 이전 기구의 수입 표시로 사용하지 않는다.
한국 시간 자정에 일일 수입을 다시 조회하고, 하차·단절 시 미완료 1분 미만 시간은 초기화한다.
DB 조회 실패는 503 `FITNESS_UNAVAILABLE`이며, FE는 금액을 `—`로 표시하고 재조회한다.
운동 영수증에 따른 잔액 증가음은 기본 획득음의 70%로 재생한다. 하차 뒤 늦게 반영된 지급에도 적용하며,
다른 미니게임·보드게임 영수증의 획득음과 사용자의 효과음·음소거 설정은 유지한다.

## 연동 순서

`CHANNEL_JOIN` → `WORLD_FACILITY_CATALOG`(최초/맵 변경) → `WORLD_FACILITY_CHECK`(입장·재접속 필수)
→ `WORLD_FACILITY_USE` → 망원경만 `WORLD_FACILITY_AIM` → `WORLD_FACILITY_RELEASE`.
기존 입장 메시지 순서를 유지하므로 시설 초기 상태는 자동 전송하지 않는다.

시설 변경은 같은 채널 전원에게 `WORLD_FACILITY_STATE`로 전송한다. 요청자의 응답은 원래 requestId,
다른 사용자 방송은 null이다. version이 작은 상태는 버리고, 다른 연결/채널의 응답을 적용하지 않는다.
연결이 끊기거나 채널에서 나가면 시설은 즉시 해제된다. 다시 들어오면 빈 상태에서 조회·재이용한다.
경기의 30초 재접속 유예와 별개다. 단일 JVM 메모리 점유이며 다중 인스턴스 공유는 구현하지 않았다.

## 요청

모든 요청은 `{"requestId":"고유 요청 ID","type":"명령","payload":{...}}` 형태다.

| 명령 | payload | 응답 |
| --- | --- | --- |
| WORLD_FACILITY_CATALOG | {} 또는 {"offset":10} | 동일 type, 목록 10개씩·total·nextOffset(-1이면 끝)·mapVersion·aimIntervalMs·minPitch·maxPitch·initialPitch |
| WORLD_FACILITY_CHECK | {} | WORLD_FACILITY_STATE 현재 전체 점유 |
| WORLD_FACILITY_USE | {"facilityId":"bench-0","seatIndex":0} | WORLD_FACILITY_STATE |
| WORLD_FACILITY_RELEASE | {"leaseId":"서버가 준 이용 ID"} | WORLD_FACILITY_STATE |
| WORLD_FACILITY_AIM | {"leaseId":"서버가 준 이용 ID","seq":1,"yaw":0.5,"pitch":-0.2} | WORLD_FACILITY_STATE |

벤치는 seatIndex 0/1, 운동기구·망원경은 0만 사용한다. 시설 ID/이용·하차 자세는 CATALOG 응답을 사용한다.
운동기구 ID 예: walker-1, walker-2, twister. 망원경: telescope-1/2. 시설 ID는 현재 FE 배치 ID와 동일하다.
목록은 공통 mapVersion과 대조한다. 클라이언트 좌표·userId·임의 시각을 payload에 추가하면 INVALID_PAYLOAD다.

## 성공 응답

```json
{
  "requestId": "facility-use-1",
  "type": "WORLD_FACILITY_STATE",
  "payload": {
    "channelId": "channel-1",
    "version": 1,
    "mapVersion": "544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0",
    "occupancies": [
      {
        "leaseId": "서버 발급 UUID",
        "channelId": "channel-1",
        "userId": "101",
        "facilityId": "bench-0",
        "kind": "BENCH",
        "seatIndex": 0,
        "startedAt": "2026-10-25T00:00:00Z",
        "pose": { "x": -9.65, "y": 0.8, "z": 34.82, "yaw": 0 },
        "exit": { "x": -9, "y": 0.8, "z": 36.25, "yaw": 0 },
        "yaw": 0,
        "pitch": 0,
        "lastAimSeq": 0
      }
    ]
  }
}
```

- occupancies는 현재 채널의 전체 목록이다. 반납·단절된 항목은 목록에서 사라진다. 빈 배열은 점유 없음이다.
- leaseId는 이용할 때마다 새로 발급한다. 본인의 현재 leaseId로만 반납·방향 변경 가능하다.
- startedAt은 UTC ISO-8601 서버 시각이다. 운동 모션은 FE 2.4초 주기와 이 시각을 사용하며 본/관절을 전송하지 않는다.
- pose는 캡슐 중심 좌표(m), Y축 위쪽, yaw/pitch는 라디안이다. 확대·FOV는 FE 로컬 처리다.
- 성공 후 WORLD_STATE로 실제 승인 위치도 전송한다. 이용 중 이동·점프·테이블 착석은 FACILITY_BUSY다.
  하차 요청을 먼저 보낸 뒤 성공한 WORLD_STATE 위치에서 이동을 재개한다. 반납이 실패하면 점유를 유지한다.
- 하차 위치의 캡슐 관통·발밑 지지를 검사하고, 막혀 있으면 이용 직전 위치를 검사한다.
  둘 다 막히면 FACILITY_EXIT_BLOCKED다. 임의 좌표나 스폰으로 순간 이동시키지 않는다.
- 같은 성공 USE requestId의 재전송은 현재 이용 중이면 같은 상태만 본인에게 응답한다.
  반납 후 같은 requestId 재사용은 FACILITY_STALE_REQUEST다(연결별 최근 성공 128개 보관).
  반납 재시도에서 이용이 이미 끝났으면 LEASE_MISMATCH이므로 CHECK로 확인한다.
- AIM seq는 1~4294967295, 이용별 증가한다. 과거·동일 seq는 현재 상태만 본인에게 응답하고 방송하지 않는다.
  새 seq는 100ms 간격, yaw [-π,π], pitch [-1.35,1.15]. 실패는 버전·시각을 변경하지 않는다.

## 확정된 시설 정책·남은 협의

2026-10-25 사용자가 벤치/운동기구 3m, 망원경 2m, 기준 높이 +0.8m/오차 ±0.7m와
단절 즉시 해제·재입장 후 재이용을 확정했다. 근거리 채팅·관전20m 및 경기30초 유예와 구분한다.
망원경 방향 제한은 현재 FE config를 따른 구현값이다. 시설 중 감정표현 허용/취소, 다중 서버 점유 공유는
[협의 목록](team-decisions.md)에 남겼다. 감정표현 허용/취소는 아직 선택지가 정해지지 않아 임의로 확정하지 않는다.
프론트 목업 포트 교체·실제 3D 모션과 운영 배포 검수는 별도다.

`backend/tools/bake-facilities.mjs`는 FE config를 격리 VM에서 읽고 현재 park.json 충돌체와 일치하는 시설만 생성한다.
제외 ID는 facilities.json의 excluded에 남는다. 현재 94개 전부 일치·제외 없음.
맵/앵커가 바뀌면 생성 후 제외 목록을 확인해야 한다. 기존 bake-world·CI 자동 생성 정책은 변경하지 않았다.

## 현재 FE 연동 점검 · 2026-10-25

`WorldFrontendMySqlTests`에서 실제 회원 DB·접속권 인증·FE `SharedSocket`으로 94개 목록,
벤치 두 좌석/충돌/반납, 단절 즉시 해제·재접속 CHECK·오래된 lease 거절,
운동기구 점유, 망원경 방향·타인 변경 거절을 확인했다. 프로필/시설 통신 시나리오 4개와
Java 통합 흐름 1개가 통과했으며, 기존 BE 회귀 16개·FE 회귀 44개도 통과했다.

**공통 소켓 검증과 실제 시설 화면 연결은 다르다.** 최초 점검 `e7dca36`의 FE 빌드 모드에서 bench/fitness/telescope
서비스는 `unavailable`이며, `worldClient.receive`는 `WORLD_FACILITY_STATE`를 상태에 적용하지 않는다.
`ParkRuntime`도 입장 시 CHECK를 보내지 않는 것을 실제 송신 기록으로 확인했다. 로컬 개발 벤치 목업
성공을 서버 점유 성공으로 취급하지 않는다. 팀원 FE 코드·기존 API·인증 코드는 변경하지 않았다.

후속 dev `7e42f48`에는 팀원의 FacilityClient·시설 서버 포트가 반영됐다. 기존 연동 검증을 보강해
실제 ParkRuntime의 목록 준비·입장 CHECK·벤치 이용 → session/avatars 표시 상태 → 반납을 확인했다.
세 서비스의 mode는 server이며, 운동기구/망원경은 기존 SharedSocket 실제 통신 검증을 재통과했다.
3D 클릭·모션 검수와 브라우저 쿠키/CORS·원격 배포는 여전히 별도다. 당시 상대 공개 프로필 표시는 미반영이었다.
이전 미연결 진단은 위 최초 버전의 관찰이며 현재 시설 서비스 상태로 해석하지 않는다.

후속 dev `271f6f1`에는 팀원의 공개 프로필 표시 연결도 반영됐다. BE 소유의 기존
`WorldFrontendMySqlTests`와 `backend/src/test/js/world-frontend/flow.test.ts`를 보강해
상대 nickname/characterGender가 실제 FE avatars/profiles에 반영되지 않으면 실패하도록 바꿨다.
두 테스트 회원의 실제 PATCH `/api/v1/users/me` → 서버 정기 조회 → 정지 상태 표시 갱신,
퇴장 시 캐시 제거·다른 채널 미전송·재입장·새 접속권으로 수동 재연결 후 최신 표시 복구를 연속 검증한다.
다른 채널 미전송은 FE의 채널 필터만 믿지 않고 Runtime 소켓의 원시 수신과 동일 연결의 채팅 ACK로 확인한다.
잔액 UI는 마운트하지 않으므로 미조회 `null` 유지만 검사하며 세 테스트 회원의 실제 지갑/예약금·원장 불변을 별도로 확인한다.
서버 프로필·감정표현 회귀13개, FE 기존 단위15개, Java/MySQL 통합1개 안의 FE 시나리오5개가 통과했다.
시설 BE189의 실제 3D 공동 검수·감정표현 활동 정책은 여전히 별도이며, 이 결과는 자동 재시도·경기30초 복구 검증이 아니다.
팀원 FE·회원/인증 코드·DB SQL·실행 설정·기존 API 형식은 변경하지 않았다.

재현은 backend 폴더에서 아래와 같이 실행한다. Node24·기존 프론트 의존성과 **새 전용 MySQL DB**가
필요하다. DB가 비어 있지 않으면 거절하며 기존 데이터를 초기화하지 않는다. 신규 Flyway SQL은 없다.

```powershell
$env:TEST_WORLD_FRONTEND = 'true'
$env:TEST_WORLD_FRONTEND_DB_URL = 'jdbc:mysql://127.0.0.1:<port>/ontop_world_test_frontend_<unique>?serverTimezone=UTC'
$env:TEST_WORLD_DB_USERNAME = '<test-db-user>'
$env:TEST_WORLD_DB_PASSWORD = '<test-db-password>'
.\gradlew.bat mysqlTest --tests 'com.ssafy.ontop.table.WorldFrontendMySqlTests'
```

위 테스트는 Node에서 브라우저 API만 어댑터로 연결한다. 실제 FE `ParkRuntime` 로그인 복원·내 정보·접속권·
입장과 공통 소켓은 사용하지만 3D 렌더링·브라우저 쿠키/CORS·원격 배포는 검증하지 않는다.
Node WebSocket은 Origin을 넣지 않으므로 접속권 발급도 Origin 없이 동일하게 맞춘다.
서버 인증/Origin 정책을 완화하지 않는다. 위치는 테스트 전용 서버 fixture로 준비하고 물리 시간은 고정한다.
걷기·충돌 경로 재현이나 화면 클릭 성공으로 확대하지 않는다. 과거 진단의 `frontend*Matched/Applied=false`는
해당 기준 버전의 미연결 관찰값이다. 현재 프로필·벤치 상태는 assertion으로 검사하지만 실제 3D UI 완료를 뜻하지 않는다.

## 오류 응답

공통 `ERROR {code,message}` 형식을 유지한다. 승인 실패를 FE 목업 성공으로 대체하지 않는다.

| code | 의미/다음 행동 |
| --- | --- |
| NOT_IN_CHANNEL | 채널 입장 필요 |
| FACILITY_NOT_FOUND / FACILITY_SEAT_INVALID | CATALOG 확인 |
| FACILITY_OUT_OF_RANGE / FACILITY_HEIGHT_MISMATCH | 서버 승인 위치에서 재접근 |
| FACILITY_BUSY / TABLE_BUSY / FACILITY_ACTIVITY_CONFLICT | 현재 시설·테이블·수영 상태 종료 |
| FACILITY_OCCUPIED | CHECK로 현재 점유 확인, 다른 좌석 선택 |
| FACILITY_LEASE_MISMATCH / FACILITY_STALE_REQUEST | CHECK 후 현재 leaseId 사용/새 요청 ID |
| FACILITY_EXIT_BLOCKED | 점유 유지, 잠시 후 반납 재시도 |
| FACILITY_AIM_NOT_ALLOWED / FACILITY_AIM_INVALID | 망원경 이용·범위 확인 |
| FACILITY_AIM_TOO_FREQUENT | 최소 100ms 뒤 새 seq로 전송 |
| INVALID_PAYLOAD | 필드·타입·범위 수정 |

## 로컬 검증

`WorldFacilityFlowTests`: 인증된 두 사용자 Raw WebSocket의 경쟁·독립 좌석·높이·채널·권한·반납·단절/복귀.
인증은 기존 테스트 대역, 위치는 서버 전용 fixture다. `WorldFacilityTests`: 전체 174좌석 예약/중복·요청 수명과
실제 Bullet 물리 tick·캡슐 하차 검사. 실제 FE 화면·운영 서버·다중 인스턴스 검증으로 해석하지 않는다.
