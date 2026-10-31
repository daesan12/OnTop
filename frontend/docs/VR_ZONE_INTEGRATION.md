# 온탑 꼬치왕 · 공원 통합

## 현재 기준

- 작업 브랜치: `feat/ontop-skewer-pc-park-20261031`, 통합 기준 `origin/dev@5d34a5e0`(최초 efd5e9d3 이후 문서 전용 업데이트 반영).
- 생성 맵: `park / schemaVersion 2 / c05d8ada8b12d4e509f50c7e807949bd976811e1c69a628232520b88c15a0d07`.
- server-map SHA256: `81d9a70a1b28751f3dc8708bb0c21fc5cae17604263f1f6ae10f4e2c6d3aeafb`.
- map:check는 18개 테이블·536개 이동 장애물의 생성물을 검증한다. 기존 Jenkins #211 로그에서도 FE/BE의 같은 맵 식별자를 확인했다. 병합 직전 원격과 충돌을 다시 확인한다.
- 이전 로컬 작업 53개 파일은 별도 시각화 폴더의 `skewer-before-integration-efd5e9d3`에 SHA256·패치와 함께 백업했다. 원본 작업 위치의 미커밋 변경은 보존한다.

## 게임 경로와 이용료

VR 한옥 입구 → E 또는 상호작용 버튼 → 3칸 게임 목록 → 온탑 꼬치왕 → VR/일반 방식 선택 → 전용 가이드 → 이용권 구매 → 3·2·1·시작 → 주문 조립 → 완료 → 중앙 결과 팝업 → 재도전 또는 목록·공원 복귀.

- 1인 게임이며 게임 목록은 플레이 가능한 1칸과 준비 중 2칸이다. 기존 테이블 착석·판돈·승자 정산을 사용하지 않는다.
- 한 판 이용료는 서버 고정 **10냥**이다. 새 판마다 구매하며 목록·선택·준비·다음 주문·일시정지·결과 닫기는 무료다. 점수 보상·환불·랭킹은 없다.
- 공원에서는 기본적으로 `ServerVrAdmission` → 공통 `parkRuntime.requestJSON` → `POST /api/v1/minigames/skewer/admissions`를 사용한다. 인증·갱신·REST/WS·지갑 조회는 기존 공원 경로를 따른다.
- 자세한 계약은 `../../docs/skewer-admissions.md`를 참고한다. `wallet_transactions`가 영수증과 멱등성을 보존하므로 새 DB 테이블·Flyway 파일은 없다. **V133은 팀원 예약 번호이며 이 작업에서 사용하지 않는다. V134 제안도 철회했으며 생성·예약하지 않는다.**
- 응답 유실 시 사용자별 sessionStorage에 저장한 같은 키로 재확인한다. 성공 시 기존 지갑 갱신 이벤트로 서버 잔액을 다시 조회한다. 서버 오류를 테스트 잔액으로 대체하지 않는다.
- 계정·채널이 바뀌면 이전 게임 UI를 닫고 늦은 구매 응답을 무시한다. 이미 시작한 판의 진행은 탭 메모리이며 새로고침·재접속에 따른 게임 상태 복원이나 환불을 보장하지 않는다. 불명확한 이용권 요청 키는 같은 사용자 재입장에서 재확인한다.
- VR은 XR 세션 연결이 성공한 후 이용권을 구매한다. 지원하지 않는 브라우저에서 VR 시작 실패 시 차감 요청을 보내지 않는다. 실기기 높이·도달 거리·양손 판정·성능은 Quest 2 연결 후 별도 검수한다.

## 결과와 이미지

붕어빵과 동일한 공통 PaperPopup에 음식 이미지, 완성/놓친 주문, 점수·성공률·인사 보너스와 재도전/게임 목록/설명서를 표시한다. 팝업의 포커스 순환·ESC, 뒤 조리대의 inert 처리로 실수 입력을 막는다. 종료된 판은 포기 확인 없이 목록으로 돌아간다.

이미지는 기존 승인된 로우폴리 3종을 재사용한다. VR 이미지는 사용자가 확정한 **컨트롤러를 비스듬히 잡은 첫 손바닥 수정본**이다. 생성·수정 프롬프트와 출처는 `src/features/vrZone/art/generation.json`에 보존했다. 준비 화면은 선택한 VR 또는 PC 방식의 조작만 안내한다.

