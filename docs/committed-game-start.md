# 인증 사용자 경기 시작 연결

전원 준비 → 참가/차감 확정 요청 → 실제 엔진 생성 → 시작·복구 상태 전달을 연결한다. 기준은 OnTop v0.4의 참가자별 기본 판돈1엽전과 현재 GameStartGateway 계약이다. **A 연결부 구현이며 실제 DB 차감·원장·정산 구현/검증과 구분한다.**

## 켜는 조건

- `local` + `ontop.websocket.authenticated=true` + `ontop.game-start.enabled=true`.
- B가 구현한 `GameStartGateway` Bean이 필수다. 현재 저장소에는 실제 DB Gateway가 없으므로 이 옵션을 켜면 의존성 누락으로 시작에 실패한다. 기본값은 false다.
- `ontop.start-rehearsal.enabled=true`와 동시 사용하거나 LocalGameStartGateway를 실제 시작에 사용할 수 없다.
- 사용할 게임 엔진을 별도로 활성화한다. 오목은 `ontop.games.omok.enabled=true`. 원카드/거짓말 다리는 해당 엔진과 필수 설정이 필요하다. 원카드 기권 손패 정책에 임의 기본값을 넣지 않는다.
- 주사위는 목표 점수를 현재 테이블 선택에서 전달하는 계약이 없어 이 연결에서는 차감 요청 전에 거절한다. 임의 목표로 시작하지 않는다.

실제 서버 설정이나 배포 옵션은 이번 작업에서 변경하지 않는다. 테스트 전용 LedgerDouble은 실제 지갑·잔액·DB 트랜잭션이 아니다.

## 한 흐름

1. 로그인 JWT로 접속권을 발급하고 `/ws/tables?ticket=...`에 연결한다.
2. 채널이 설정돼 있다면 CHANNEL_JOIN 후 서버가 조회로 준 tableId에 TABLE_JOIN 한다.
3. 첫 착석자가 GAME_SELECT, 2명 이상 현재 참가자 모두 READY_SET(true). 카운트다운 없음.
4. 서버가 참가자/좌석/게임과 시작 시도 UUID를 한 번 고정하고 STARTING을 전송한다. 이때 퇴장·준비/게임 변경은 TABLE_BUSY다.
5. Hub 잠금 밖에서 CommittedGameStartService가 엔진/계정 ID를 확인한 뒤 B의 startGame을 한 번 호출한다. 클라이언트는 참가자·차감액·경기 ID를 지정하지 않는다.
6. B는 전원 참가 기록·1인1엽전 차감·원장을 커밋한 경우에만 SUCCEEDED를 반환한다. A는 동일 시도·참가자/좌석·단가1·총액인원수·경기 ID를 검사한다.
7. 검사된 성공 뒤 해당 경기 ID로 엔진을 생성한다. 첫 좌석부터 엔진 참가자 순서로 전달하며 오목은 흑/백이다. 실제 경기 엔진의 create는 같은 경기/참가자에 멱등적이다.
8. GAME_START_STATE(PLAYING, simulation=false)를 같은 테이블 참가자에게 전송하고 기존 GAME_CONNECTION_STATE로 본인 최신 상태·조작권을 연결한다. 공개/개인 상태와 입력 메시지는 기존 계약을 사용한다.

## 실패와 재조회

확정 REJECTED는 준비를 초기화해 WAITING으로 돌린다. 계정별 잔액이나 저장소 예외를 브라우저에 전파하지 않고 START_REJECTED만 알린다.

PENDING/CONFLICT/예외/잘못된 성공 결과는 STARTING을 유지한다. GAME_START_CHECK의 payload는 `{}`이며 같은 startAttemptId로 `findStartResult`만 호출한다. 새 시도나 재차감을 요청하지 않는다. 엔진 생성이 실패해도 같은 확정 결과와 경기 ID로 다시 생성하며 차감을 다시 요청하지 않는다. A 메모리는 재시작 복구용 영속 저장소가 아니다.

## 기존 메시지의 실제 시작 모드

GAME_START_CHECK/GAME_START_STATE의 필드와 방향은 유지한다. 개발용 rehearsal은 계속 simulation=true/CONFIRMED를 사용하고 실제 시작 모드는 simulation=false/PLAYING을 사용한다. 기본 대기 모드는 추가 시작 메시지를 활성화하지 않는다.

```json
{
  "requestId": null,
  "type": "GAME_START_STATE",
  "payload": {
    "tableId": "table-example",
    "revision": 3,
    "phase": "PLAYING",
    "startAttemptId": "2b119ea2-fd96-4efe-9d46-56d848a1ebc3",
    "gameCode": "OMOK",
    "gameSessionId": "server-confirmed-game-id",
    "code": null,
    "simulation": false
  }
}
```

이 예제는 응답 형식이며 실제 DB에 저장된 경기/차감 증거가 아니다. GET 테이블 목록은 해당 테이블을 PLAYING/joinable=false로 표시한다. 경기 종료 후 정산·좌석 유지/로비 복귀는 별도 연결 범위여서 이번 시작 연결에서 좌석을 임의 해제하지 않는다.

## 끊김과 검증 범위

시작 요청이 이미 전달됐다면 단절돼도 좌석과 같은 시도를 보존한다. 기존 연결이 살아 있으면 추가 연결은 거절하고, 끊긴 계정은 새 접속권으로 같은 시작 상태/경기에 돌아올 수 있다. 확정 대기 중 빈 경기 조회나 이전 종료 경기 조회로 원래 단절 시각·30초 유예를 지우지 않는다. 유예 안에 돌아온 시점도 보존한다. 경기 생성 후 30초 경과가 확인되면 기존 기권/탈락 경계로 연결하며 턴 시간은 계속 흐른다.

CommittedStartFlowTests는 실제 JWT/HTTP/RawWS/오목 엔진으로 확정 전 미시작·확정 후 착수·거절·응답 유실 재조회·금액 불일치·단절/29·30초 복귀를 검증한다. 계정 조회와 B 차감 경계는 대역이다. CommittedStartContractTests는 엔진 생성 실패 재시도·설정 혼용·미설정 엔진/비계정 ID를 검사한다. 실제 OAuth/DB/정산/프론트/운영 검증과 구분한다.
