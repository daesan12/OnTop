# 겨울 트리 편지 · QA 11

## 기준과 범위

- 브랜치: feat/winter-community-letters-snowmen (기존 MR !670의 이력과 브랜치명 유지).
- 최신 origin/dev 90389d8947057a0897b6462a86b282d0e5986392를 통합했다. dev 통합 충돌은 없었다.
- 2026-11-22 사용자 요청으로 공동 눈 굴리기·눈사람 제작 기능을 취소했다.
  제작 UI·Q 길게 누르기·꾸미기·배치·채널별 영구 저장·동적 충돌·전용 REST/WS와 테스트를 제거했다.
  제작용 눈밭과 생성 맵의 관련 데이터도 제거했다. 기존 눈사람 NPC·공원 장식과 눈싸움은 유지한다.
- 2026-11-22 사용자가 맵 변경을 포함한 에셋 재통합을 승인했다. 되돌림 f24d6751의 역변경을
  적용하고 트리는 12m GLB, 산타·눈사람·루돌프 6마리·썰매와 하네스 고삐를 복원했다.
  편지 UI·장식 누적·50개 점등과 공동 눈사람 제작 기능 제거 상태를 유지한다.
- 최신 dev에 반영된 공포맵 보석은 유지한다. 별도 썰매 승하차 피드백·오락실 무제한 작업은
  가져오지 않는다. 기존 장식 좌표·승강장·비행 경로와 인프라 설정을 변경하지 않는다.

## 사용자 흐름

공원 트리 가까이에서 E → 투명 배경 트리 그림과 오른쪽 크리스마스 2D 패널 →
양말·구슬·종·선물 선택 → 크리스마스 편지지 → 익명/내 닉네임 선택 후 등록 → 장식·개수 갱신.
작성 중에는 뒤의 선택 패널을 숨기고 편지지 바깥으로 실제 공원이 보인다.
Escape로 돌아오면 초점과 초안을 복원하고, Tab 순환과 작은 화면의 스크롤 접근을 유지한다.

- 편지는 300자 이내이며 서버 닉네임을 사용한다. 전 채널 공용 기록이다.
- 누적 50개부터 별·전구의 발광 재질이 계속 켜지고 최초 점등 시각을 저장한다.
- 편지는 12개씩 조회하고, 트리 장식과 장식별 개수는 최근 50개 편지 기준이다.
- 기존 feat/christmas-tripo-assets의 장식 GLB를 재사용한다. 출처·이용 조건·해시는 assets/manifest.json,
  2D 아트 출처와 프롬프트는 ui-art/README.md에 기록했다. 새 유료 생성은 없다.
- 저장 요청 UUID 재시도는 멱등 처리한다. 응답이 유실되면 편집을 잠그고 동일 요청을 재확인한다.
  서버는 위치·활동 권한·익명 정보·장식 종류·15초 등록 간격을 검증한다.

## 공통 계약과 DB

- REST: GET /api/v1/world/winter/tree/status, GET /tree, POST /tree/messages.
- WS: WORLD_WINTER_TREE로 개수·점등·장식 종류와 ID를 전달한다. 작성자 저장 키는 공개하지 않는다.
- TableHub/WorldChannelRegistry는 기존 인증된 계정의 위치·활동 상태를 확인한다.
  WorldPhysics는 트리와 지면 높이만 읽으며, 눈사람 동적 충돌을 추가하지 않는다.
- FE 공통 연결은 공원 E 상호작용·worldClient/runtime·PaperPopup 입력 제어다. 지갑·보상·정산은 바꾸지 않는다.
- V183__create_winter_community.sql 1개, location backend/src/main/resources/db/migration/.
  winter_community_board와 winter_tree_messages 두 테이블만 생성한다.
  V183 미적용을 사용자가 2026-11-22 채팅으로 확인한 뒤 제작용 테이블 정의 두 개를 제거했다.
  기존 적용 SQL 또는 실제 DB를 수정·삭제하거나 초기화하지 않았다. 신규 V번호는 만들지 않았다.
- postTree는 공용 행 락·멱등성·등록 간격을 유지한다. SQL에서 message_count/revision을 원자 증가하고
  최초 lit_at을 보존한다. 최근 장식 JOIN 조회는 최종 응답 생성 때 한 번 수행한다.

## 생성 맵과 배포 인계

- mapVersion: c118806e4d79adddd4e30f1a9eb36c14fba0082494ce657bbef41ec6c5d95a59.
- 기존 편지 브랜치의 생성 맵에서 변경된 의미 데이터는 겨울 장식 충돌 hull 5곳과
  physics.winterTree.height(7.8 → 12)뿐이다. 지형·다른 시설·좌표·눈더미·썰매 경로는 유지한다.
