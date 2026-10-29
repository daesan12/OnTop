# 붕어빵 개인 최고 전체 랭킹

2026-10-28 · 담당 장대산 · S15P31B105-260. 최신 FE v4/v5 요청 기준. 기존 보유 엽전 /api/v1/rankings와 별도다. 구현·로컬 검증과 배포·실계정 검수는 구분한다.

## API

GET `/api/v1/minigames/bungeoppang/rankings?period=ALL_TIME&rulesVersion=v5&limit=20`

기존 회원 Access JWT가 필요하다. period는 ALL_TIME만 허용(기본), rulesVersion은 v4/v5(기본v5), limit은1~20(기본20). 다음 페이지는 nextCursor를 URL 인코딩해 cursor로 전달하고 버전·limit·로그인 사용자를 유지한다. 본인ID는 입력받지 않고 인증 사용자로 me를 계산한다. 응답 Cache-Control:no-store.

## 집계

- 같은 버전·사용자별 made 최대, failed 최소, 확정 완료가 가장 이른 기록1개를 선택한다.
- made 내림차순·failed 오름차순. 두 값 동점은 공동 순위1,1,3, completedAt 오름차순·숫자 userId 오름차순 노출.
- 기존 minigame_sessions의 COMPLETED/ended_at, bungeoppang_v4_rounds의 terminal_reason=VERIFIED/settled_at을 확인한다. v5도 팀원 구현의 같은 rounds 테이블을 사용한다. 탈퇴 회원·잘못된 made/failed JSON 제외.
- 0점·보상0 정상 확정도 포함. 미완료/기권/INVALID/미정산 제외. completedAt은 settled_at이다.
- 기존 결과만 조회한다. 신규 테이블/Flyway/인덱스/기존 SQL/팀원 완료·보상 코드는 변경하지 않는다. 완료 트랜잭션 커밋 후 새 첫 페이지에 반영한다.

```json
{
  "rulesVersion": "v5",
  "period": "ALL_TIME",
  "basis": "PERSONAL_BEST",
  "snapshotId": "40000000-0000-4000-8000-000000000001",
  "updatedAt": "2026-10-28T09:00:00Z",
  "totalParticipants": 1,
  "items": [
    {
      "rank": 1,
      "userId": "101",
      "nickname": "테스트회원",
      "made": 12,
      "failed": 1,
      "completedAt": "2026-10-28T08:50:00Z"
    }
  ],
  "me": null,
  "nextCursor": null
}
```

형식 예시. 본인 기록이 있으면 me는 items와 같은 Item 구조다. 본인 기록 없으면 me=null, 전체 기록 없으면 items=[]/totalParticipants=0/nextCursor=null. 마지막 nextCursor=null. userId 문자열, 시각 UTC ISO8601.

## 페이지 정합성과 한계

커서 없는 첫 페이지는 매번 DB를 새로 조회한다. 결과·본인 순위·updatedAt을 불변 메모리 스냅샷으로 고정해 이후 페이지 중 신기록이 들어와도 중복/누락/순위 역전을 막는다. 갱신은 cursor 없이 재조회한다. 열린 스냅샷은 기본2분간 이전 기준이며 별도 완료 이벤트 캐시 무효화가 필요하지 않다.

서명 커서는 사용자·버전·limit에 귀속된다. ontop.rankings.bungeoppang.snapshot-ttl 기본2분(허용1초~5분), 최대128스냅샷·총10만행 보관 후 오래된 것부터 축출. 단일 조회가1만명을 넘으면 잘린 순위 대신503. 재시작·다른 인스턴스·만료/축출된 커서는409이며 처음부터 재조회한다. 다중 서버/Redis 공유는 미적용. 탈퇴/닉네임 변경도 열린 스냅샷에는 TTL 동안 이전 값이 남을 수 있다.

| HTTP | code | 처리 |
| --- | --- | --- |
|400|INVALID_LIMIT / RANKING_INVALID_PERIOD / RANKING_INVALID_RULES_VERSION / INVALID_CURSOR|입력 확인|
|409|RANKING_SNAPSHOT_EXPIRED|cursor 제거 후 처음부터|
|503|RANKING_UNAVAILABLE|db 프로필·기존 결과 테이블 확인|
|503|RANKING_TOO_LARGE|조회 범위 초과, 별도 집계 설계 필요|

인증 오류는 기존 공통 계약. db 프로필과 이미 존재하는 마이그레이션/테이블이 필요하며 공용 DB 변경은 없다.

## 검증

Service/HTTP: 서명·소유자·버전·limit·만료·CORS·미인증·고정 페이지. BungeoppangRankingMySqlTests: 별도 loopback DB에서 기존 Flyway만 적용해 실제 v4/v5 시작→0점 완료→중복 완료→즉시 랭킹 반영(제어 시계). 양수 최고기록·동점·미정산 제외는 명시적 SQL 테스트 픽스처이며 실제 양수 플레이 검수가 아니다. check-game-additions-frontend.mjs는 실제 HTTP 응답을 무수정 FE 랭킹 파서/병합기에 넣어 확인한다. 배포·실계정 화면 검수는 별도다.

기본20명 페이지 경계·만료 복구는 `BungeoppangRankingPaginationFlowTests`에서 별도로 연결한다.
회원/DB 조회22명과 시계는 fixture이며 실제 Spring HTTP/JWT·스냅샷 응답을
`check-bungeoppang-ranking-pagination.mjs`가 수정 없는 FE `fetchRanking/parseRanking/appendRanking`에 전달한다.
경계 동점·새 기록 중 기존 페이지 유지·다른 회원/버전/limit 거절·만료409 후 첫 페이지 갱신·빈 v4를 확인한다.
기존 실제 MySQL 검사를 대체하거나 React 화면의 자동 복구 구현을 증명하지 않는다.
Node24와 frontend 의존성 설치 후 backend에서 실행한다.

```powershell
$env:TEST_RANKING_FRONTEND = 'true'
.\gradlew.bat test --tests '*BungeoppangRankingPaginationFlowTests'
Remove-Item Env:TEST_RANKING_FRONTEND
```
