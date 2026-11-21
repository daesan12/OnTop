# 온탑 개인 대화와 1대1 눈싸움

기준 dev: `2aecab6531b06ec3c919726baf41cf75e31a059c`.
작업 브랜치: `feat/ontop-snowball-npc`.

## 사용자 흐름

- 공원 채팅에 `/온탑` 또는 `/온탑 안녕`을 입력하면 개인 대화로 전환한다.
- 이후 문장은 온탑에게만 보낸다. `대화 종료` 또는 `/온탑 종료`로 주변 채팅으로 복귀한다.
- `눈싸움하자`로 30초 초대를 받고 광장 서쪽 눈더미 X=-5, Z=44 주변에서 `시작`으로 수락한다.
- Q로 눈을 모으고 캐릭터 정면으로 던진다. 세 번 맞아 먼저 얼면 패배, 90초면 무승부다.
- `그만` 또는 눈싸움 중단 버튼으로 중단한다. 대화 종료·이탈·다른 활동 시작·거리 이탈도 종료한다.
- 일반 보행·점프는 눈싸움을 유지하며, 채팅 등 입력 보호 중에는 NPC 공격만 대기한다.
- Esc는 채팅 입력창만 닫으며 대화 대상은 유지한다. 대화 모드 표시와 종료 버튼을 항상 구분한다.

## 제브와 서버의 책임

제브는 현재 문장과 초대/진행 여부에서 허용된 의도 하나만 선택한다. 대사 생성 모델은 사용하지 않는다.
서버가 준비된 한국어 대사, 초대 유효기간, 현재 채널·활동·거리·경로·점유를 검증한다.
제브는 좌표·표적·승패·재화·충돌을 확정하지 않는다. 외부 HTTP는 bounded worker에서만 실행한다.
중단/종료는 모델 응답을 기다리지 않으며 늦은 응답이 취소된 놀이를 시작하지 못한다.

기존 `ontop.ai.enabled`(`AI_ENABLED`) 활성화 여부와 `JEV_API_KEY`, `JEV_MODEL`, `AI_JEV_ENABLED`를 읽는다.
AI 전체 비활성화 상태에서는 NPC를 생성하지 않는다. 설정 파일 변경은 없다.
키 없음은 `LOCAL_RULES`, 호출 실패는 `LOCAL_FALLBACK`, 불확실한 판단은 `JEV_UNCERTAIN`으로 구분한다.
키 없는 검수는 실제 제브 한국어 판단 품질 검증이 아니다. 키를 채팅·URL·Git에 넣지 않는다.

## 연결 계약과 맵 범위

- 기존 인증된 `WORLD_CHAT_SEND`에서 정확한 `/온탑` 접두사만 개인 경로로 분리한다.
- `WORLD_ONTOP_DIALOGUE`: 요청자만 수신. id로 생각 중/최종 응답을 교체하며 일반 채팅·공개 말풍선에 넣지 않는다.
- `WORLD_ONTOP_STATE`: 같은 채널에 하나의 NPC 위치·동작·상대·공개 놀이 반응을 공유한다.
- 눈 모으기·준비 동작·발사·명중·동결은 기존 SnowballService와 겨울 이벤트를 재사용한다.
- NPC와 동의한 상대 사이에만 명중을 허용한다. 기존 일반 사용자 눈싸움과 비참가자를 분리한다.
- 실제 겨울 눈더미가 포함된 현재 맵에서만 활성화한다. 최초 위치를 현재 충돌로 검사한다.
- 지상 경로는 X=-19~9, Z=30~58 안에서 계산하며 시설·호수·벽을 통과하지 않는다.
- 지형·시설·장식·고정 충돌·생성 맵 데이터·맵 버전을 수정하지 않는다. 채널별 동적 NPC와 피격 대상을 추가한다.
- 상대·대화는 메모리 상태다. 서버 재시작 시 복구하지 않는다. DB/Flyway/지갑/보상 변경은 없다.

공통 변경: TableHub의 개인 채팅 분기·상태 방송·눈싸움 표적 확장, WorldPhysics/WorldChannelRegistry의
서버 NPC 위치용 눈더미·정적 장애물 조회, FE worldClient/runtime 수신, 공원 NPC 표시와 채팅·조준 표시.
기존 NPC 모델의 눈싸움 자세는 온탑의 선택적 prop에만 적용한다.

## 로컬 공원 검수

