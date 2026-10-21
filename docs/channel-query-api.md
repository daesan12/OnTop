# 채널 목록 조회

`GET /api/v1/channels` · `local` 구현 · 설정 기반 목록 · Access JWT/활성 계정 인증 · 채널 입장 연동

기준: [Notion WORLD-01](https://app.notion.com/p/WORLD-01-3ff161842b8680318410d278a91ea174)와 REST 공통 규격. 백엔드 A의 광장 조회 기능이다.

## 요청과 응답

Body 없음. `Authorization: Bearer <Access JWT>`로 기존 로그인 토큰을 보낸다. `ChannelAccessFilter`가 기존 `AccessJwtService`로 서명·만료를 검증하고 `WebSocketAccountLookup`으로 활성 계정/내부 ID를 확인해 서버 `Principal`에 연결한다. DB 어댑터 사용은 `local,db`가 필요하다. 이 GET은 websocket.authenticated 옵션과 독립적이며 접속권 발급/소비를 하지 않는다. 기존 서버 인증 Principal도 유지하지만 Authorization을 함께 보냈다면 반드시 그 토큰을 검증한다. `userId` 쿼리·`X-User-Id`·온보딩 토큰·웹소켓 접속권은 인증 수단이 아니다.

브라우저는 `ontop.auth.allowed-origins`에 설정된 출처만 허용한다. OPTIONS는 GET/Authorization 프리플라이트를204로 처리하며 오류에도 허용 출처 CORS 헤더를 유지한다. Origin 없는 Postman 요청도 인증은 필수다.

성공은 HTTP 200이며 `data` 래퍼 없이 다음 필드를 반환한다. 아래 이름·숫자는 형식 예시다.

```json
{
  "items": [
    {
      "channelId": "channel-1",
      "name": "검증 채널",
      "currentUsers": 2,
      "capacity": 3,
      "joinable": true
    }
  ]
}
```

- 목록은 `channelId` 문자열 순으로 정렬한다. 조회는 입장·예약·인원 증가를 하지 않는다.
- `joinable`은 조회 시점의 `currentUsers < capacity`다. 실제 입장 가능 여부는 이후 입장 담당이 다시 검사해야 한다.
- 채널 ID·이름·정원은 서버 설정이다. 기획의 최종 채널 수·정원을 16/20 등으로 고정하지 않는다. 기본 설정은 빈 목록이며 인증 후 `{"items":[]}`다.
- `ChannelPresence.snapshot()`은 광장 연결 담당이 한 시점의 채널별 실제 사용자 수를 불변 Map으로 제공하는 내부 연결점이다. 현재 WorldChannelRegistry가 채널 입장·퇴장·끊김 결과를 제공한다. 공급자 미등록 시의 대체값은 0이다. 테이블 소켓 연결 수를 채널 인원으로 세지 않는다.
- 공급자가 등록된 후 조회 실패·null·음수 인원을 반환하면 0명 성공으로 숨기지 않고 503을 반환한다. 응답 하나에 스냅샷을 한 번만 읽는다.
- 성공·오류 모두 `Cache-Control: no-store`. 응답에 계정 ID·Principal 이름·실시간 연결 ID를 넣지 않는다.

## 오류

| HTTP | code | 조건 |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | 인증 없음, 잘못된/중복 Bearer, JWT 만료·위조, 비활성 계정. |
| 403 | `FORBIDDEN` | 허용되지 않은 Origin 또는 GET/Authorization 외 프리플라이트. |
| 503 | `SERVICE_UNAVAILABLE` | JWT 설정·활성 계정 조회 또는 인원 공급자 장애. 내부 예외는 응답하지 않음. |

```json
{"code":"UNAUTHENTICATED","message":"로그인이 필요합니다.","details":null}
```

`local` 외 프로필에서는 경로가 등록되지 않는다. 가짜 로그인·개발용 무인증 우회 경로는 제공하지 않는다.

## 설정과 연결

`application-local.yml` 등에 다음 구조로 채널을 추가할 수 있다. 예시는 검증용이며 기본 파일에는 넣지 않았다. `capacity`는 실제 사용할 환경에서 정한다.

```yaml
ontop:
  world:
    channels:
      - channel-id: channel-1
        name: 검증 채널
        capacity: 3
```

중복 ID·빈 ID/이름·0 이하 정원은 설정 오류로 앱 시작을 실패시킨다. 설정을 바꾼 뒤 서버를 다시 실행한다.

읽는 순서는 `ChannelAccessFilter`(JWT/계정·출처) → `ChannelQueryController.listChannels`(서버 인증 경계) → `ChannelQueryService.listChannels`(설정과 인원 스냅샷)다. 프론트는 로그인 → 이 GET으로 채널 확인 → [접속권 발급](websocket-authentication.md) → WS 연결 → CHANNEL_JOIN → 테이블 조회/착석 순서로 사용한다. GET 재조회로 입장/퇴장에 따른 currentUsers/joinable 변화를 확인한다. 같은 채널 위치 공유는 WORLD_MOVE / WORLD_STATE를 사용한다.

## 검증

`backend/`에서 실행한다.

```powershell
.\gradlew.bat test --tests '*ChannelQuery*' --tests '*TableProfileTests'
.\gradlew.bat test --tests '*LoginChannelFlowTests'
```

LoginChannelFlowTests는 실제 JWT 서명·검증기와 랜덤 포트 HTTP/RawWS에서 조회 → 접속권 → 입장 → 만석 → 퇴장 → 재조회를 검사한다. 만료/탈퇴401·계정 조회 장애503·위조/중복헤더·CORS를 포함한다. 계정 조회만 대역이며 외부 OAuth·실제 MySQL·프론트·운영 검증과 구분한다. 기존 ChannelQueryTests는 서버 Principal/인원 공급자 대역으로 응답 필드와 공급자 장애를 검사한다.
