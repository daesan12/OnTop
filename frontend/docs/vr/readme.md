# OnTop Quest VR

- 브랜치: `feat/quest-vr`
- 작업 위치: `C:\Users\SSAFY\Desktop\OnTop\quest-vr`
- 기준: `origin/dev@12bc82c1` (2026-11-04)
- 현재 범위: 공원 이동·달리기·A 점프·스냅 회전, 돌탑 점프맵의 VR 안내·결과·랭킹.
- 다음 목표: Quest VR 요리사 + PC 서빙 담당의 꼬치왕 협동 연결 검수.

## 실행

Node 24와 lockfile에 맞는 의존성, 로그인/REST/WS가 준비된 테스트 백엔드가 필요합니다. 현재 PC는 설치된 lockfile이 일치하는 기존 `frontend/node_modules`를 junction으로 재사용합니다. 새 환경은 `frontend`에서 `pnpm install --frozen-lockfile`로 준비합니다.

```powershell
Set-Location 'C:\Users\SSAFY\Desktop\OnTop\quest-vr\frontend'
.\scripts\start-park-xr.ps1 -ConnectQuest -AdbPath 'C:\Users\SSAFY\Desktop\platform-tools\adb.exe'
```

Quest 기본 브라우저에서 **http://localhost:5288/park** 접속 → 로그인·채널 입장 → **공원 VR 시작**.

백엔드 기본값은 `http://127.0.0.1:8080`입니다. `-ApiProxyTarget`으로 개발 API를 지정할 수 있지만 localhost 로그인·쿠키·허용 Origin·WS 준비가 먼저 필요합니다. 서버가 이미 켜져 있으면 `-ConnectQuestOnly`로 USB만 연결합니다. 실제 개발 사이트는 https://dev.on-top.world/park 이며 이 로컬 변경은 아직 배포하지 않았습니다.

## 조작

왼쪽 스틱 이동 / 왼손 그립 달리기 / 오른손 A 점프 / 오른쪽 스틱 30도 회전 / X 돌탑 안내 / 레이저+트리거 패널 선택 / B 공원 VR 종료.

## 검증 명령

`frontend`에서 실행합니다.

```powershell
node node_modules/typescript/bin/tsc --project tsconfig.park-xr.json --noEmit
node node_modules/vitest/vitest.mjs run tests/unit/parkXRMovement.test.ts tests/unit/jumpmapXR.test.ts --maxWorkers=4
node node_modules/@playwright/test/cli.js test --config playwright.park-xr.config.ts
```

브라우저 검증은 5289 포트의 모의 XR/서버 상태를 사용합니다. 실제 Quest·로그인·서버 정산 검수와 구분합니다. 실행 포트는 strictPort이므로 다른 서버를 종료하거나 포트를 자동 변경하지 않습니다.

## 문서

- [개발자 가이드 — 개발자 모드부터 실행·디버깅까지](QUEST2_DEVELOPER_GUIDE.md)
- [다른 플레이어용 접속 가이드](QUEST2_PLAYER_GUIDE.md)
- [구현·이관·검증 기록과 남은 Quest 검수](../PARK_JUMPMAP_VR.md)

원본 `park-jumpmap-vr-20261104` 및 초기 `quest-locomotion-poc` 작업은 보존합니다. 새 작업은 이 위치에서 진행합니다.

## 작업·원격 반영 규칙

작업 시작 전마다 `git fetch origin`을 실행하고 최신 `origin/dev`가 VR 브랜치 이력에 포함되도록 반영합니다. 미커밋 변경은 보존하고 충돌 해결 후 영향받는 동작을 재검증합니다.

2026-11-04 사용자 승인으로 VR 코드·문서를 **feat/quest-vr에 커밋·푸시**합니다. dev/master에는 머지하지 않습니다. MR 생성·개발/운영 배포는 별도 요청 범위이며 GitLab 브랜치 업로드만으로 사이트에 배포되지는 않습니다.
