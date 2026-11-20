# 무료 루돌프 썰매 · 구현 및 검수 기록

- 작업 브랜치: `feat/park-winter-theme`. 시작 및 푸시 전 fetch 후 최신 `origin/dev@8a6ace58e5eeb1ff2dd2d08d100cf4f3ff2d7055` 포함과 원격 겨울 브랜치의 중복 변경·충돌 없음을 확인했다. 다른 worktree 변경은 보존했다.
- 담당 경로: FE `features/winter/sleigh/`, BE `world/winter/SleighRoute`. 참고 PNG에 맞춰 붉은 썰매·금색 러너와 테두리·선물 자루·세 쌍의 순록·빛나는 루돌프 코를 직접 메시로 제작했다.

## 이용 방법과 연결 계약

- 입구 오른쪽 썰매 옆(이용 중심 x=2, z=86)에서 E로 무료 탑승한다. 채널별 한 번에 한 명, 고정 항로 40초 한 바퀴다. 최고 속도는 약 28m/s이며 상승·감속 착륙 구간을 두고 순항은 높이 약 65~76m에서 진행한다. 조종·이동·점프가 항로를 바꾸지 않는다.
- 기존 `WORLD_FACILITY_CATALOG`에 `{facilityId:"winter-sleigh", kind:"SLEIGH", seats:[pose], center, radius, heightTolerance, exit}`를 추가한다. 요청은 `WORLD_FACILITY_USE {facilityId:"winter-sleigh", seatIndex:0}`다. 티켓·재화·지갑 API를 호출하지 않는다.
- 공통 시설의 거리·높이·좌석 점유·활동 중복 검사, 요청 멱등성, 연결 종료/채널 이탈 정리를 재사용한다. 채널이 다르면 좌석 점유도 독립적이다. 승인된 `WORLD_FACILITY_STATE`의 leaseId/startedAt은 도착까지 유지된다.
- 생성 맵 `data.interactions.sleighs[0]`의 `route {durationMs, points:[{x,y,z}]}`에는 401개 표본이 들어간다. FE와 Java가 같은 표본을 보간한다. 서버 world tick이 실제 held 위치를 옮겨 `WORLD_STATE`를 방송하며 클라이언트 좌표·조종 입력은 사용하지 않는다.
- 40초 뒤 서버가 exit/접근 위치의 canStand를 확인해 자동 하차·점유 해제·시설/월드 상태를 방송한다. 일시적으로 하차가 불가능하면 안전 위치를 재확인한다. 중도 복귀 버튼은 기존 `WORLD_FACILITY_RELEASE {leaseId}`를 통해 같은 지상 검사를 사용한다.
- 카메라는 항로 바깥에서 공원 안쪽을 보며 따라간다. 탑승 중 눈싸움 HUD를 숨기고 비행 진행/남은 시간/중도 복귀를 표시한다.
- 공통 연결 변경: 시설 종류/카탈로그, TableHub 비행 tick, 생성 맵 조립, E 상호작용, 좌석 아바타·카메라와 ParkPage HUD. DB/Flyway·gameCode·경기/정산·인프라 변경은 없다.

## 실행 및 검증

- 맵 버전: `72e406f8894dd89470f22221fa59bd971ed953a800f6f4d980260443d19d73ad`. 항로 변경 시 frontend에서 `node scripts/generate-renewal-park.mjs` 실행 후 로컬 BE를 재시작한다.
- FE: `node node_modules/vite/bin/vite.js --config vite.stone-rumble-pagoda.config.ts --mode park-renewal-integration`, 포트 5501.
- BE: `STONE_RUMBLE_RENEWAL=true`, 테스트 클래스패스의 `com.ssafy.ontop.demo.StoneRumbleParkApplication`, 포트 19191. 기존 겨울 테스트 서버만 재시작했고 두 서버는 실행 상태로 유지한다. PID/로그는 무시되는 `backend/.gradle/winter-playtest/`에 있다.
- 확인 링크: `http://127.0.0.1:5501/stone-rumble-park.html?role=1`. role 1~8은 별도 테스트 계정이다. 실제 공원/WS 서버와 메모리 회원·지갑 fixture를 사용한다. 외부 OAuth/운영 DB는 연결하지 않았다. DB 의존 부가 API의 기존 503 제한은 동일하다.
- 외관 프리뷰 `http://127.0.0.1:5300/park-renewal.html?winter=1`에는 정박 모델만 표시된다. 서버 탑승 검수는 5501 링크에서 진행한다.
- Chrome/Playwright: 실제 E 탑승 → 상승/순항 → 40초 자동 도착 → 보행 복귀, 다른 계정의 비행 위치 수신, WASD/점프 중 항로 유지, 중도 지상 복귀, 1440×900/390×844 표시를 통과했다. JS/프레임워크 실행 오류는 없었다. VR 헤드셋 검수는 하지 않았다.
- FE: typecheck, 썰매/겨울 단위 테스트 6개, 리뉴얼 활성화 프로덕션 빌드 통과. BE: 썰매/기존 시설/오리배 13개 및 실제 WebSocket 시설/눈싸움 9개 테스트와 최종 컴파일 통과. 기존 Three CJS·대형 청크·Java deprecation/unchecked 경고는 남는다. 맵 전수 탐색 및 자전거·킥보드 주행 테스트는 실행하지 않았다.
- 커밋·작업 브랜치 푸시만 진행하며 사용자 지시에 따라 MR·머지·배포·브랜치 삭제는 하지 않는다. Jenkinsfile은 dev 전용이고 Jenkins 접속/빌드 조회 도구가 없어 원격 빌드 상태는 확인하지 못했다.
