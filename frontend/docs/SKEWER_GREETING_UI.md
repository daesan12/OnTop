# 원형 인사 이벤트 — 2026-11-03

- 작업 위치: `C:/Users/SSAFY/Desktop/OnTop/skewer-service-hall`
- 브랜치: `feat/skewer-service-hall-20261101` (로컬 전용)
- 기준: 최신 원격 fetch 후 HEAD와 origin/dev 사이 신규 커밋 없음.
- 담당 경로: `frontend/src/features/skewer/coop/`, `backend/src/main/java/com/ssafy/ontop/game/skewer/coop/`.
- 화면: `GreetingEvent.tsx` / `greetingEvent.css`. 캐릭터 원형 버튼, 잔여시간 링, G/클릭 입력, 응답 완료 상태.
- 조리 안내: `chef/chefPresentation.ts`의 기존 영업시간 정지 문구 수정.
- 영업 제한시간은 인사 중에도 진행한다. 인사 응답은 최대 5초이며 0초 영업 종료가 우선한다. 입장·식사·청소·세척 및 서빙 속도 측정은 기존처럼 인사 구간을 제외한다. Esc 공동 일시정지와 연결 끊김 중에는 영업시간도 멈춘다.
- 공통 파일·DB·Flyway V144 변경 없음. 커밋·푸시·MR·머지·Jenkins·브랜치 삭제 없음.

## 검증과 실행

- TypeScript 타입 검사 통과.
- SkewerCoopEngineTests 통과: 인사 중 시간 진행, 두 번의 이벤트, 0초 종료 우선, Esc 일시정지 등.
- skewerChefPresentation / skewerCoopDrivers 단위 테스트 10개 통과.
- Chrome의 실제 UI + 테스트 통신 상태로 그림 로딩, 클릭, G키, 응답 완료, 1440×900·900×500·390×844 배치 확인. 페이지 오류 없음.
- 프런트 실행: frontend에서 `node node_modules/vite/bin/vite.js --config vite.skewer-coop.config.ts --mode park-integration --port 5244`.
- 로컬 URL: `http://127.0.0.1:5244/skewer-service-hall.html`. 독립 연습 진입점에는 협동 이벤트가 없어 캡처 스크립트에서 CoopHost에 이벤트 상태를 주입한다.
- 캡처 스크립트: `C:/Users/SSAFY/.codex/visualizations/2026/10/30/01a18c0e-601d-7e83-99d6-b8a0c879503b/capture-greeting-round.cjs`.
- 이번 검증은 실제 두 기기의 네트워크 통합·공유 DB 보상 지급·Quest 실기기 검증이 아니다. VR 공간 안의 기존 컨트롤러 인사 패널은 유지하며, 원형 그림은 서빙/요리사 브라우저의 2D 이벤트 화면에 적용한다.

## 이미지 제작 기록

- 도구: 내장 `image_gen` (imagegen 스킬, CLI/API fallback 사용 안 함).
- 프로젝트 이미지: [greeting-duo-v1.png](../public/art/skewer/greeting-duo-v1.png).
- 참조: 사용자가 제공한 `ChatGPT 이미지 2026년 11월 3일 오후 01_52_23.png`의 파란 요리사·분홍 서빙 담당.
- 원본 생성물은 별도 보존, 프로젝트에 복사하여 참조한다.

최종 프롬프트:

> Create one square game UI illustration based on the two main characters in the reference image. Keep their exact cute chibi toy-like 3D character identity, warm brown sculpted hair, cream chef hats, cream aprons with tiny skewer motif, boy's blue shirt and girl's pink shirt with pink ponytail tie. Both characters together, cheerful welcoming greeting toward viewer, smiling open mouths and one raised waving hand each, natural correct hand anatomy, waist-up portraits side by side, girl slightly in foreground. Use soft polished clay-like 3D materials and warm amber studio lighting. Composition MUST fit comfortably inside a centered circle with 10% clear padding around the two hats and waving hands: nothing cut off by a circular crop. Simple uniform warm ivory background, very faint warm golden glow behind characters. No scenery, no text, no numbers, no UI frame or buttons, no extra characters, no duplicate rear views. This illustration will be clipped into a round greeting button in our Korean restaurant cooperative game. Save the generated image as a local file and return its file path if supported.