`OntopParkApplication`은 test classpath에서만 실행하며 기존 AlkkagiParkApplication의 독립 계정 101/202를 재사용한다.
최신 `generated/park-renewal` FE/BE 계약을 읽고, 실제 인증 교환·공원 소켓·이동·충돌·눈싸움을 사용한다.
회원·지갑은 메모리 fixture다. 운영 DB·외부 로그인·실제 정산은 연결하지 않는다.

1. backend에서 `gradlew.bat aiLabClasspath`로 test classpath를 준비한다.
2. 해당 classpath로 `com.ssafy.ontop.demo.OntopParkApplication`을 실행한다. loopback BE 포트는 19188이다.
   Windows에서는 긴 classpath를 Java `@argfile`로 전달할 수 있다.
3. frontend에서 기존 Vite 실행기를 `--mode park-renewal-integration --host 127.0.0.1 --port 5291 --strictPort`로 실행한다.
   기존 `API_PROXY_TARGET` 실행 옵션은 `http://127.0.0.1:19188`을 선택한다. Vite 설정 파일을 수정하지 않는다.
4. 계정 A: `http://127.0.0.1:5291/ontop-park.html?role=red`
5. 계정 B: `http://127.0.0.1:5291/ontop-park.html?role=green`

각 링크는 별도 창/프로필로 열며 테스트 로그인 후 채널 1에 들어간다.
입구에서 광장으로 이동해 서쪽 눈더미 X=-5, Z=44 근처의 온탑을 찾는다.
테스트 로그인 엔드포인트는 local+alkkagi-park test fixture에만 있다.
서비스용 index/App 로그인은 변경하지 않는다. 검수 화면은 DEV+loopback에서만 허용한다.

검증은 온탑 상태 전이·취소/낡은 판단·중복 요청·채널 격리·3회 명중·전용 표적,
제브 HTTP 계약/실패 대체, 실제 인증 WebSocket의 개인 대화/점유/피격/중단,
FE 메시지 검증·타입·빌드·실제 브라우저 2세션으로 구분한다.
맵 전수 탐색과 자전거·킥보드 주행 테스트는 실행하지 않는다.

## 2026-11-21 검증 결과

- BE: `OntopNpcServiceTests` 8개, `JevOntopIntentTests` 2개, 실제 인증 소켓 `OntopNpcFlowTests` 1개 통과.
  실제 소켓에서 보행 중 경기 유지·일반 창 보호 중 공격 대기·개인 대화 격리·경쟁 초대·명중·중단·주변 채팅 복귀를 확인했다.
- 기존 `SnowballServiceTests`, `WinterSnowballFlowTests` 회귀 통과. 기존 사용자 간 눈싸움·동결·탈출 계약을 유지한다.
- FE `ontop.test.ts`, `winter.test.ts` 총 8개, TypeScript 검사, 최종 Vite 번들 빌드 통과.
- Browser 플러그인이 제공되지 않아 기존 설치 Chrome/Playwright를 사용했다.
  독립 context 2개에서 101/202 로그인, 같은 channel-1 진입, 실제 WASD 이동으로 NPC 접근,
  `/온탑` 개인 대화, 두 번째 계정의 초대 거절, 양쪽 실제 눈덩이 명중, 중단·대화 종료를 확인했다.
- 데스크톱 1100×760, 작은 화면 390×720에서 대화 종료·중단 버튼과 스크롤 영역을 확인했다.
  작은 화면의 채팅 영역은 X=16, 너비=358로 가로 잘림이 없었다. JS runtime 오류·프레임워크 오류 오버레이는 없었다.
- 로컬 fixture에서 공지·알림·공원 랭킹·뽑기·시작 뉴스·당첨 내역 API는 DB 미연결로 503을 반환한다.
  이 응답을 정상 운영 연결로 처리하거나 인프라 설정으로 우회하지 않았다. NPC/실제 이동·눈싸움 검증과 구분한다.
- 실행 환경에 제브 키가 없어 실제 제공자 판단 품질은 미검증이다. 로컬 판단과 준비된 대사로 브라우저 검수를 진행했다.
  실제 제브 검증은 담당자가 기존 검수 프로세스의 키·모델·AI 활성화를 확인한 뒤 같은 흐름으로 진행한다.

현재 실행 프로세스 정보와 로그는 이 worktree의 `backend/.gradle/ontop-preview/`에 있다.
검수 서버는 사용자 확인을 위해 유지한다. MR 생성·머지·배포·브랜치 삭제는 수행하지 않는다.
