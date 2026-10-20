# 채널 목록 조회

`GET /api/v1/channels` · `local` 구현 · DB 없음 · 실제 로그인·광장 입장 미연결

기준: [Notion WORLD-01](https://app.notion.com/p/WORLD-01-3ff161842b8680318410d278a91ea174)와 REST 공통 규격. 백엔드 A의 광장 조회 기능이다.

## 요청과 응답

Body 없음. 인증 담당이 검증해서 서버 요청에 설정한 `Principal`이 필요하다. JWT·세션 전달 방식이나 소셜 로그인을 새로 구현하지 않는다. `userId` 쿼리·`X-User-Id`·검증되지 않은 Authorization 값으로 인증을 대신할 수 없다.

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
- `ChannelPresence.snapshot()`은 광장 연결 담당이 한 시점의 채널별 실제 사용자 수를 불변 Map으로 제공하는 내부 연결점이다. 아직 광장 입장이 없으므로 공급자 미등록 시 인원은 0이다. 테이블 소켓 연결 수를 채널 인원으로 세지 않는다.
- 공급자가 등록된 후 조회 실패·null·음수 인원을 반환하면 0명 성공으로 숨기지 않고 503을 반환한다. 응답 하나에 스냅샷을 한 번만 읽는다.
- 성공·오류 모두 `Cache-Control: no-store`. 응답에 계정 ID·Principal 이름·실시간 연결 ID를 넣지 않는다.

## 오류

| HTTP | code | 조건 |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | 서버 인증 Principal 없음. 실제 로그인 연결 전에는 브라우저 직접 조회도 이 결과다. |
| 503 | `SERVICE_UNAVAILABLE` | 등록된 광장 인원 공급자가 실패하거나 잘못된 인원 상태를 반환. 내부 예외는 응답하지 않음. |

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

읽는 순서는 `WorldChannelProperties`(설정) → `ChannelQueryController.listChannels`(HTTP·인증 경계) → `ChannelQueryService.listChannels`(현재 인원과 조회 응답)다. 광장 입장·퇴장·이동 WebSocket은 별도 메시지 계약과 함께 연결한다.

## 검증

`backend/`에서 실행한다.

```powershell
.\gradlew.bat test --tests '*ChannelQuery*' --tests '*TableProfileTests'
```

실제 랜덤 포트에서 미인증 401을 확인한다. 성공 응답은 MockMvc가 서버 Principal과 인원 공급자 대역을 주입해 확인한다. 실제 로그인 성공·실제 광장 접속 인원·부하 검증을 뜻하지 않는다.
