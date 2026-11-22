# 겨울 통합: QA 8·10·11

## 기준과 보존 범위

- 작업 브랜치 feat/winter-community-letters-snowmen, 통합 MR !670 → dev. dev 머지는 보류한다.
- 최신 dev 90389d8947057a0897b6462a86b282d0e5986392가 통합 시작 때 이미 포함돼 있었다.
- 최신 11번 f0691040183ad08345adfe6d68b035808906f6a7를 기준으로 삼았다. 미커밋 작업 없이 시작했다.
  12m 트리·크리스마스 에셋·하네스 고삐·편지 UI·50개 점등·눈사람 제작 제거 상태를 보존한다.
  dev의 12번 펜던트/유리 전시함도 그대로 유지한다.
- 10번 !667의 51df2294af5cdea04ba585166078e71cfa005e6c를 이력 보존 병합했다. 충돌 없음.
- 8번 !665의 1c246dc26d1bcd5d870c3881213b26d9c63bc7a8도 이력 보존 병합했다.
  generated/park-renewal/server-map.json과 manifest.json만 충돌했고, 양쪽 소스를 유지한 채 재생성했다.
  공유 브랜치 강제 푸시·인프라 직접 수정·다른 worktree 변경은 하지 않는다.

## 결과와 연결 계약

- 8: 출발/도착 완화 구간을 각 8%로 줄인다. 총 40초와 공간 동선·승강장·무료 시설/복귀는 유지한다.
  서버와 FE는 새 시간별 401개 항로 표본을 공유하며 하단 HUD를 작게 표시한다.
- 10: 더하기 빼기·가위바위보 룰렛의 일일 판 수 차단을 제거한다. dailyPlays=0은 무제한 계약이다.
  지갑 잠금·참가비/지급 멱등성·룰렛 진행 중 한 판 제한·기존 배당과 일반 미니게임의 1,000냥 일일 보상 상한과 별개로 동작하는 계약은 유지한다.
  playedToday는 계속 응답하며 안내를 횟수 무제한으로 통일한다. 호출 빈도 제한을 추가한 변경은 아니다.
- 11: 트리 E → 2D 장식 선택 → 크리스마스 편지지 → 익명/닉네임 저장 → 실제 트리 장식/50개 점등.
  트리 위치·활동 권한, UUID 멱등성·15초 작성 간격·익명 보호를 유지한다. 공동 눈사람 제작은 없다.
- 게임별 FE/BE 경로를 유지한다. 신규 gameCode·새 공통 게임 프레임워크·지갑/정산 경로 변경은 없다.

## DB와 생성 맵

- 기존 V183__create_winter_community.sql 1개를 그대로 보존한다. 위치 backend/src/main/resources/db/migration/.
  winter_community_board·winter_tree_messages 두 테이블이며 눈사람 테이블은 없다. 새 SQL·V번호는 만들지 않았다.
- 원격 dev 파일 기준 V182까지이며, V183은 기존 사용자 지정이다. 같은 브랜치의 11번 최신 파일과 바이트가 같다.
  별도 팀 예약과 실제 DB 적용 이력은 직접 확인하지 못했으므로 배포 담당자가 충돌/이력을 재확인해야 한다.
- 오락실 countPlays에 쓰는 ix_plus_minus_user_date와 ix_rps_roulette_user_date는 각각 V143/V136에 있다.
  실제 적용·EXPLAIN·운영 호출 제한/이상 거래 알림은 미확인이다.
- 최종 mapVersion 79683f52eb9c84fef46efc11021640114d7236742019270a48839c645e4c6ccd.
  11번 f0691040의 생성 맵 대비 항로 표본과 관련 해시만 달라진다. 트리·충돌·장식 좌표는 유지한다.
  최종 산출물 server-map.json·manifest.json·park-bindings.json은 같은 커밋으로 사용해야 한다.

## 검증과 남은 배포 확인

- TypeScript --noEmit과 FE 11개 파일 63개 테스트 통과. sleigh·plusMinus·rpsRoulette·winterCommunity·winter·
  winterMotion·christmasAssets·christmasAssetLifecycle·parkVisualPreservation·horrorRules·horrorDressing을 실행했다.
  맵 전수 탐색·자전거/킥보드 주행 테스트는 추가하거나 실행하지 않았다.
- BE 10개 클래스 59개 테스트 통과. 최신 생성 맵을 실제 읽는 SleighFacilityTests, 두 오락실 ServiceTests,
  TableHubWinterCommunity·JdbcWinterCommunityStore·WinterCommunityService·WinterCommunityPhysics·
  WinterSnowPickupPhysics·PagodaThrowLanding·SnowballService를 실행했다.
- VITE_PARK_RENEWAL_ENABLED=true park-integration 프로덕션 빌드 통과. 빌드의 server-map.json·park-bindings.json이
  소스 산출물과 같다. manifest는 FE 배포 파일로 복사되지 않으며 BE용 불변 맵 디렉터리에 별도 동반해야 한다.
- 맵 재생성 전후 server-map.json·manifest.json·park-bindings.json 해시가 동일하다.
  f0691040 대비 최신 편지 UI·크리스마스 에셋·고삐·V183 파일의 바이트가 변하지 않았다.
  community 에셋 11개/GLB 5개 무결성 검증 통과. 새 provider 호출은 없다.
- Browser 플러그인 부재로 기존 Playwright/Chrome 도구를 재사용했다. 같은 통합 FE와 공원 실제 3D 렌더에서
  12m 트리의 편지/장식 49개·조명 꺼짐 → 50개·별/전구 점등을 확인했다. 익명/닉네임 작성·UUID 재시도·
  Tab/Escape·초점 복귀와 1280×850·390×844·844×390·320×568 화면 경계를 검증했다.
- 같은 FE에서 썰매 HUD의 3개 화면 크기/작은 높이/복귀 명령·종료와 두 오락실의 기존 제한 초과 플레이
  (룰렛 17번째, 더하기 빼기 13번째) 및 횟수 무제한 선택 화면을 확인했다. 앱 오류 0개.
  이 화면 검증은 API/preview fixture이고 실제 서버 정산은 위 BE 테스트로 구분한다.
- 전용 브라우저 프로필·서버 5546을 즉시 종료하고 잔여 프로세스와 리스너 0개를 확인했다.
- MySQL 8.4 전용 테스트 DB 환경 변수가 없어 실제 DB 적용 테스트는 실행하지 않았다. 관련 테스트는 컴파일됐다.
  실제 운영 인증·실서버 다인 공원 한 바퀴·운영 DB 재시작 복원·VR·Jenkins 성공은 미확인이다.

## MR와 담당자 인계

검증·푸시 후 !670의 제목/설명을 8·10·11 통합 범위로 갱신하고 !665·!667은 대체됨으로 닫는다.
기존 브랜치는 최종 dev 병합과 Jenkins 성공까지 보존한다. 머지·자동 머지하지 않는다.
인프라 요청은 이 채팅에 작성하며 외부 메시지를 보내지 않는다. 담당자에게 요구하는 사항은
같은 커밋 FE/BE 맵 반영·맵 경로/마커 확인·V183 사전 검증·오락실 호출 제한/모니터링 확인·
배포 후 채널 입장/썰매/트리/오락실 검수·동일 버전 롤백이다.
