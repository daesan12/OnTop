# 겨울 트리 편지 · QA 11

## 기준과 범위

- 브랜치: feat/winter-community-letters-snowmen (기존 MR !670의 이력과 브랜치명 유지).
- 최신 origin/dev 29526531c56a4c25d02417e209e34edead089ec5를 포함한다. 미커밋 작업 없이 시작했다.
- 2026-11-22 사용자 요청으로 공동 눈 굴리기·눈사람 제작 기능을 취소했다.
  제작 UI·Q 길게 누르기·꾸미기·배치·채널별 영구 저장·동적 충돌·전용 REST/WS와 테스트를 제거했다.
  제작용 눈밭과 생성 맵의 관련 데이터도 제거했다. 기존 눈사람 NPC·공원 장식과 눈싸움은 유지한다.
- 트리 크기·기존 물리는 최신 dev의 7.8m 절차형 모델을 유지한다. 별도 확대와 12m 모델 적용은 없다.
- 8번 썰매·10번 오락실 무제한·12번 공포맵 보석은 포함하지 않는다. 인프라 설정을 수정하지 않는다.

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

- mapVersion: 6ef360f31cb075c9af402967d03ed0b591520a2eb7506ce66abac401df448b7d.
- 최신 dev와의 의미 차이는 physics.winterTree 상호작용 위치 데이터 한 개와 그에 따른 해시뿐이다.
  기존 제작 영역·형상·추가 눈더미는 없다. 지형·시설·충돌·썰매 경로는 dev와 동일하다.
- generate-renewal-park.mjs로 재생성했다. 이전 MR의 f9128971… 대신 위 최종 버전을 사용해야 한다.
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
