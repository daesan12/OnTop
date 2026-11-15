# 하늘언덕 열기구 프리뷰

이 프리뷰는 `origin/dev`에 반영된 220m 공원을 사용한다.

`frontend`에서 프로젝트 의존성을 설치하고 실행한다.

```sh
pnpm exec vite --config vite.balloon-preview.config.ts
```

[로컬 프리뷰](http://127.0.0.1:5226/balloon-preview.html)는 로컬 리뉴얼 모드로 dev의 220m 맵과 충돌 데이터를 읽는다. 승강장 아래에서 시작한다. W 또는 위 방향키로 계단을 오른 후 E를 누른다. 기본 프리뷰에서는 혼자 탑승하고 출발하기를 누르면 바로 이륙한다. 조종석에서 WASD 또는 방향키로 이동하고 Space와 Shift로 상승·하강한다. 동승석은 드래그나 좌우 화살표로 시점을 돌린다.

- `?guests=3`은 네 번째 자리 탑승을, `?guests=4`는 만석을 보여준다.
- `?coins=0`은 잔액 부족을, `?role=passenger`는 동승과 대기 시간 종료 후 출발을 보여준다.
- 비행 중 '조종자 이탈 확인'을 누르면 승강장 자동 복귀를 확인할 수 있다.
- 가상 요금은 100냥, 최대 대기 시간은 12초, 운항 시간은 90초, 착지 후 제거 시간은 5초다. 출발 시 프리뷰의 가상 잔액에서 차감된다.
- 비행 구역은 실제 공원 외곽선에서 기체 여유 폭을 뺀 범위다. 호수·급경사·시설물처럼 안전한 하차 지점을 찾을 수 없는 곳에서 낮아지면 승강장으로 복귀한다.

승강장 E 진입은 생성된 맵의 `balloon` 접근점을 사용한다. 기체 정박 위치는 실제 승강장 모델 배치와 공유한다. 독립 프리뷰에서 최대 4인 탑승과 비행 경계, 착지를 확인할 수 있다.

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

[로컬 공원](http://localhost:5173/park)에 로그인한 뒤 하늘언덕 열기구 승강장으로 가서 E를 누른다. **100냥 내고 탑승하기**를 누르면 로컬 DB의 지갑에서 100냥이 차감되고, 결제가 확인되면 혼자 바로 이륙한다. 비행 좌표는 이 브라우저의 장면에서만 움직인다. 하차 연출이 끝나면 서버가 유지하던 승강장 위치에서 공원 조작이 돌아온다. 로컬 DB에 해당 제공자의 회원 프로필이 없으면 온보딩이 필요하다.

## 개발 배포

`dev.on-top.world`의 220m 공원이 활성화된 빌드에서 같은 1인 흐름을 사용한다. `POST /api/v1/world/balloon/tickets`는 서버가 확인한 승강장 위치와 사용 가능 잔액을 검증한다. 응답을 놓치면 같은 탭에서 다시 시도할 수 있다. 지갑 원장의 `BALLOON_RIDE_FEE`가 같은 요청의 중복 차감을 막는다. 서버 좌석 공유와 비행 동기화는 별도 작업 범위다.
