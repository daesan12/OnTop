# 하늘언덕 열기구 프리뷰

최신 기준은 `origin/dev`의 `1fefc795`다. 이 커밋에는 `feat/park-renewal-restart`의 220m 공원이 포함되어 있다.

`frontend`에서 프로젝트 의존성을 설치하고 실행한다.

```sh
pnpm exec vite --config vite.balloon-preview.config.ts
```

[로컬 프리뷰](http://127.0.0.1:5226/balloon-preview.html)는 로컬 리뉴얼 모드로 dev의 220m 맵과 충돌 데이터를 읽는다. 승강장 아래에서 시작한다. W 또는 위 방향키로 계단을 오른 후 E를 누른다. 기본 프리뷰에서는 혼자 탑승하고 출발하기를 누르면 바로 이륙한다. 조종석에서 WASD 또는 방향키로 이동하고 Space와 Shift로 상승·하강한다. 동승석은 드래그나 좌우 화살표로 시점을 돌린다.

- `?guests=3`은 네 번째 자리 탑승을, `?guests=4`는 만석을 보여준다.
- `?coins=0`은 잔액 부족을, `?role=passenger`는 동승과 대기 시간 종료 후 출발을 보여준다.
- 비행 중 '조종자 이탈 확인'을 누르면 승강장 자동 복귀를 확인할 수 있다.
- 가상 요금은 10냥, 최대 대기 시간은 12초, 운항 시간은 90초, 착지 후 제거 시간은 5초다. 요금은 출발 시 가상 잔액에서 차감된다.
- 비행 구역은 실제 공원 외곽선에서 기체 여유 폭을 뺀 범위다. 호수·급경사·시설물처럼 안전한 하차 지점을 찾을 수 없는 곳에서 낮아지면 승강장으로 복귀한다.

승강장 E 진입은 생성된 맵의 `balloon` 접근점을 사용한다. 기체 정박 위치는 실제 승강장 모델 배치와 공유한다. 비행 수평 경계와 착지는 로컬에서 검증하며 운영 공원의 E 진입, 서버 좌석 예약·위치 동기화 및 실제 지갑 차감은 통합 단계에 남아 있다.

## 로그인한 캐릭터로 로컬 220m 공원에서 체험

로컬 OAuth와 로컬 MySQL이 준비되어 있어야 한다. 저장소 루트의 기존 `.env.frontend-test` 설정 형식은 [프런트엔드 연동 가이드](../../../../docs/frontend-integration.md)의 두 계정 로컬 실행 절차를 따른다. 프런트 주소와 OAuth 반환 주소는 각각 `http://localhost:5173`, `http://localhost:5173/auth/callback`으로 맞춘다.

저장소 루트의 PowerShell에서 같은 220m 맵으로 기존 로컬 백엔드를 실행한다.

```powershell
$env:WORLD_MAP_SOURCE = 'GENERATED'
$env:WORLD_MAP_JSON_PATH = (Resolve-Path 'frontend/generated/park-renewal/server-map.json').Path
$env:WORLD_MAP_MANIFEST_PATH = (Resolve-Path 'frontend/generated/park-renewal/manifest.json').Path
$env:WORLD_MAP_REQUIRE_MATCH = 'true'
.\scripts\start-frontend-test.ps1
```

별도 PowerShell의 `frontend`에서 로컬 공원을 실행한다.

```powershell
$env:VITE_LOCAL_BALLOON = '1'
pnpm exec vite --mode park-renewal-integration --host localhost --port 5173 --strictPort
```

[로컬 공원](http://localhost:5173/park)에 로그인한 뒤 하늘언덕 열기구 승강장으로 가서 E를 누른다. 체험은 1인 출발, 무료이며 공원 세션의 캐릭터와 외형을 그대로 표시한다. 비행 좌표는 이 브라우저의 장면에서만 움직인다. 하차 연출이 끝나면 서버가 유지하던 승강장 위치에서 공원 조작이 돌아온다. 로컬 DB에 해당 제공자의 회원 프로필이 없으면 온보딩이 필요하다.

## 개발 배포

`dev.on-top.world`의 220m 공원이 활성화된 빌드에서는 승강장의 E 상호작용에 1인 무료 개발 체험이 표시된다. 별도 배포 환경변수는 필요하지 않다. 비행은 브라우저에서만 시뮬레이션하며 실제 엽전과 서버 캐릭터 좌표는 기존 공원 세션이 관리한다.
