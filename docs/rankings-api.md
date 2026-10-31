# 보유 엽전 랭킹

공원 랭킹판의 세 목록과 1분 스냅샷 계약은 [park-ranking-api.md](park-ranking-api.md)를 참고한다.

RANK-01 · 담당 장대산. 2026-10-25 사용자가 팀원 요청에 따른 추가 담당을 확정했다.
기준은 OnTop 통합 기획서 v0.4의 현재 보유량 랭킹과 Notion RANK-01의 응답 형식이다.

## 요청·응답

`GET /api/v1/rankings?limit=20` · 기존 회원 Access JWT 필요. limit 생략20, 정수1~100.

```json
{
  "items": [
    { "rank": 1, "userId": "101", "nickname": "탑골대장", "coinBalance": 300 }
  ],
  "myRank": { "rank": 3, "coinBalance": 100 },
  "updatedAt": "2026-10-25T10:00:00Z"
}
```

- `coinBalance`는 실제 `wallets.balance`이며 예약금도 포함한다. 초안의 `wallets.coin_balance`는 실제 컬럼명이 아니다.
- 활성 회원 중 지갑이 존재하는 회원을 대상으로 보유량 내림차순. 동점은 `1,1,3`, 같은 잔액의 표시 순서는 userId 오름차순.
- items는 최대 limit명이다. 경계 동점이어도 인원을 초과해 반환하지 않는다. TOP 밖 본인 순위는 myRank로 제공한다.
- 지갑 미생성 회원은 랭킹에서 제외하며 본인 지갑이 없으면 myRank=null이다. 조회로 지갑 생성·가입 지급을 수행하지 않는다.
- `updatedAt`은 조회 시각이다. 정산 완료 시각이나 캐시 만료 시각이 아니다. 주간/시즌 리셋·추가 WS 방송은 구현하지 않는다.
- 회원 ID는 서버가 인증한 Principal만 사용한다. userId 쿼리로 다른 사람의 myRank를 조회할 수 없다.
- 성공·오류 모두 Cache-Control: no-store. 쿠키를 발급하지 않는다. 기존 REST JWT/sid·Origin/CORS 정책을 그대로 사용한다.

## 오류·실행 조건

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | INVALID_LIMIT | 빈 값·범위 밖·정수가 아닌 limit |
| 401/403/500 | 기존 AUTH_* | 토큰·회원·세션·Origin·서버 인증 설정 검증 실패 |
| 503 | RANKING_UNAVAILABLE | db 프로필/조회 저장소 부재, DB 조회 또는 트랜잭션 실패 |
| 503 | AUTH_MEMBER_LOOKUP_UNAVAILABLE | 기존 회원 인증 저장소 확인 실패 |

Controller는 모든 프로필에 등록하며 실제 조회는 기존 db 프로필의 users/wallets와 MySQL8 계열이 필요하다.
신규 환경변수·Entity·Flyway·인덱스·DDL은 추가하지 않는다. 팀원 지갑/인증/예약·정산 코드는 수정하지 않는다.
공용 DB 설정·마이그레이션 이력·배포는 변경하지 않았다. 로컬 커밋이 개발 서버 반영을 의미하지 않는다.

## 구현과 검증

RankingController → RankingService → RankingRepository(JPA EntityManager).
기존 users/wallets를 조인해 RANK와 ROW_NUMBER를 계산한 뒤 TOP과 본인을 하나의 SELECT로 읽는다.
본인 순위와 목록이 서로 다른 조회 시점으로 어긋나지 않으며 쓰기 잠금·지갑 변경·원장 기록이 없다.
DB 전체 대상의 정렬 비용은 있으며 대규모 운영 부하/성능 개선 수치를 측정한 것은 아니다.

RankingHttpTests/RankingServiceTests는 인증·limit·기본20·본인 ID 고정·CORS·503을 검증한다.
RankingMySqlTests는 새 격리 DB에 **기존 SQL만** 적용해 dev,db 실제 JWT/JPA/HTTP에서
동점·예약 포함·탈퇴 제외·상위 밖 본인·빈 목록·지갑 미생성·커밋된 잔액 갱신과 읽기 전용 SELECT를 확인한다.
테스트 준비·업데이트의 JDBC 호출은 fixture 전용이며 운영 조회는 JPA를 사용한다.

Postman: postman/OnTop-Ranking.postman_collection.json. 성공·잘못된 limit·미인증 요청 3개.
