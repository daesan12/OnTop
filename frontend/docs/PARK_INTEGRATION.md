# 공원 3D · 공통 WebSocket 연결

이 문서는 첫 공원 이관의 기록이다. 후속 공통 경기 흐름·오목 준비는 [OMOK_INTEGRATION.md](OMOK_INTEGRATION.md), 기능별 현재 반영 여부는 [PROTOTYPE_FEATURE_AUDIT.md](PROTOTYPE_FEATURE_AUDIT.md)를 따른다.

2026-10-22. `dev`의 `f42faec`에서 시작해 최신 `d2d571f`의 USER-01 계약을 반영한 **공원/테이블 대기 공간 FE 이관**이다. 변경은 frontend 안에만 있다. 서버 구현·DB·계약 파일은 변경하지 않았다.

## 기존 팀원 작업 보존

로그인·콜백·온보딩 UI, 기존 이미지·폰트, styles.css, park.css, main.tsx, index.html은 원본을 유지한다. 기존 공원 채널/계정/채팅/HUD 디자인을 유지하고 데이터·함수만 연결한다. 새 CSS는 공원 장면·새 연결 패널 범위로 제한한다.

기존 파일 연결 수정은 다음과 같다.

| 파일 | 변경 이유 |
|---|---|
| src/park/ParkPage.tsx | Provider 연결, 예시 채팅 대신 서버 메시지/sendChat, 채널 인원, 표시용 프로필, 입력 잠금 |
| src/park/ParkScene.tsx | 기존 이미지 자리에 지연 로드한 Canvas·로딩/오류 처리 |
| src/App.tsx | 서버의 로그인 종료를 기존 로그인 전환 함수에 연결하는 prop 한 개 |
| src/auth/authFlow.ts | 접속권 401 후 기존 Refresh 강제 호출 옵션, 중복 Refresh 합치기, 로그아웃 뒤 늦은 응답 차단. UI·API·쿠키 정책 유지 |
| vite.config.ts | 기존 /api/v1 유지, /ws/tables 개발 프록시 추가 |
| package.json / pnpm-lock.yaml | 기존 버전 유지, Zustand·검증·에셋 처리 도구 추가 |

## 실행과 검증

Node 24 계열, pnpm 11.25.0을 사용한다.

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm exec tsc --project tsconfig.tests.json --noEmit
pnpm test
pnpm build
pnpm test:e2e
```

기본 REST/WS 개발 대상은 `http://127.0.0.1:8080`이다. 기존 `API_PROXY_TARGET` 환경변수로 변경한다. 로그인은 기존 안내대로 localhost 호스트와 실제 백엔드 OAuth/Origin 설정을 사용한다. 프론트에서 임의 개발 계정을 만들거나 인증을 우회하지 않는다.

E2E는 Edge가 설치된 PC에서 127.0.0.1:5197을 사용한다. `Browser plugin not available`이므로 Playwright를 사용했다. 테스트가 HTTP/WS를 가로채는 것은 테스트 프로세스 안에서만 이뤄지며 운영 앱에는 목업 로그인/목업 소켓 경로가 없다. 보고서·스크린샷은 OS 임시 폴더 또는 `QA_ARTIFACT_DIR`에 저장한다. 성능 비교는 `RUN_ASSET_QA=1`, `ASSET_QA_LABEL`로 별도 실행하며 일반 회귀에서 의도적으로 제외한다.

최종 확인: 앱/테스트 TypeScript 검사, 잠금 파일 고정 설치, 단위 테스트 7파일 37개, production build 통과. Edge 1920×1080 기능 E2E 6개 통과(별도 자산 비교 1개는 일반 실행에서 의도적 제외). 인증 복원/종료, 내 프로필, 단일 연결·재접속, 채팅 거절/초안·입력 잠금, 맵 불일치, 미설정 테이블 차단, 포인터 선택·서버 착석/퇴장·원격 전신·시점·LOD·High 전환을 확인했다.

## 소켓 소유와 상태

```text
기존 인증 세션
  → ParkRuntimeProvider / ParkRuntime (앱 내 한 인스턴스)
    → SharedSocket 하나
      → 채널·WORLD_MOVE·채팅·테이블 요청
      → 수신 DTO 검증 → 표시 상태·아바타 보간 버퍼
    → 기존 HUD : messages / sendChat / 채널·계정 표시
    → WorldCanvas : 위치·캐릭터·테이블 클릭/E·착석 시점
```

실제 WebSocket 생성자는 src/park/runtime/runtime.ts 한 곳에만 있다. StrictMode의 효과 재실행은 참조 수와 지연 정리로 중복 연결을 만들지 않는다. 연결 중 요청은 합치고 이전 소켓의 onclose 이전에 새 연결을 열지 않는다. 재접속마다 새 접속권을 받는다. 채팅·착석 요청은 자동 재전송하지 않는다.

기존 계약의 `POST /api/v1/auth/websocket-ticket` → `/ws/tables?ticket=…`를 사용한다. Refresh 쿠키는 기존 인증 모듈에서만 다루며 접속권 발급에는 Access Bearer와 credentials: omit을 사용한다. 토큰·접속권·전체 연결 URL을 로그에 기록하지 않는다. 배포 프록시에서도 ticket 쿼리/Authorization 로그 수집을 제외해야 한다.

