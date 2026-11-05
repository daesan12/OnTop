# 공원 캐릭터 들기·던지기

## 작업 기준과 실행

- 작업 위치: `OnTop/avatar-carry-throw-20261105`, 브랜치 `feat/avatar-carry-throw`.
- 시작 기준: `origin/dev@a6408f75932feddf60f5659a76a6f3b95b13630f`.
- 최종 통합 기준: `origin/dev@211c4f16340af6c5dd127ffb3372d7815b90e4b1`. 원격 재확인 후 fast-forward로 반영했으며 충돌은 없었다.
- 최신 생성 맵: `c05d8ada8b12d4e509f50c7e807949bd976811e1c69a628232520b88c15a0d07`.
- 검수 서버: `node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5296 --strictPort`.
- 다른 작업 폴더·미커밋 코드·맵 원본은 수정하지 않는다. 새 DB migration과 에셋·패키지 추가는 없다.

## 조작과 상태

가까운 같은 높이의 멈춰 있는 사용자를 바라보면 기존 상호작용 안내에 `E · ○○ 님 들기`가 표시된다. 시설과 캐릭터는 같은 시선·거리 선택 경로를 사용한다. 수평 거리 2m, 높이 차이 0.8m 이내에서 서버가 들기를 승인한다. 서버 충돌체가 두 사용자 사이를 가리거나 머리 위 공간이 막히면 승인하지 않는다.

들고 있는 동안에는 기존 시설 대신 `E · 바라보는 방향으로 던지기`와 `Esc · 내려놓기`를 표시한다. 들린 사용자도 `Esc · 내려오기`를 사용할 수 있다. 운반은 최대 15초이며, 막힌 공간·접속 종료·채널 퇴장·다른 활동 시작 때도 해제한다. 들고 걷는 동작은 유지한다.

던지기는 카메라의 정규화된 3차원 방향으로 실행한다. 수평 성분은 최대 9m/s, 수직 성분은 방향 성분×9+3m/s이며, 서버 30Hz 물리와 최신 맵 충돌을 사용한다. 착지·수영 진입·최대 3초 비행이 끝나면 평소 이동으로 돌아온다. 들린 상태와 비행 중의 수동 이동·위치 보고는 서버 좌표를 덮어쓰지 못한다. PARK_V1 이동은 착지 후 기존 검증 권한으로 복원한다.

포즈는 기존 캐릭터 리그에서 양팔로 머리 위에 들기, 옆으로 누운 피운반자, 던진 뒤 팔 내리기, 비행 자세를 구성한다. 다른 사용자가 보는 동작도 공개 서버 상태를 따른다.

## 행동 충돌 방지

들기와 던지기는 본인과 상대방 모두를 검사한다.

- 보드게임 참가·테이블 착석, 미니게임 진행, 경기 관전.
- 벤치·운동기구·망원경 사용, 수영, 감정표현, 따라가기 관계, 돌탑 도전.
- 채팅·상점·옷장·설명서·지도 등 다른 창이 키 입력을 점유하는 상태.
- 이미 운반·비행 중이거나 접속이 끊긴 대상. 들기 대상의 이동·점프 중에도 거절한다.

서버 게임·시설 상태는 클라이언트 선언과 독립적으로 검사한다. 창 점유는 창 종류·본문을 노출하지 않는 `interactionBusy` 값만 공유한다. 클라이언트는 약 100ms마다 변화를 확인하고, 값이 바뀔 때만 전송한다. 창을 열면 던지는 대신 운반을 해제한다. 점유 해제 패킷으로 서버의 게임·시설 제한을 해제할 수 없다.

채팅·팝업의 E와 Esc는 기존 입력 소유권을 따른다. 운반 도중 테이블·시설·따라가기·감정표현 진입도 서버에서 차단한다. 중복·늦은 던지기 및 해제는 관계별 `carryId`로 거절한다. 한 사용자는 운반 관계 하나만 가질 수 있다.

## FE/BE 공개 계약

모든 요청은 기존 인증 Raw WebSocket과 TableHub 잠금을 사용한다. 요청 사용자 ID는 인증된 연결에서 가져온다.

