# BE 요청: 붕어빵 개인 최고 점수·최대 연속 콤보 랭킹

작성일: 2026-10-29 · 최신 요청: 점수 동점 시 최대 연속 콤보로 비교

## 요청 요약

붕어빵 전체 랭킹을 **개인 최고 점수 → 해당 경기의 최대 연속 콤보** 순서로 집계해 주세요. 점수와 최대 콤보가 모두 같으면 공동 순위이며, 먼저 완료한 기록이 위에 표시되어야 합니다. 완성 개수(`made`)·실수 횟수(`failed`)는 순위·동점 판정에 사용하지 않습니다.

FE의 표시·응답 검증은 이 계약으로 수정했습니다. 이번 작업에서 BE 소스는 수정하지 않았습니다. 현재 BE 응답에는 `score`·`maxCombo`가 없으므로 FE는 준비 안내를 표시합니다. **실제 전체 순위 전환에는 BE 집계·응답 변경과 배포가 필요합니다.**

## 집계 규칙

1. 같은 규칙 버전(`v4`/`v5`)에서 사용자마다 대표 경기 한 건을 선택합니다. `score DESC, max_combo DESC, settled_at ASC, session_id ASC` 순서입니다.
2. 최고 점수가 여러 건이면 그중 최대 연속 콤보가 가장 높은 경기를 선택합니다. 두 값이 같으면 먼저 정산된 경기를 선택합니다.
3. `score`와 `maxCombo`는 **선택된 동일 경기의 값**입니다. 다른 경기에서 기록한 개인 최고 콤보를 가져와 합치지 않습니다. 누적 콤보·종료 직전 현재 콤보(`combo`) 대신 경기 전체의 최대 연속 콤보(`maxCombo`)를 사용합니다.
4. 전체 순위는 `score DESC, max_combo DESC`로 계산합니다. 두 값이 모두 같아야 공동 순위이며 다음 순위는 인원수만큼 건너뜁니다. 예: `1, 1, 3`.
5. 공동 순위 안에서 화면 표시 순서만 `settled_at ASC, user_id ASC`로 고정합니다. 정산 시각까지 같으면 숫자 userId 순서이며, 이 순서가 공동 순위를 바꾸지는 않습니다.
6. 기존 정상 완료·정산 조건을 유지합니다: 붕어빵 세션 `COMPLETED`·`ended_at`, 라운드 `terminal_reason=VERIFIED`·`settled_at`, 요청한 `rules_version`, 탈퇴하지 않은 회원. 미완료·기권·INVALID·미정산 기록은 제외합니다.
7. 정상 정산된 0점·최대 콤보 0·지급 보상 0인 기록도 포함합니다. null·음수·잘못된 형식의 점수/콤보는 정상 기록으로 집계하지 않습니다. 누락된 콤보를 임의로 0으로 치환하지 말고, 기존 데이터가 누락된 경우 검증 가능한 기록을 통한 복구 여부를 확인해 주세요.

## 현재 코드와 집계 원천

- `backend/src/main/java/com/ssafy/ontop/ranking/repository/BungeoppangRankingRepository.java`: 현재 대표 경기·순위를 `made DESC, failed ASC`로 계산합니다.
- `backend/src/main/java/com/ssafy/ontop/ranking/dto/BungeoppangRankingPage.java`: 랭킹 Item에 `score`·`maxCombo`가 없습니다.
- `backend/src/main/java/com/ssafy/ontop/minigame/service/MinigameService.java`: v4/v5 정산 시 `session.complete(result.score(), reward, settledAt)`로 점수를 저장하고, `result.maxCombo()`를 포함한 정산 응답을 `record.accept(write(request), write(response))`로 저장합니다.
- 따라서 점수는 서버 확정 `minigame_sessions.score`, 최대 콤보는 **같은 세션의** `bungeoppang_records.result_json` 내 `maxCombo`를 사용할 수 있습니다. FE 입력값·지급 엽전·일일 보상 한도를 대신 사용하지 않습니다.
- `BungeoppangRankingService`의 고정 스냅샷·서명 커서 정합성 보장은 유지해야 합니다.

집계 방향 예시이며 실제 JSON 추출·유효성 검사·DTO 매핑은 BE에서 반영해 주세요.

```sql
-- 정상 검증·정산 및 score/max_combo 유효성을 확인한 경기에서 대표 기록 선택
ROW_NUMBER() OVER (
  PARTITION BY user_id
  ORDER BY score DESC, max_combo DESC, settled_at ASC, session_id ASC
) AS choice

-- choice = 1인 대표 기록을 대상으로 순위 계산: 시각은 순위 조건에 넣지 않음
RANK() OVER (ORDER BY score DESC, max_combo DESC) AS place

-- 화면 표시 순서
ORDER BY score DESC, max_combo DESC, settled_at ASC, user_id ASC
```

## API 변경 요청

경로·인증·파라미터는 그대로 유지합니다.

```text
GET /api/v1/minigames/bungeoppang/rankings?period=ALL_TIME&rulesVersion=v5&limit=20
```