서버의 4401/4403은 인증 정보를 정리하고 기존 로그인 화면으로 돌아간다. 1008 중복 연결 거절에는 자동 재접속하지 않는다. 일시적 소켓 단절은 최대 5회 지연 재접속한다. 새 연결/채널에서는 버전·아바타·채팅·좌석 상태를 초기화한다. 게임의 private payload는 이 공원/로비 이관 범위에서 저장하거나 표시하지 않는다.

## 실제 서버에 연결할 때 필요한 자료

### 서버 테이블과 3D 위치

`GET /api/v1/tables?channelId=…`는 서버 ID를 주지만 위치는 주지 않는다. 목록 순서나 UUID로 3D 위치를 추정하지 않는다. 기본 public/park-bindings.json은 빈 배열이며 미설정 테이블 클릭 시 안내만 표시하고 참가 요청을 보내지 않는다.

실제 서버의 채널·tableId와 맵 앵커를 확인한 뒤 아래 **프론트 배포 설정**에 넣는다. 새 서버 DTO나 API를 제안한 형식이 아니다.

```json
{
  "bindings": [
    { "channelId": "<실제 채널 ID>", "tableId": "<서버 목록의 실제 ID>", "anchorId": "table-1" }
  ]
}
```

앵커 목록/좌표는 src/config/world.ts의 TABLES다. 서버 담당과 동일 배치로 확인해야 한다. 존재하지 않는 앵커, 채널 내 중복 대응, 서버 목록에 없는 ID는 사용하지 않는다. 관전 거리용 서버 설정은 기존 BE 담당 범위이며 이 브랜치가 수정하지 않는다.

TABLE_JOIN에는 tableId만 보낸다. 서버 TABLE_STATE의 seatNumber를 받은 뒤에만 착석·본인 1인칭·타인 전신 표시로 전환한다. TABLE_LEAVE 확인 뒤 3인칭으로 복귀한다. 테이블 공개 상태를 수신한 참가자/관전자는 착석 아바타를 표시할 수 있다. **WORLD_STATE 자체에는 전역 착석 정보가 없으므로, 공개 테이블 상태를 받지 못한 모든 원격 관찰자에게도 동일 착석 상태를 전파하는 계약은 추가 확인이 필요하다.**

### 프로필·잔액·캐릭터

최신 dev의 docs/user-me.md에 따라 `GET /api/v1/users/me`를 Access Bearer로 조회한다. userId(양의 정수)·nickname·characterGender(MALE/FEMALE)를 검증하고, CONNECTED.userId가 같은 계정인지 확인한 뒤 본인 HUD 닉네임과 3D 남녀 모델에 연결한다. 401은 기존 Refresh를 한 번 시도하고, 재차 401 또는 403이면 로그인 화면으로 복귀한다. 재접속 때 최신 프로필을 다시 조회한다.

이 응답에는 잔액이 없어 `—냥`을 유지한다. 타인 프로필도 WORLD_STATE/채팅에 없으므로 임의 닉네임·성별을 추정하지 않고 기본 모델과 축약 사용자 표식을 사용한다. 승인된 공개 프로필/지갑 계약이 준비되면 `src/network/profileBridge.ts`의 `setDisplayProfiles(publicProfiles, ownAccount)`에 표시 자료를 공급한다. character는 내부 에셋 키 man/girl이며 서버 DTO를 새로 제안한 것이 아니다. 외형 equipment의 imageKey→3D 매핑도 미확정이므로 임의 상품 모델을 표시하지 않는다.

### 맵과 시간

현재 가져온 지형의 승인 bake 지문은 src/config/mapVersion.ts의 `544bc6fa…`다. 다른 WORLD_STATE.mapVersion이면 이동·착석을 차단한다. 새 지형을 FE에서 임의 승인하지 않는다. serverTime/worldEpochMs/dayDurationMs 계약은 아직 없어 낮/밤·광고·물 표현은 **연출용 로컬 시계**로 진행한다. 서버 시계 동기화 완료가 아니다.

## 이번 범위와 남은 확인

- 연결 범위: 기존 인증 세션 재사용, 채널 선택/인원, 서버 위치·보간·이동 입력, 채팅 송수신, 장면/남녀 리그 표시, 테이블 클릭/E·공개 대기 상태·서버 착석/퇴장·시점, 그래픽/계측 패널.
- 제외 범위: Colyseus/Node 서버, 기존 게스트 로그인, 별도 채팅 소켓, 게임별 플레이 입력/준비/시작·정산·보상, 미확정 시설 이용 명령, 실제 미니게임/AI/상점 구현. 장면의 카트·운동기구·망원경 외형과 서버 이용 기능은 구분한다.
- 기존 HUD의 M(지도)/G(감정표현) 안내 디자인은 보존했지만 해당 기능을 이번 이관에서 새로 구현하지 않았다.
- 검증은 로컬 계약 대역 기준이다. 실제 OAuth 공급자·팀 BE 서버·DB·배포 프록시 통합 검증은 미수행이다. 테스트 대역의 테이블 매핑을 실제 배포 설정으로 넣지 않는다.
- 현재 빌드는 큰 WorldCanvas 청크 경고가 남는다. Three.Clock 폐기 예정 경고와 기존 셰이더 정밀도 경고가 관측되었다. 런타임 JS 오류는 브라우저 회귀에서 확인되지 않았다.
- 에셋의 전수 최적화 완료·특정 FPS·운영 수용 인원을 주장하지 않는다. 별도 ASSET_OPTIMIZATION_STATUS.md를 따른다.

실제 BE 확인·배치/공개 프로필/잔액 계약·에셋 최적화 잔여 검토를 위해 MR은 Draft로 제출한다. dev에 직접 병합하지 않는다.
