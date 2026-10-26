# 맵 버전 전달·입장 전 확인

담당: 장대산. 서버 연결부·로컬 검증 범위이며 FE 서비스 맵 전환·개발 서버 배포는 별도다.
현재 `/world/park.json`과 Java 이동·충돌은 유지한다. FE `bb1ff1b`의 미리보기 JSON은 아직 로딩하지 않는다.

## 연결 완료 · CONNECTED

기존 `/ws/tables` 인증·접속권·userId를 유지하고 다음 필드를 추가한다.

```json
{
  "requestId": null,
  "type": "CONNECTED",
  "payload": {
    "userId": "101",
    "map": {
      "mapId": "park",
      "schemaVersion": 1,
      "mapVersion": "544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0"
    },
    "mapVerificationRequired": false
  }
}
```

`map`은 서버 물리 엔진이 로딩한 ParkScene에서 가져온다. 현재 구형 맵의 mapId는 리소스에 대응하는
`park`, schemaVersion은 JSON의 schemaVersion, mapVersion은 기존 sourceSha256이다.
WORLD_STATE·시설 카탈로그의 mapVersion과 동일하다. FE 신규 생성 버전으로 기존 서버 버전을 덮어쓰지 않는다.
새 JSON 로더·manifest 체크섬 검증은 데이터 규격 합의 후 별도로 연결한다.

## 확인 요청 · WORLD_MAP_CONFIRM

FE는 서버 값을 그대로 복사하지 않고 **자신이 사용하는 맵에 포함된 식별 정보**를 보낸다.
로그인 인증을 대체하는 요청이 아니며, 좌표 조작 방지도 계속 서버 이동 판정에서 담당한다.

```json
{
  "requestId": "map-confirm-1",
  "type": "WORLD_MAP_CONFIRM",
  "payload": {
    "mapId": "park",
    "schemaVersion": 1,
    "mapVersion": "544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0"
  }
}
```

세 필드 모두 필수다. mapId는 영문·숫자·하이픈·밑줄 1~80자, schemaVersion은 양의 int,
mapVersion은 소문자 16진수 64자리다. 누락·타입 오류·추가 필드는 INVALID_PAYLOAD다.

## 성공 응답 · WORLD_MAP_STATE

```json
{
  "requestId": "map-confirm-1",
  "type": "WORLD_MAP_STATE",
  "payload": {
    "map": {
      "mapId": "park",
      "schemaVersion": 1,
      "mapVersion": "544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0"
    },
    "verified": true
  }
}
```

동일 요청을 반복해도 확인 응답만 보내며 복구 서비스 연결·게임 시작을 반복하지 않는다.
검사 활성화 시 초기 순서는 CONNECTED → WORLD_MAP_CONFIRM → WORLD_MAP_STATE → 기존 경기 복구
알림/확인 → CHANNEL_JOIN이다. CHANNEL_JOIN의 기존 payload `{channelId}`는 바꾸지 않는다.
입장 요청만으로는 접속 직후 경기 자동 복구를 제어할 수 없어 별도 확인 메시지를 사용한다.

## 오류

```json
{
  "requestId": "map-confirm-1",
  "type": "ERROR",
  "payload": {
    "code": "MAP_VERSION_MISMATCH",
    "message": "맵을 새로고침한 뒤 다시 연결해주세요.",
    "serverMap": {
      "mapId": "park",
      "schemaVersion": 1,
      "mapVersion": "544bc6fa3890c77e8de0ec91d27f93981b4d23a477918963757e4762294ba8d0"
    }
  }
}
```

| code | 조건·처리 |
| --- | --- |
| MAP_VERSION_MISMATCH | 세 필드 중 하나라도 서버와 다름. 확인 승인·입장·복구를 수행하지 않음 |
| MAP_VERSION_REQUIRED | 검사 활성화 시 미확인 연결의 다른 유효한 애플리케이션 요청. serverMap도 제공 |
| INVALID_PAYLOAD | 확인 요청의 필드·타입·길이 오류. 기존 공통 ERROR 형식 |

오류 후 소켓은 유지한다. FE는 입장·이동·활동을 보류하고 업데이트 안내와 사용자의 새로고침·재접속을
제공한다. 메타데이터가 없거나 확인 응답을 받지 못해도 입장하지 않는다. 무한 자동 재접속은 하지 않는다.
기존 인증·heartbeat는 계속 적용된다. 맵 확인을 기다려도 경기 턴 시간·30초 재접속 기한은 연장되지 않는다.
재접속마다 새 연결에서 다시 확인하며 이전 연결의 승인을 재사용하지 않는다.

## 활성화와 후속 연결

`ontop.world.map.require-match` / `WORLD_MAP_REQUIRE_MATCH` 기본값은 false다.
현재 FE가 확인 요청을 보내지 않으므로 기본값에서 기존 접속·자동 복구 흐름을 유지한다.
false여도 메타데이터와 확인 메시지를 제공하고 명시적인 불일치 확인 요청은 거절한다.
true에서는 확인 전 채널·이동·시설·테이블·게임 요청과 경기 복구/결과 구독 연결을 보류한다.
새로 접속한 미확인 세션에는 기존 보존 좌석의 테이블·시작 상태도 방송하지 않는다.

FE가 확인 요청을 연결하고 양쪽 실제 맵이 일치하는 것을 검증한 뒤 설정을 켠다.
새 맵·시설 좌표·버전을 함께 생성/배포하는 작업과 구분하며 현재 자료만으로 서비스 맵을 전환하지 않는다.
DB 스키마·인증·판돈 예약/정산은 변경하지 않는다.
