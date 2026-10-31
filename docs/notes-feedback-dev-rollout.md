# 익명 메모·소리함 DEV 배포 준비 (S15P31B105-296)

이 문서는 저장소 변경과 격리 DB 검증 결과만 기록한다. 실제 DEV·PROD DB 상태, 서버 환경변수, 배포 커밋은
확인하지 않았으며 아래 절차로 인프라 담당자가 확인한다.

## 1. 저장소 변경 요약

- 익명 메모 테이블 4개를 공통 `db/migration/V133__create_anonymous_notes.sql`이 만든다.
  이전 `db/notes` V121·V129 최종 스키마와 같다(`NotesSchemaMigrationMySqlTests`). `db/notes`·`db/feedback`은 실행 경로에 넣지 않는다.
- 소리함 테이블은 기존 공통 V127 그대로다.
- DEV·PROD 모두 `NOTES_ENABLED`·`FEEDBACK_ENABLED` 기본 OFF, Flyway locations 변경 없음.
- 메모·소리함의 JPA 예외(잠금 대기 초과 등)도 계약대로 503 `NOTES_UNAVAILABLE`/`FEEDBACK_UNAVAILABLE`로 응답한다.

## 2. 인프라 담당자 전달 사항

### 2-1. V133 이미지 배포 전 (읽기 전용)

```bash
cd /opt/ontop
sudo docker compose --env-file /etc/ontop/dev-app/deploy.env -f infra/app/compose.dev.yaml exec -T mysql sh -s -- ontop_dev < infra/app/verify-notes-db.sh
```

| 항목 | 진행 조건 |
|---|---|
| `legacy_notes_history_count` | 0 |
| `notes_table_count` | 0 |
| 최근 성공 버전 | V133 미만, `success=0` 행 없음 |

조건이 하나라도 다르면 배포를 멈추고 BE 담당자와 기존 스키마·데이터 편입 방법을 정한다.
`flyway repair`·`baseline`·`outOfOrder`·테이블 수동 생성/삭제는 하지 않는다.

### 2-2. V133 이미지 배포 후

같은 스크립트로 V133 `success=1`, `notes_table_count=4`, `notes_board_rows=1`을 확인한다.
소리함은 `verify-feedback-db.sh`로 V127 `success=1`, `feedback_table_count=1`을 확인한다.

### 2-3. 서버 환경변수 (`/etc/ontop/dev-app/app.env`, 값은 기록하지 않음)

| 변수 | 값 | 비고 |
|---|---|---|
| `FEEDBACK_ENABLED` | `true` | 소리함 접수·관리자 조회 등록 |
| `ADMIN_READ_IDS` | 관리자 내부 회원 ID(쉼표 구분) | 비어 있으면 관리자 조회 거절. 기존 `FEEDBACK_ADMINISTRATOR_IDS` 사용 서버는 README 경고 참고 |
| `NOTES_ENABLED` | `true` | V133 적용 확인 후에만 |
| `NOTES_PRIVACY_SECRET` | 서버에서 만든 32자 이상 난수 | 없거나 짧으면 앱 기동 실패. 모든 인스턴스 공통. 교체 시 24시간 재시도·간격 정보 초기화 |

변경 후 `up -d --no-deps --force-recreate app`으로 앱만 재생성한다(`restart`는 env_file을 다시 읽지 않음).
기동 실패 시 `NOTES_ENABLED=false`로 되돌려 다시 재생성한다. `SPRING_FLYWAY_LOCATIONS`는 바꾸지 않는다.
PROD는 이번 범위가 아니며 기본 OFF를 유지한다.

## 3. DEV 실서버 QA 체크리스트

사전: V133·V127 확인, 플래그·비밀키·관리자 ID 설정, 앱 healthy. 실제 브라우저 결과를 확인한 항목만 완료로 표시한다.

### 익명 메모
- [ ] 메모함 반경 밖 작성·조회는 403 `NOTES_OUT_OF_RANGE`
- [ ] 메모함 근처에서 1~300자 작성 201, 301자 이상은 400 `NOTES_TEXT_INVALID`
- [ ] 주제 5종(`daily`·`cheer`·`worry`·`recommend`·`free`) 저장, 생략 시 `free`, 다른 값은 400
- [ ] 새로 접속해도 목록에 같은 주제 유지(전 채널 공용 최신 120장)
- [ ] 같은 `operationId` 재시도는 같은 메모, 본문을 바꾸면 409 `IDEMPOTENCY_CONFLICT`
- [ ] 15초 안 재작성 429 `NOTES_WRITE_COOLDOWN`(+`nextAllowedAt`)
- [ ] 다른 사용자가 작성하면 열린 목록에 `NOTES_CHANGED`(revision 1개)가 1회 도착, 같은 키 재시도에는 알림 없음
- [ ] 응답·WS에 작성자 ID가 없음

### 소리함
- [ ] 소리함 근처에서 5~600자 접수 201, 응답에 본문 없음
- [ ] 601자 이상·5자 미만은 400 `FEEDBACK_TEXT_INVALID`
- [ ] 같은 `operationId` 재시도는 같은 영수증
- [ ] 일반 회원 `GET /api/v1/admin/feedback` 403, 미로그인 401
- [ ] `ADMIN_READ_IDS` 관리자는 목록 조회 200
- [ ] 다른 접속자에게 의견 본문이 WS로 전달되지 않음

### 공통
- [ ] 앱 로그에 비밀키·메모/의견 본문이 남지 않음
- [ ] 기능 OFF로 되돌리면 경로 미등록(인증 회원 404)
