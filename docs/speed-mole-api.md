# 스피드 두더지 기록·랭킹 API

구현 계약이며 배포·공용 DB 적용 완료를 뜻하지 않는다. 격리 MySQL 검증을 완료했으며 V151 번호·순서 확인과 MR 병합·배포는 아직 남아 있다. 기존 두더지·붕어빵·공원 랭킹판·지갑·보상은 변경하지 않는다.

## 규칙

- 위 RTYU / 아래 FGHJ, 8구멍 중 4마리 유지. 잡은 구멍은 제외한 기존 빈 구멍으로 즉시 교체한다.
- 준비 3초 뒤 플레이 60초. 성공 +1, 빈 구멍 −3, 매 입력 직후 0점 하한. 등장 모션은 판정 지연이 아니다.
- 서버가 발급한 unsigned 32-bit seed와 규칙 버전 1의 LCG를 양쪽이 사용한다. `state=(state*1664525+1013904223) mod 2^32`, 선택 인덱스는 `floor(state*length/2^32)`다.
- 서버는 타격 순서로 목표를 재생하고 점수·성공·실수를 직접 계산한다. 요청에 클라이언트 점수를 받지 않는다. 인간의 직접 조작이나 봇 부재까지 증명하는 방식은 아니다.
- 입력은 최대 6000개, hole 0~7 정수, at은 준비 시간을 제외한 시작 기준 0~59999ms 정수·비감소 순서다. 잘못된 기록은 전체 거절한다.
- 서버의 60초 마감 전 제출은 거절한다. 마감 뒤 30초까지 제출할 수 있다. 단말 시계나 클라이언트가 주장한 종료 시각으로 마감을 바꾸지 않는다.
- 중도 종료·새로고침한 미확정 판은 랭킹에 포함하지 않는다. 미완료 행은 ACTIVE로 남으며 자동 정리 정책은 이번 범위에 포함하지 않는다.
- 정상 확정 기록 중 개인 최고 하나를 선택한다. 점수 내림차순 → 실수 오름차순. 두 값이 같으면 공동 순위(RANK: 1,1,3), 먼저 확정한 시각·기록 ID 순서로 노출한다. 탈퇴 회원·다른 규칙 버전은 제외한다.

## 공통

Bearer 인증과 기존 허용 Origin 정책을 따른다. 응답은 `Cache-Control: no-store`다. 새 지갑 권한·관리자 권한은 필요 없다. `ontop.minigames.enabled=true`와 DB 프로필, 신규 테이블이 필요하다. 프론트 게임 목록은 개발 호스트 `dev.on-top.world`와 로컬 Vite에서만 노출한다. 운영 목록은 그대로다.

## 시작

`POST /api/v1/minigames/speed-mole/rounds`, `Idempotency-Key: <1~64 ASCII letters/digits/_/->`, body 없음.

```json
{"id":"7","seed":1,"rulesVersion":1,"serverNow":"2030-01-01T00:00:00Z","startedAt":"2030-01-01T00:00:03Z","durationMs":60000}
```

201. 같은 회원·키 재전송은 같은 판·seed·시각을 반환한다. 완료했거나 만료한 시작 키는 409이므로 다음 시작은 새 키를 사용한다. 다른 새 키로 연 판은 독립적으로 판정하며 탭 사이에서 서로의 미완료 판을 종료시키지 않는다. 클라이언트는 서버 응답이 확인되기 전에는 로컬 판을 시작하지 않는다.

## 완료

`POST /api/v1/minigames/speed-mole/rounds/7/complete`

```json
{"taps":[{"hole":1,"at":0},{"hole":3,"at":100}]}
```

```json
{"id":"7","rulesVersion":1,"score":2,"hits":2,"misses":0,"completedAt":"2030-01-01T00:01:03Z"}
```

200. 회원 ID는 인증 주체에서만 읽는다. 완료 행을 잠그고 한 번만 확정한다. 동일 판의 재시도·동시 완료·서로 다른 재전송 본문에도 먼저 확정된 결과를 반환하며 다시 계산하거나 중복 저장하지 않는다. 원래 요청이 성공했는지 불확실하면 같은 판·같은 타격 기록으로 재확인한다. 프론트는 확인 전 성공/랭킹 반영을 표시하지 않는다. 보상 지급은 없다.

## 전체 랭킹·내 최고

`GET /api/v1/minigames/speed-mole/rankings?limit=20&offset=0`

```json
{"rulesVersion":1,"period":"ALL_TIME","updatedAt":"2030-01-01T00:01:04Z","totalParticipants":1,"offset":0,"limit":20,"items":[{"rank":1,"userId":"101","nickname":"테스트 회원","score":2,"hits":2,"misses":0,"completedAt":"2030-01-01T00:01:03Z"}],"me":{"rank":1,"userId":"101","nickname":"테스트 회원","score":2,"hits":2,"misses":0,"completedAt":"2030-01-01T00:01:03Z"},"hasMore":false}
```

200. limit 1~100(기본20), offset 0~10000(기본0). 내 기록이 없으면 me=null. 현재 페이지 밖이어도 내 최고 기록을 별도로 제공한다. 목록·참가자 수·내 기록은 같은 읽기 트랜잭션 스냅샷이다. 페이지를 새로 조회하면 그 사이의 새 기록으로 순서가 바뀔 수 있다. 공원 전체 랭킹판에는 추가하지 않는다.

## 오류와 적용 순서

- 400: `SPEED_MOLE_INVALID_KEY`, `SPEED_MOLE_INVALID_REQUEST`, `SPEED_MOLE_INVALID_TAPS`, `SPEED_MOLE_INVALID_PAGE`.
- 401/403: 기존 로그인·Origin 정책. 타인 판·없는 판은 404 `SPEED_MOLE_ROUND_NOT_FOUND`.
- 409: `SPEED_MOLE_NOT_FINISHED`, `SPEED_MOLE_ROUND_EXPIRED`, `SPEED_MOLE_ROUND_FINISHED`.
- 503: `SPEED_MOLE_UNAVAILABLE`. 미활성·테이블 미적용·DB 장애 시 로컬 결과나 가짜 랭킹으로 대체하지 않는다.

팀 번호·순서 확인 → 격리 DB에서 V151/동시성/랭킹 검증 → SQL 포함 MR → 사용자 병합 → 기존 배포 파이프라인에서 DB·BE → FE → 로그인 계정으로 시작·완료·랭킹·재시도 검수. 스키마는 새 테이블만 추가하며 기존 데이터·SQL 수정/repair/outOfOrder는 사용하지 않는다.

## 로컬 검증 범위 (2026-11-05)

격리 MySQL에서 V151 적용, 같은 시작 키의 동시 요청, 동시 완료의 단일 확정, 개인 최고·공동 순위·버전/탈퇴 제외를 4개 검사로 확인했다. 관련 백엔드94개와 프론트88개 검사, TypeScript 및 park build를 통과했다. 실제 로컬 공원에서2점 완료→격리 DB 저장→내 최고2점·전체 랭킹 재조회를 확인했다. 계정/인증은 테스트 대역이며 개발 서버 로그인·배포 검수는 아니다. 백엔드 전체 검사는 Windows 클래스패스 탐색 지연으로 완료하지 못했다.
