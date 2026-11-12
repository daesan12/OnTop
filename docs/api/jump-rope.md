# 구구구 줄넘기 API

세 경로 모두 `Authorization: Bearer <accessToken>`을 사용합니다. 서버는 인증된 사용자 ID로 라운드 소유권과 개인 기록을 확인합니다. 응답은 `Cache-Control: no-store`를 포함합니다. 응답의 `id`와 경로의 `roundId`는 숫자로 변환하지 않고 문자열로 보관합니다.

## `POST /api/v1/minigames/jump-rope/rounds`

요청 본문은 비워 두고 `Idempotency-Key` 헤더를 한 개 보냅니다. 키는 영문, 숫자, `_`, `-`로 이루어진 1~64자입니다. 네트워크 오류에는 같은 키를 재사용하고, 새 판을 시작할 때 새 키를 발급합니다. 같은 키로 활성 판을 다시 요청하면 새 `serverNow`와 기존 `startedAt`, `expiresAt`, `seed`, `id`를 받습니다. 새 판이 발급되면 이전 미확정 판의 제출은 `409 JUMP_ROPE_ROUND_SUPERSEDED`가 됩니다.

참가비는 0냥입니다.

`201 Created` 응답 예시입니다.

```json
{"id":"40901","seed":123456789,"rulesVersion":1,"serverNow":"2026-11-12T00:00:00Z","startedAt":"2026-11-12T00:00:03Z","expiresAt":"2026-11-12T00:01:38Z","durationMs":60000}
```

`startedAt`은 서버 발급 시각의 3초 후이고 `expiresAt`은 `startedAt`의 95초 후입니다. FE는 `startedAt`을 단조 증가하는 로컬 시계에 매핑해 카운트다운과 플레이 시작을 맞춥니다. 응답을 다시 받았을 때 3초를 새로 더하면 안 됩니다. 시드는 방해 연출 재현에 사용합니다.

## `POST /api/v1/minigames/jump-rope/rounds/{roundId}/complete`

`Content-Type: application/json`으로 수락된 점프만 시간순으로 보냅니다. 요청 예시입니다.

```json
{"jumpOffsetsUs":[728335,1723348]}
```

- 실제 플레이 시작을 0으로 두고, 카운트다운과 MISS로 정지한 구간을 제외합니다. 수락한 입력의 시각을 `Math.round(activeElapsedMs * 1000)`으로 변환합니다. 범위는 `0`~`59_999_999`, 최대 128개이며 엄격한 오름차순입니다. 빈 배열은 유효합니다.
- 랭킹 플레이의 판정에는 같은 정규화 입력을 사용합니다. `n`번째 줄 통과 시각은 실제 플레이 시간 기준 `Math.round(-300000 * Math.expm1(-n / 300) * 1000)`입니다. 60초 이후의 통과는 판정하지 않습니다. 같은 시각에서는 시간 만료, 줄 통과, 새 점프 순으로 처리합니다. MISS와 같은 마이크로초의 입력은 수락하지 않습니다.
- 판정은 준비 70ms, 체공 400ms, 정점 0.6m 기준입니다. 발 높이 0.082m 이상에서 입력 선행 시간이 220~320ms이면 PERFECT이고 그 외 성공은 GOOD입니다. MISS로 점프 상태를 초기화하기 전에는 직전 수락 입력부터 515ms가 지나야 재점프할 수 있습니다. 1·2번째 MISS 이후 자세 복귀와 1,350ms 연출 동안 실제 플레이 시계를 멈추고, 재개 시 점프 상태를 비운 채 기존 가속을 이어갑니다. 랭킹 모드는 개발용 수동 일시정지와 규칙 설정 변경을 차단해야 합니다.
- FE는 판이 끝난 뒤 로그를 제출합니다. 서버는 로그로 종료 사유와 점수를 재계산하고, `startedAt` 이후 해당 결과에 필요한 최소 실제 시간이 지난 경우에 정산합니다. 만료 전 같은 라운드에 같은 로그를 보내면 동일한 결과가 반환됩니다. 네트워크 장애나 `503`이면 같은 라운드 ID와 로그로 재시도합니다. `JUMP_ROPE_NOT_FINISHED`이면 잠시 뒤 동일 로그를 재시도할 수 있습니다. 다른 로그의 재제출은 `409 JUMP_ROPE_INPUT_CONFLICT`, 만료 이후 제출은 `409 JUMP_ROPE_ROUND_EXPIRED`입니다. 타인 소유이거나 존재하지 않는 판은 `404 JUMP_ROPE_ROUND_NOT_FOUND`입니다.

`200 OK`의 `reward`는 서버가 실제로 지급한 엽전의 정수 수량입니다. `endReason: "time"`인 60초 완주에만 서버 확정 점수 50점당 1냥을 지급하며 나머지는 버립니다. MISS가 1~2회여도 완주하면 지급 대상입니다. 미니게임 공통 일일 한도(한국 시간 자정 기준 1,000냥)의 남은 범위까지만 지급합니다. 조기 종료(`missLimit`), 50점 미만, 한도 소진, 보상 도입 전에 확정된 기록에는 `reward: 0`을 반환합니다. 만료 전 동일 로그 재시도는 최초 지급액을 그대로 반환합니다.

1,965점 완주 및 남은 한도가 충분할 때의 예시입니다.

```json
{"id":"40901","rulesVersion":1,"score":1965,"counts":{"perfect":66,"good":0,"miss":0},"endReason":"time","completedAt":"2026-11-12T00:01:03Z","reward":39}
```

FE는 완료 응답의 점수·판정 횟수와 함께 `reward`를 표시합니다. 지급액은 로컬 점수로 계산하지 않습니다. 실제 지급이 있으면 기존 지갑 조회 경로로 표시 잔액을 갱신할 수 있습니다.

## `GET /api/v1/minigames/jump-rope/rankings`

기본값은 `limit=10&offset=0`입니다. `limit`은 1~10, `offset`은 0~10,000입니다. 현재 규칙 버전의 확정 기록에서 사용자별 최고 기록을 골라 점수 내림차순, MISS 횟수 오름차순으로 매깁니다. 두 값이 같으면 공동 순위(`1, 1, 3`)이며 표시 순서는 완료 시각, 라운드 ID 순입니다. `me`는 페이지에 관계없이 전체 순위 기준의 개인 최고 기록입니다. 기록이 없으면 `null`입니다. FE는 목록의 배열 인덱스 대신 응답의 `rank`를 표시합니다.

```json
{"rulesVersion":1,"period":"ALL_TIME","updatedAt":"2026-11-12T00:00:12Z","totalParticipants":1,"offset":0,"limit":10,"items":[{"rank":1,"nickname":"한강줄넘기","score":45}],"me":null,"hasMore":false}
```

오류 본문은 `{"code":"JUMP_ROPE_INVALID_INPUTS","message":"점프 기록의 시간과 순서를 확인해 주세요."}` 형태입니다. 점프 판정 경계와 줄 통과 검산에는 [공통 테스트 데이터](../../backend/src/test/resources/jump-rope/rules-v1.json)를 사용할 수 있습니다. 전체 응답 스키마는 [OpenAPI](openapi.yaml)에 있습니다.