- `items[]`·`me`에 필수 숫자 필드 **`score`와 `maxCombo`**를 추가합니다. 두 값 모두 0 이상의 JavaScript 안전 정수여야 하며 문자열로 반환하지 않습니다.
- `rank`는 위의 점수·최대 콤보 기준으로 서버가 계산합니다. `items`·`me`·다음 페이지는 같은 스냅샷 기준이어야 합니다.
- `completedAt`은 선택된 대표 경기의 `settled_at`이며 UTC ISO 8601입니다.
- `basis=PERSONAL_BEST`, `period=ALL_TIME`, 버전, 스냅샷, 전체 참여자 수, 커서 구조는 유지합니다.
- `made`·`failed`는 기존 클라이언트 호환용 추가 필드로 유지할 수 있습니다. 변경된 FE는 이 두 값을 순위에 사용하지 않습니다.
- 본인 기록이 없으면 `me=null`, 전체 기록이 없으면 `items=[]`, `totalParticipants=0`, `nextCursor=null`을 유지합니다.

응답 예시: 먼저 완료한 1200점·8콤보 사용자도 1200점·12콤보 사용자보다 아래입니다. 1000점·30콤보는 1200점 기록보다 아래입니다.

```json
{
  "rulesVersion": "v5",
  "period": "ALL_TIME",
  "basis": "PERSONAL_BEST",
  "snapshotId": "score-combo-snapshot-1",
  "updatedAt": "2026-10-29T04:00:00Z",
  "totalParticipants": 4,
  "items": [
    { "rank": 1, "userId": "102", "nickname": "일찍 구운 달인", "score": 1200, "maxCombo": 12, "completedAt": "2026-10-28T08:00:00Z" },
    { "rank": 1, "userId": "103", "nickname": "노릇노릇 장인", "score": 1200, "maxCombo": 12, "completedAt": "2026-10-28T09:00:00Z" },
    { "rank": 3, "userId": "101", "nickname": "공원 산책자", "score": 1200, "maxCombo": 8, "completedAt": "2026-10-28T07:00:00Z" },
    { "rank": 4, "userId": "104", "nickname": "콤보 도전자", "score": 1000, "maxCombo": 30, "completedAt": "2026-10-28T07:00:00Z" }
  ],
  "me": { "rank": 3, "userId": "101", "nickname": "공원 산책자", "score": 1200, "maxCombo": 8, "completedAt": "2026-10-28T07:00:00Z" },
  "nextCursor": null
}
```

## 배포·페이지 정합성

기존 개수 기준 또는 점수만 비교하는 스냅샷과 새 점수·콤보 기준 페이지가 섞이지 않도록 기존 스냅샷을 만료/재생성해 주세요. 기존 커서는 현재 계약의 `409 RANKING_SNAPSHOT_EXPIRED`로 첫 페이지 재조회를 유도할 수 있습니다. 같은 스냅샷 안에서는 신기록 발생 후에도 중복·누락·순위 역전이 없어야 합니다.

FE는 일부 페이지만 재정렬해서 전체 순위를 만들지 않습니다. `score` 또는 `maxCombo`가 없는 응답은 준비 안내로 처리합니다. BE 랭킹 테스트·FE 파서를 사용하는 연동 검증 스크립트·Postman 예제도 새 계약으로 수정하고 FE 배포 시점을 맞춰 주세요.

## BE 완료 확인 항목

| 시나리오 | 기대 결과 |
| --- | --- |
| 1200점·8콤보 / 1000점·30콤보 | 점수가 높은 기록 우선 |
| 1200점·12콤보를 늦게 기록 / 1200점·8콤보를 일찍 기록 | 콤보가 높은 기록 우선, 서로 다른 순위 |
| 점수·최대 콤보 모두 동일, 완료 시각 다름 | 공동 순위, 먼저 완료한 기록부터 표시 |
| 1200점·12콤보 2명, 1200점·8콤보 1명 | 순위 1·1·3 |
| 동일 사용자의 최고 점수 경기 여러 건 | 최대 콤보가 높은 경기 선택, 두 값이 같으면 최초 완료 경기 선택 |
| 최고 점수 경기 1200점·8콤보 / 다른 경기 1000점·30콤보 | 대표 기록은 1200점·8콤보이며 콤보를 합치지 않음 |
| 점수·콤보 동일, 완성·실수 횟수 다름 | 공동 순위를 유지 |
| 정상 0점·0콤보·보상 0 / 콤보 누락 / 미정산·기권 | 정상 확정 0 기록만 포함, 누락은 임의 0 치환 금지 |
| 본인이 첫 페이지 밖 / 동점이 페이지 경계에 걸림 | `me`와 다음 페이지의 순위·콤보·표시 순서 일치 |
| v4·v5에 각각 기록 있음 | 요청 버전의 기록만 집계 |

## BE 개발자에게 전달할 문구

> 붕어빵 랭킹은 개인 최고 점수가 우선이고, 점수가 같을 때 해당 경기의 최대 연속 콤보가 높은 사람이 앞서도록 변경 부탁드립니다. 두 값까지 같으면 공동 순위이며 먼저 완료한 기록을 위에 표시해 주세요. 사용자별 대표 경기는 score DESC, maxCombo DESC, 정산 시각 ASC로 선택하고, 전체 순위는 score DESC, maxCombo DESC로만 계산하면 됩니다. 다른 경기의 개인 최고 콤보를 섞지 않고 같은 세션의 서버 확정 점수와 maxCombo를 함께 사용해야 합니다. FE는 items/me의 score·maxCombo 표시와 새 기준 검증을 반영했으므로 BE 집계·응답 필드 추가와 배포가 필요합니다. 상세 계약과 검증 예시는 이 문서에 정리했습니다.