## 공통 변경

- FE: parkInteraction 진입 대상, ParkPage의 호스트, ParkScene 게임 중 중지, SpringParkRuntime의 새 POST 허용 경로.
- BE: WalletTransaction 이용료 생성, WalletTransactionRepository 영수증/요청 빈도 조회, MinigamePreflightFilter의 해당 endpoint OPTIONS.
- 게임 전용: `features/skewer`, `features/vrZone`, `game/skewer`, 대응 테스트·실행 스크립트·문서.
- 기존 붕어빵·공통 PaperPopup·맵 생성물·공통 WS 프로토콜은 변경하지 않는다. OpenAPI·보안 매핑 회귀 목록은 신규 REST endpoint를 추가하고 정적 명세를 재생성한다.

## 실행

frontend 폴더에서 실행한다. 기본 API 주소는 로컬 8080이다. 실제 로그인과 해당 FE Origin을 허용하는 백엔드가 필요하며 로그인을 우회하지 않는다.

```powershell
.\scripts\start-skewer-park.ps1
# 다른 실제 백엔드: -ApiProxyTarget에 주소 지정
# 테스트 잔액만 쓰는 개발 실행: -UseTestAdmission (DEV에서만 적용)
# Quest USB 연결: -ConnectQuest 또는 실행 중 서버에 -ConnectQuestOnly
```

실제 공원: `http://localhost:5202/park`. Quest 연결 시 ADB reverse 후 헤드셋에서도 같은 localhost URL을 연다. ADB는 PATH/Android SDK에서 찾고 별도 설치·승인 없이 연결을 가정하지 않는다.

독립 미리보기는 `node node_modules/vite/bin/vite.js --config vite.skewer.config.ts` 후 `http://127.0.0.1:5187/skewer.html`(무료 연습), `/vr-zone.html`(테스트 이용권)이다. 이 개발 진입점을 서비스 과금 경계로 사용하지 않는다.

## 검증 범위

- 단위: 규칙·음식 표면·안내·입장 상태, 서버 이용권의 응답 유실·저장 실패·잔액 부족·계정 변경, 최신 VR 입구의 보행 가능 구간과 테이블 상호작용 반경 분리.
- API: 실제 JWT/보안 필터·본인 식별·중복 키·위조 본문 거절·CORS·no-store.
- MySQL 8.4: 별도 `ontop_skewer_test_` DB에서 기존 Flyway 전체 적용, 같은/다른 키 동시 구매, 예약금 보존, 계정 분리, 원장 실패 시 차감 롤백. 실제 회원 DB로 테스트 데이터를 만들지 않는다.
- 브라우저: `node node_modules/@playwright/test/cli.js test --config playwright.vr-zone.config.ts`. 전용 5194 포트, 생성 맵, 1440×900/390×844. 실제 서버 이용료 클라이언트를 사용하며 HTTP/WS 응답만 fixture로 대체한다. 응답 유실 재시도, 두 판 100→90→80, 지갑 HUD 갱신, 조립·인사·완료·결과·재도전·무료 복귀, 게임 중 이동 차단과 복귀 후 이동·채팅 충돌을 확인한다.
- 자동 fixture 검증과 `dev.on-top.world`의 실제 로그인·지갑·한 판 검증을 구분한다. 실제 개발 서버 검증은 신규 API의 Jenkins 배포 후 진행한다. Quest 실기기는 이번 PC 검수의 완료 조건에 포함하지 않는다.

최종 사전 검증: FE 1,684개 통과·기존 6개 skip, BE 325 suites/2,578개 검사·실패 0·기존 9개 skip, 별도 MySQL 8.4 5개 통과. 생성 맵 BE 6개 테스트 클래스는 skip 없이 실행됐으며 전달본 결과 검사도 통과했다. 실제 입장 클라이언트의 공원 두 판 E2E와 타입·공원 빌드·실행 스크립트 구문 검사가 통과했다. 실제 개발 서버의 새 API 검증은 Jenkins 반영 뒤 수행한다.
