# 행동 로그 migration 대기 위치

S15P31B105-140 행동 로그 테이블(`behavior_events`, `world_position_samples`)의 SQL이다.
기본 Flyway 경로(`db/migration`)에 포함하지 않는다.

- 지갑 스키마 작업이 `db/migration`의 다음 번호를 먼저 사용한다. 번호 충돌을 피하려고 여기에 둔다.
- 지갑 작업 머지 후 최신 `dev`의 다음 번호로 `db/migration`에 옮긴다.
  그때 V1~V3 고정을 확인하는 MySQL 테스트(`UsersMySqlTests`, `AuthExchangeMySqlTests`)의 버전·테이블 목록도 함께 갱신한다.
- 그 전에 로컬에서 켜려면 `spring.flyway.locations=classpath:db/migration,classpath:db/behavior`와
  `ontop.behavior-log.enabled=true`를 함께 지정한다.

설계와 유실 기준은 저장소 루트 `docs/behavior-log.md`를 따른다.
