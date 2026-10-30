# 따라가기 · 시작·이동·종료 동기화

기존 `/ws/tables`를 사용한다. 담당자 장대산 · Jira S15P31B105-192.
사용자가 승인한 프론트 프로토타입 규칙을 서버 이동 판정에 적용한다.
서버 구현·로컬 검증과 FE 실제 연결·배포 검증은 구분한다. DB 변경은 없다.

## 연결 순서

1. 인증 소켓 연결 → `CHANNEL_JOIN` → `WORLD_FOLLOW_CHECK`로 현재 채널 관계를 조회한다.
2. `WORLD_STATE.avatars[].userId`로 상대를 선택하고 `WORLD_FOLLOW_START`를 보낸다.
3. 서버 승인 후 매 물리 틱 자동 이동한다. 좌표는 기존 `WORLD_STATE`로 수신한다.
4. 수동 종료는 자신의 최신 `followId`로 `WORLD_FOLLOW_STOP`을 보낸다.

## 요청

```json
{
  "requestId": "follow-start-1",
  "type": "WORLD_FOLLOW_START",
  "payload": {
    "targetId": "202"
  }
}
```

```json
{
  "requestId": "follow-stop-1",
  "type": "WORLD_FOLLOW_STOP",
  "payload": {
    "followId": "11111111-1111-4111-8111-111111111111"
  }
}
```

```json
{
  "requestId": "follow-check-1",
  "type": "WORLD_FOLLOW_CHECK",
  "payload": {}
}
```

`targetId`는 서버가 전달한 문자열 ID다. 본인·채널·좌표·속도는 요청하지 않는다.
추가 필드는 `INVALID_PAYLOAD`다. `followId`는 응답의 UUID를 사용한다.

## 성공 응답·관계 변경 이벤트

```json
{
  "requestId": "follow-start-1",
  "type": "WORLD_FOLLOW_STATE",
  "payload": {
    "channelId": "channel-1",
    "version": 1,
    "links": [
      {
        "followId": "11111111-1111-4111-8111-111111111111",
        "followerId": "101",
        "targetId": "202"
      }
    ]
  }
}
```

변경 시 같은 채널 전원에게 전체 관계 목록을 전송한다. 요청자만 원래 `requestId`,
다른 사용자와 자동 해제 알림은 `null`이다. 종료 후 `links: []`면 관계가 없다.
`CHECK`와 변경 없는 반복 요청은 본인에게만 응답한다.

`version`은 채널별 관계 변경 때만 증가한다. 같은 채널의 낮은 버전은 무시한다.
동일 버전 ACK도 요청 완료 처리한다. 다른 채널·새 연결에서는 캐시를 비운다.
채널 입장/재접속 후 CHECK는 필수다. 단절 시 관계는 즉시 지우며 자동 복구하지 않는다.
기존 경기의 30초 재접속 정책은 유지한다.

한 사람은 한 명만 따라갈 수 있다. 같은 대상을 반복 요청하면 현재 ID·버전을 유지한다.
다른 대상으로 바꾸면 시작 조건 재검사 후 새 ID를 발급한다. 실패 시 기존 유효 관계는 유지한다.
늦은 STOP이 새 관계를 지우지 않도록 다른 `followId`는 거절한다.
활성 관계가 없을 때 STOP은 현재 상태만 반환한다. 순환 따라가기는 거절하고 여러 명이 같은 대상을
따라가는 것은 허용한다. START는 과거 명령의 영구 영수증이 아니므로 무조건 재전송하지 말고 CHECK로 복구한다.

## 서버 판정 규칙

| 구분 | 기준 |
| --- | --- |
| 시작 | 같은 채널·양쪽 접속, XZ 거리 ≤12m, 높이 차 ≤2m |
| 이용 제한 | 양쪽 수영·테이블/벤치 착석·운동기구·망원경 이용 중 불가, 기존 경기 복구 게이트 유지 |
| 정지 | XZ 거리 ≤2.2m, 관계 유지 후 멀어지면 재개 |
| 걷기 | 2.2m 초과~5m 이하, PARK_V1은6m/s(기본 프로필6.25m/s) |
| 달리기 | 5m 초과, PARK_V1은8m/s(기본 프로필9m/s) |
| 자동 해제 | 거리 >24m, 높이 차 >3.5m, 단절/채널 퇴장, 양쪽 착석·시설 이용·수영 |
| 직접 조작 | 서버가 새 순번으로 수락한 비영 이동 방향 또는 점프는 본인 관계를 해제 |
| 정지 입력 | 방향 0·jump=false인 WORLD_MOVE는 관계 유지, 자동 이동을 덮어쓰지 않음 |
| 장애물 | 기존 서버 충돌 적용, 막혀도 유지·재시도. 우회·자동 점프·막힘 시간 해제 없음 |
| 수동 종료 | 관계 제거·자동 이동 정지. 이미 수락한 직접 조작은 자동 해제로 지우지 않음 |

