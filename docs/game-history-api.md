# 내 경기 내역·게임별 전적

HISTORY-01 / HISTORY-02. Notion REST 명세의 기존 경로·응답 필드를 구현한다.
활성 회원과 유효한 로그인 세션의 Access JWT가 필요하며 사용자 ID는 인증 Principal에서만 얻는다.
두 응답 모두 `Cache-Control: no-store`, `Referrer-Policy: no-referrer`를 적용한다.

## HISTORY-01 · 내 경기 내역

`GET /api/v1/users/me/games?size=20&cursor=701&gameCode=OMOK`

| 조건 | 형식 |
| --- | --- |
| cursor | 선택, 양수 BIGINT의 문자열. 생략 시 첫 페이지 |
| size | 선택, 정수 1~100, 기본 20 |
| gameCode | 선택, OMOK / DICE / ONE_CARD / LIAR_BRIDGE / DICE_LEDGER / HALLI_GALLI / ALKKAGI |

```json
{
  "items": [
    {
      "gameSessionId": "700",
      "gameCode": "OMOK",
      "status": "FINISHED",
      "myResult": "WIN",
      "settlementStatus": "SETTLED",
      "endedAt": "2026-10-29T00:00:00Z"
    }
  ],
  "nextCursor": null,
  "hasNext": false
}
```

- 본인 `game_participants`와 `game_sessions`를 조합한 단일 JPA JPQL SELECT다.
- FINISHED / INVALID이며 종료 시각이 있는 경기만 표시한다. 진행 중·예약·시작 거절은 제외한다.
- **경기 DB ID 내림차순**이다. `endedAt` 정렬을 의미하지 않는다. 동일 종료 시각도 ID로 구분한다.
- `id < cursor`와 `size+1` 조회로 다음 페이지를 판단한다. nextCursor는 다음 페이지가 있을 때만 마지막 반환 ID 문자열이다.
- ID는 JavaScript 정밀도 손실을 막기 위해 문자열이다. 사용자 입력 cursor는 다른 사람의 ID여도 조회 범위를 넓히지 않는다.
- 정산 PENDING도 종료 판정이 있으면 표시한다. 결과 없는 INVALID의 myResult는 null이며, 저장된 FORFEIT가 있으면 그대로 표시한다.
- 페이지는 불변 스냅샷이 아니다. 이전 페이지를 본 뒤 늦게 종료된 높은 ID의 경기는 새 첫 조회에서 확인한다.
- 조회하지 않은 경기는 빈 목록이며 404가 아니다. 읽기 요청이 결과 확정·예약 해제·정산을 실행하지 않는다.
- FE는 새로고침 후 결과 발견에 `size=1`의 첫 항목만 쓴다. 이는 사용자의 "가장 최근 종료(FINISHED·INVALID) 경기"이며
  진행 중 경기는 나오지 않는다. 진행 중 경기는 이 API가 아니라 `GAME_CONNECTION_STATE`로 복구한다.
  [새로고침 후 결과 발견](game-recovery.md#새로고침-후-경기-결과-발견-ontop-story-b) 참고.

## HISTORY-02 · 내 게임별 전적

`GET /api/v1/users/me/game-stats` — body 없음.

```json
{
  "items": [
    {
      "gameCode": "OMOK",
      "played": 10,
      "wins": 5,
      "losses": 3,
      "forfeits": 1,
      "draws": 1
    }
  ]
}
```

- 본인 FINISHED·종료 시각 존재·확정 결과 WIN / LOSE / FORFEIT / DRAW만 한 GROUP BY 조회로 집계한다.
- INVALID, 진행 중, 결과 null은 제외한다. 정산 PENDING 여부와 승패 확정은 구분한다.
- `played = wins + losses + forfeits + draws`. 기권을 losses에 다시 넣지 않는다.
- 기록이 있는 게임만 gameCode 오름차순으로 반환한다. 전적이 없으면 items: []다.
- Elo/Glicko·급단·시즌·상대 정보·미니게임 전적은 추가하지 않는다.

## 오류와 실행 조건

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | INVALID_CURSOR | 양수 BIGINT 형식이 아닌 cursor |
| 400 | INVALID_SIZE | size 정수·범위 오류 |
| 400 | UNSUPPORTED_GAME | 지원하지 않는 gameCode |
| 401 | AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN / AUTH_MEMBER_STATE_CHANGED | 기존 인증·활성 회원 정책 |
| 403 | AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED | 기존 Origin·권한 정책 |
| 503 | HISTORY_UNAVAILABLE / AUTH_MEMBER_LOOKUP_UNAVAILABLE | DB 미설정·조회 실패 / 인증 회원 조회 실패 |

기존 `db` 프로필과 경기 스키마를 사용한다. 별도 활성화 플래그·새 Flyway·테이블·인덱스는 없다.
DB 없는 실행에서도 경로는 존재하되 인증 후 조회는 503이다. 팀원 인증·결과 저장·예약/정산 코드는 수정하지 않는다.

## 검증

- `GameHistoryRequestTests`: 커서·크기·게임 코드 검증.
- `GameHistoryServiceTests`: 다음 페이지·빈 목록·DB 미설정/오류.
- `GameHistoryHttpTests`: 실제 HTTP/JWT 필터·본인 범위·오류·CORS. 회원 조회와 repository는 대역이다.
- `GameHistoryMySqlTests`: 기존 loopback 격리 DB, Flyway 비활성·DDL validate, 소규모 엔티티 fixture 전부 롤백.
  본인/타인 분리·ID/필터·무효/PENDING/기권·승패 집계·쿼리당 SELECT 하나·엔티티 로딩/DML 없음 확인.
  실제 게임 플레이·지갑 정산·개발 서버 배포 검증은 아니다.
- Postman `OnTop-History.postman_collection.json` 및 HTTP 37~40 예제.
