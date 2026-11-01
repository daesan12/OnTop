# 전망대 메모함 위치·충돌 보완

- 기준: `origin/dev@99428b2ae90ffb8b8fa2b53fc35e73bc84839cd7`
- 작업 브랜치: `fix/accidental-tab-close-20261101`
- 담당 범위: 공원 공통 시설. 게임 모듈이나 DB 스키마 변경 없음.

## 수정

- 최신 생성 맵의 메모함을 `[60.5, 18.12, 54.5]`에서 `[60.5, 18.12, 54.05]`로 뒤쪽 0.45m 이동했다.
- 본체의 충돌 형상이 누락되어 통과하던 문제를 공유 `physics.boxes`의 `tower-notes-board`로 보완했다.
  표시 배율과 동일한 설정에서 반폭 1.302m, 반깊이 0.962m, 높이 3.442m를 사용하며 캐릭터 반경은 더하지 않는다.
- 상호작용 좌표와 충돌 형상이 전망대 이동을 함께 따르도록 유지한다.
- 생성 맵·manifest·FE mapVersion을 갱신한다. 점프맵은 같은 공원 버전을 참조하므로 FE 전달본과 BE 리소스의
  버전·checksum도 함께 갱신한다. 코스 형상·규칙은 바꾸지 않는다.
- FE와 BE는 같은 생성 맵을 배포해야 한다. 서버 충돌은 이 브랜치의 생성 맵을 서버에 반영한 이후 적용된다.

## 검증 방법

- FE: `notesBoardGeometry`, `parkPhysics`, `generatedServiceMap`에서 실제 모델 크기·충돌 형상·이동 좌표를 검사한다.
- FE Rapier 이동 예측에서도 메모함 앞뒤 차단과 옆 통로 이동을 두 이동 프로필로 검사한다.
- BE: `TEST_GENERATED_MAP_DIR`로 생성 맵을 전달하고 `PreparedParkMovementTests`에서 실제 Bullet 이동을 검사한다.
  메모함 앞뒤 통과가 막히고 옆 통로는 걸어서 지날 수 있어야 한다.
- 브라우저: `frontend`에서 `playwright.park.config.ts notes-live.spec.ts` 실행. 개발 포트는 5202다.
  HTTP/WS fixture를 사용하는 독립 검증으로, 메모함 접근·작성·목록 갱신·실제 종이 표면과 텍스처 노출을 검사한다.
  실제 서버·DB 연결을 검증한 결과로 간주하지 않는다.

최종 결과: FE 단위 테스트 1,800개 통과(선택 검사 6개 스킵), BE 맵 전달·물리·소켓·점프맵 23개 통과,
Edge 메모 흐름 1개 통과. FE·테스트 타입 검사, park-integration 빌드, 맵·코스 생성본 검사,
기존 시각·이전 맵 보존 검사 및 migration 경계 검사 통과. 브라우저 pageerror 없음.
공유 맵 최종 버전은 `aa9fd9dc40f7a72d53bbdc57a982f30e16ea4fcf3800769ab7fd8f339f358464`다.

## 서버 메모 활성화 보류

사용자가 제공한 화면에는 “익명 메모 서버 설정이 아직 준비되지 않았습니다”가 표시된다.
FE는 메모 API의 404 응답을 이 문구로 안내한다. 저장소의 DEV·PROD 설정은 기본 비활성이며,
실제 서버의 플래그·배포 버전·프록시 상태는 이 작업에서 확인하지 못했다.

사용자 지시에 따라 실제 서버 활성화는 팀원이 추후 진행한다. 기존
[`notes-feedback-dev-rollout.md`](../notes-feedback-dev-rollout.md)에 따라 V133 적용·테이블 4개·보드 행을 확인한 뒤
`NOTES_ENABLED`와 서버 전용 `NOTES_PRIVACY_SECRET`을 설정하고 앱 컨테이너를 재생성해야 한다.
새 migration을 만들거나 V136 이하 번호를 재사용하지 않는다. 실서버 메모 작성·부착은 활성화 후 별도 확인이 필요하다.