- generate-renewal-park.mjs로 충돌과 편지 상호작용 정보를 함께 재생성했다.
  이전 6ef360f3… 산출물을 재사용하지 않고 위 최종 버전을 사용해야 한다.
- 향후 배포 담당자는 같은 커밋의 FE·server-map.json·manifest.json을 함께 반영하고,
  require-match 검증과 새 클라이언트 채널 입장을 확인해야 한다. 실제 배포·서버 설정 적용은 수행하지 않았다.
- 다른 맵 MR 병합 뒤에는 최신 dev 통합과 산출물 재생성을 다시 수행한다. 8번은 계속 보류한다.

## 검증 (2026-11-22)

- TypeScript --noEmit 통과.
- FE 6개 파일 27개 통과: winterCommunity, winter, winterMotion, parkNpcDialogue,
  parkNpcInteraction, parkVisualPreservation. 맵 전수 탐색·자전거/킥보드 주행 테스트는 제외했다.
- BE 7개 클래스 34개 통과: TableHubWinterCommunity, JdbcWinterCommunityStore, WinterCommunityService,
  WinterCommunityPhysics, WinterSnowPickupPhysics, PagodaThrowLanding, SnowballService 검증.
  트리 49→50 점등·익명·장식·중복/충돌 요청·파일 저장소 복원과 기존 눈싸움/던지기를 확인한다.
- MySQL 전용 테스트는 컴파일만 확인했다. 미적용 V183의 실제 MySQL 8.4 신규/순차 적용은 미확인이다.
- park-integration 프로덕션 빌드와 장식 에셋 11개/GLB 5개 무결성 검증 통과.
- Browser 플러그인 부재로 기존 Playwright 검수 도구를 사용했다. 실제 공원 지형·건물·겨울 장식을
  렌더링한 API fixture에서 선택→편지지→저장→49/50/51개 갱신과 동일 UUID 응답 유실 재시도를 검증했다.
  1280×850·390×844·844×390·320×568에서 편지 작성 버튼 접근, Tab/Escape/초점 복귀,
  투명 여백과 작성 중 뒤 패널 숨김을 확인했다. 앱 오류 0개. 전용 브라우저·서버를 즉시 종료했다.
- 실제 운영 인증·실서버 다인 공원·운영 DB 복원·VR 헤드셋·Jenkins 성공은 미확인이다.
- 기존 !670을 갱신하며 머지하지 않는다. Jenkins 확인 전 브랜치는 유지한다.

## 에셋 재통합 검증 (2026-11-22)

- 별도 worktree christmas-community-assets-20261122에서 기존 브랜치 작업 위치를 보존했다.
  에셋 복원 충돌 4파일(WinterScene, live/physics, 생성 맵 2개)은 기존 편지 로직을 유지하고
  생성 맵을 다시 생성하여 해결했다. 새 migration, BE 운영 코드, 인프라 변경은 없다.
- FE 10파일 60개, TypeScript, park-integration 프로덕션 빌드 통과.
- BE 6클래스 11개 통과: GeneratedParkMapHandoff, WinterCommunityPhysics,
  WinterSnowPickupPhysics, TableHubWinterCommunity, JdbcWinterCommunityStore, WinterCommunityService.
- 에셋 패키지 7파일과 편지 장식 패키지 11파일의 해시·소등 기본값·리깅 무결성 통과.
  새 유료 생성과 크레딧 사용은 없다.
- 실제 12m 모델의 장식 49개·소등 → 편지 저장 → 장식 50개·별/줄조명 점등을 브라우저에서 확인했다.
  기존 UI의 응답 유실 재시도·익명/닉네임·초점·Escape와 4개 뷰포트 검증 통과.
  API fixture를 사용했으며 실제 서버 인증·DB·운영 배포 검증과 구분한다.
- 실제 공원 프리뷰에서 새 에셋 인스턴스 11개(산타 1·눈사람 3·썰매 1·루돌프 6)와
  별도 공동 트리 1개를 확인했다. 정지 및 비행 5프레임에서 고삐와 하네스/견인 링의
  연결 오차는 0.001m 미만이며 여섯 루돌프의 달리기와 비행 이동을 확인했다.
  검증 전용 브라우저 프로필과 서버 5441·5442는 종료 후 잔여 0개를 확인했다.
- 최신 dev 포함 여부·원격 중복 변경을 다시 확인하고 기존 !670 브랜치만 갱신한다.
  dev 머지·배포·Jenkins/환경 설정 변경은 하지 않는다.