| 요청 | payload | 성공 응답 |
| --- | --- | --- |
| `WORLD_CARRY_PICKUP` | `{targetId}` | `WORLD_STATE` |
| `WORLD_CARRY_THROW` | `{carryId, dx, dy, dz}` | `WORLD_STATE` |
| `WORLD_CARRY_RELEASE` | `{carryId}` | `WORLD_STATE` |
| `WORLD_INTERACTION_SET` | `{busy}` | `WORLD_STATE` |

`WORLD_STATE.avatars[].carry`는 `null` 또는 `{carryId, partnerId, role}`이다. role은 `CARRIER`, `CARRIED`, `THROWN`이다. 같은 채널만 수신한다. 창 점유 중에는 `interactionBusy: true`를 추가한다. 새 서버는 `carry: null`도 명시하며, 구 서버가 이 필드를 생략하면 FE는 들기 안내와 창 점유 전송을 활성화하지 않는다.

주요 오류는 `CARRY_TARGET_UNAVAILABLE`, `CARRY_ACTIVITY_CONFLICT`, `CARRY_OUT_OF_RANGE`, `CARRY_UNAVAILABLE`, `CARRY_LINK_MISMATCH`, `INVALID_PAYLOAD`이다. 관계·비행은 채널 물리 인스턴스의 일시적 상태이며 서버 재시작 복구를 보장하지 않는다. 지갑·정산·게임 엔진 계약은 변경하지 않는다.

## 검증

```powershell
# frontend/
node node_modules/vitest/vitest.mjs run --maxWorkers=4
node node_modules/typescript/bin/tsc --project tsconfig.tests.json --noEmit
node node_modules/@playwright/test/cli.js test --config playwright.carry.config.ts

# backend/
.\gradlew.bat test --tests '*WorldCarry*Tests'
```

브라우저 테스트 설정은 5296 포트의 `park-integration` 서버를 시작하고 `generatedPark: true` wire fixture를 사용한다. 같은 포트를 사용하는 별도 서버는 먼저 종료한다. 브라우저 fixture의 들기·비행 좌표는 연출·통신 검수용이며 서버 물리 시뮬레이션이 아니다.

- 프런트 전체 회귀: 2,325개 통과, 6개 기존 조건부 테스트 제외. 타입 검사 통과.
- 실제 Edge/Playwright: 1440×900, 900×540에서 E 들기→카메라 방향 던지기→해제, Esc 내려놓기, 게임 대상 제외, 채팅 입력 차단과 조작 버튼 접근 확인. 페이지 식별·첫 맵 렌더·오버레이·콘솔 오류 검사 통과.
- 서버 물리: 최신 생성 맵에서 양 이동 권한 모드, 중복 입력, 착지 복원, 외벽, 접속 종료, 15초 제한 확인.
- 서버 최종 관련 회귀: 126개 통과, 실제 MySQL 환경을 요구하는 기존 테스트 1개 제외. 생성 맵 빌드와 `git diff --check` 통과.
- 실제 랜덤 포트 WebSocket: 인증 테스트 대역으로 양쪽 방송, 채널 격리, 요청 권한·위조 필드, 게임·감정표현·따라가기·창 점유 충돌과 직접 내려오기 확인.
- 실제 배포 서버·OAuth·DB 연결 및 실제 헤드셋 검수는 수행하지 않았다. 브라우저 wire 검수와 실제 서버 소켓·물리 검증을 구분한다.
- Browser 플러그인은 제공되지 않아 저장소의 Playwright와 Edge를 사용했다. 최초 샌드박스의 임시 파일 권한 실패는 동일 검사를 권한이 허용된 실행 환경에서 재검증했다.
- 기존 Three.Clock 폐기 예정 안내, 셰이더 부동소수점 정밀도 경고, 빌드의 큰 청크 안내는 남아 있다. 브라우저 실행 오류나 빌드 실패는 없었다.

공통 변경은 `TableProtocol`, `TableHub`, `WorldChannelRegistry`, `WorldPhysics`, `WorldEmoteService`, FE `protocol/worldClient`, runtime 포트, E/Esc 입력, 공통 상호작용 선택·안내, 캐릭터 모션·표시 연결이다. 게임별 내부 엔진·맵 배치·카메라 수식·인증·지갑 구현은 변경하지 않는다.
