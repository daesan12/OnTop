# 이전 소리함 마이그레이션 경로

`V120__create_feedback_messages.sql`은 별도 테스트 DB에서 사용한 초기 버전이다.
2026-10-27 기준 공용 DEV DB와 운영 DB에는 V120 및 feedback_messages 테이블이 없다.
공유 환경에는 공통 `db/migration/V127__create_feedback_messages.sql`을 사용한다.

`classpath:db/feedback`을 Flyway locations에 추가하면 V127과 같은 테이블을
중복 생성하므로 추가하지 않는다. 기존 DB에 V120이 이미 적용된 환경이라면
V127 배포 전에 이력과 스키마를 별도로 확인한다.