거리는 캐릭터 충돌 캡슐 중심의 XZ 평면, 높이는 중심 Y 차이다.
서버 30Hz 물리 틱에서 입력을 생성하며 좌표 방송은 기존 주기를 사용한다.
자동 입력은 클라이언트 `lastInputSeq`를 증가시키지 않는다. 브라우저가 최소화되어 이동 보고를 보내지 않아도 살아 있는 소켓의 서버 자동 이동은 계속된다. heartbeat 단절은 기존 연결 종료 규칙을 따른다.
PARK_V1 따라가기 중 motion.profile은 유지하고 motion.authority는 생략한다. FE는 서버 좌표를 표시하고 직접 조작은 WORLD_MOVE로 보낸다. 종료/수동 해제 뒤 다음 틱부터 같은 현재 좌표와 새 epoch의 CLIENT_VALIDATED로 복귀하며, 이동 조작감·수영·전망대 검증 정책은 유지한다.
직접 이동 때 자신의 관계만 해제하고 자신을 따라오는 사용자는 유지한다.

## 오류 응답

공통 `ERROR` 형식의 `payload.code`를 확인한다.

| code | 원인 |
| --- | --- |
| NOT_IN_CHANNEL | 먼저 채널 입장 필요 |
| FOLLOW_TARGET_UNAVAILABLE | 상대가 같은 채널에 없음 |
| FOLLOW_SELF_NOT_ALLOWED | 본인 선택 |
| FOLLOW_ACTIVITY_CONFLICT | 양쪽의 수영·착석·시설 이용 |
| FOLLOW_OUT_OF_RANGE | 신규 시작/대상 변경 시 거리·높이 초과 |
| FOLLOW_CYCLE_NOT_ALLOWED | 직접·간접 순환 관계 |
| FOLLOW_LINK_MISMATCH | 현재 관계와 다른 종료 ID |
| WORLD_POSITION_REQUIRED | 서버 위치 없음 |
| INVALID_PAYLOAD | 잘못된 필드·ID 형식 |
| GAME_RECOVERY_REQUIRED | 기존 경기 복구/진행 게이트 |

## 검증 범위

`WorldFollowTests`는 관계·경계·중복·순환, `WorldFollowFlowTests`는 실제 Raw WebSocket과
인증·채널 격리·활동 전환, `WorldFollowPhysicsTests`는 실제 Bullet 속도·충돌·정지를 검사한다.
`WorldFollowMovementTests`는 Hub→Registry→Bullet 전체 흐름을 검사하며 전송 어댑터·시계·초기 배치는 테스트 대역이다.
실제 FE 3D 화면·운영 배포 확인은 포함하지 않는다. 여러 JVM 사이 관계 공유는 구현하지 않는다.

### 실제 FE 통신 모듈과 서버 연결 검사

Node 24와 `frontend`의 설치된 의존성이 있으면 `backend`에서 다음 검사를 실행한다.
별도 DB나 운영 서버 없이 임시 루프백 서버를 사용한다.

```powershell
$env:TEST_WORLD_SOCIAL_FRONTEND = 'true'
.\gradlew.bat test --tests '*WorldSocialFrontendFlowTests'
Remove-Item Env:TEST_WORLD_SOCIAL_FRONTEND
```

`WorldSocialFrontendFlowTests`는 실제 JWT·접속권 HTTP·Raw WebSocket 응답을
FE `SharedSocket`·`FollowClient`·`worldClient`에 전달한다. 시작 승인/관계 UUID,
방향0 유지/직접 이동 해제, 수동 종료, 대상 착석/단절 해제, 다른 채널 격리,
새 접속권 재연결 후 CHECK와 관계 미복구를 검사한다. 감정표현 취소의 원본 이벤트 ID,
쿨다운 유지, 취소된 승인 중복 미재생, 대기 테이블/벤치의 사용 제한도 함께 검사한다.

회원 조회와 초기 위치·물리 시간은 테스트 대역이며 FE 연결 범위는 Node의 통신/상태 모듈이다.
`ParkRuntime` 전체 연결, 실제 브라우저 쿠키/Origin·3D 모션·프레임별 물리 이동·개발 서버 배포 검증은 아니다.
환경변수 없이 실행한 일반 테스트에서 이 선택적 검사는 실행되지 않는다.
