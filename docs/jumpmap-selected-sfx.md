# 점프맵 확정 효과음 적용

2026-10-31 사용자 최종 선택 8개를 기존 착지 합성음 대신 재생한다. 파일별 선택 ID·편집 구간·길이·SHA-256은 `frontend/public/audio/jumpmap/selection.json`, 표는 같은 폴더의 `SOURCE.md`에 기록했다. 석탑은 후반부, 방패연은 맨 앞부분으로 확정한 편집본이다. 파일은 재인코딩하지 않았다.

## 작업 범위와 연결

- 기준: `origin/dev@098801922d9e9c17ae8f7f72b5d63e48b293ffb6`, 작업 브랜치 `feat/jumpmap-selected-sfx-20261031`, 작업 위치 `frontend-jumpmap-selected-sfx`.
- 게임 코드: `JUMPMAP`. 기존 `frontend/src/features/jumpmap/audio.ts`와 controller, 게임 전용 layout-preview 오디오 어댑터/진단 카운터만 수정한다. 공통 오디오 버스·입력·WS·지갑·맵 파일 변경은 없다.
- 검은 오목돌(홀수 ordinal)은 슬라임 A, 흰 돌(짝수)은 슬라임 B. 나머지는 테마별 고정 파일이다. 각 착지에서 원래 길이·음높이로 한 번 재생하며 방패연 이륙은 재생하지 않는다. 게이트는 기존 합성음을 유지한다.
- 기존 효과음 버스의 음량·음소거, 원격 플레이어 거리 감쇠·좌우 팬을 재사용한다. 사용자 입력으로 오디오가 열린 뒤 8개를 병렬 선로딩/캐시한다. 음원 실패·숨긴 탭·종료한 연결 범위·150ms 이상 늦은 로딩은 조용히 건너뛴다. 동시 재생은 기존처럼 최대 6개다.
- 샘플 종료 이벤트가 누락되더라도 재생 길이+100ms 타이머 또는 연결 취소로 노드를 정지/해제한다. 늦은 종료 이벤트와 타이머가 겹쳐도 보이스 카운터는 한 번만 반환한다.
- BE·DB·Flyway·게임 참가 인원·시작/종료/기권/재접속/보상 계약은 변경하지 않는다.

## 독립 검증과 통합 검증

`frontend`에서 실행한다.

```sh
pnpm exec vitest run jumpmap bgm sfx
pnpm typecheck:tests
pnpm build:park
pnpm test:e2e:jumpmap
```

단위 검증은 독립 실행되며 발판별 파일·실제 WAV 해시/길이·검은/흰 돌·단일 재생·캐시·음원 누락·숨김·연결 취소·지연·동시 재생 제한·게이트를 확인한다.

관련 단위 49개(9개 파일), 타입 검사, 공원 빌드 및 최신 맵 브라우저 10개 시나리오를 통과했다. 브라우저 실행은 기존 시나리오 9개와 오디오 시나리오 1개를 나누어 확인했다.

브라우저 통합 검증은 포트 **5214**, 최신 생성 맵의 `/park`에서 실행된다. Browser 플러그인이 제공되지 않아 저장소의 Playwright/Edge를 사용한다. 8개 WAV를 실제 디코딩한 SHA-256과 각 착지의 AudioBufferSource 시작을 대조하고, 효과음 음소거/해제가 BGM 설정을 바꾸지 않는지 확인한다. 1920×1080과 740×900에서 기존 첫 착지 자동 시작·낙하 재도전·완료 화면·공원 입력 복귀·서버 이벤트 정산·맵 버전 차단도 검증한다. 캡처는 `QA_ARTIFACT_DIR` 또는 OS 임시 폴더에 둔다.

맵 `c05d8ada8b12d4e509f50c7e807949bd976811e1c69a628232520b88c15a0d07`, 코스 `park180-jump-v1`, 규칙 `v2`, 발판/문 113개. 코스 SHA-256은 `db459acd4e0b1e81c7f247c890107f4419ebb68245e84d6e708764e11c1be47b`이다.

REST/WS는 테스트 대역이다. 실제 서버와의 전체 코스 주행·운영 배포 결과나 주관적인 청감 평가는 이 테스트가 보장하지 않는다. 실서버 시작/보상 처리는 기존 구현을 그대로 연결한다.

## Jenkins #218 후속 수정

`dev@67345dfb`의 Frontend tests and build 단계에서 `parkVisualPreservation.test.ts` 1개가 실패했다. 확정 효과음 적용으로 프리뷰의 `jumpAudio.ts`와 `PreviewJumpCourse.tsx`(soundLayers 진단 카운터 1줄)가 바뀌었으나 보존 기준 해시는 이전 합성음 버전이었다. 이전 검증은 점프맵·오디오 관련 테스트에 한정되어 이 전체 회귀 검사를 누락했다.

후속 브랜치 `fix/jumpmap-sfx-ci-20261031`은 같은 작업 위치에서 최신 `origin/dev@67345dfb`를 기준으로 한다. 두 파일의 오디오 변경만 확인한 뒤 `parkVisualCheckpoint.json`의 해당 SHA-256 2개와 설명을 갱신한다. 테스트 로직·보호 파일 목록·나머지 해시는 유지하고 런타임·맵·에셋·BE·DB·Jenkins 설정은 수정하지 않는다. 재현/독립 검증은 `pnpm exec vitest run parkVisualPreservation jumpmapAudio`, 전체 검증은 `pnpm test --maxWorkers=4`와 기존 빌드 명령을 사용한다. 브라우저 재생 로직 변경은 없다.

로컬 전체 회귀: 185개 파일/1,699개 테스트 통과, 기존 3개 파일/6개 테스트 제외. Windows 샌드박스에서 별도 맵 생성 테스트의 임시 파일 rename이 EPERM으로 막혀 동일 명령을 일반 권한으로 다시 실행했다. `typecheck:tests`, `map:check`, `jumpmap:check`, `build`, `build:park`도 통과했다.
