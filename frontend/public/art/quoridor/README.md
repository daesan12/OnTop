# 길목 한 수 표지

- `cover-park-v2.webp`: 2026-11-23 사용자 요청으로 교체한 태블릿 게임 카드·선택 상세·설명서 공용 표지. 1200×600, WebP, 201052 bytes.
- 제작: 내장 `image_gen` 도구로 생성한 가로형 이미지. 기존 `thumbnail.webp`는 말·나무 판의 정체성 참고이며, 원카드 `art/tablet/onecard-v2.webp`, 주사위 `art/tablet/dice-v2.webp`, 장부 `src/game/ledger/assets/thumbnail.webp`를 공원의 나무 재질·따뜻한 빛·한옥 배경 스타일 참고로 사용했다.
- 구성: 나무 탁자, 월넛 격자판, 녹색·금색·붉은색·청회색 말, 세운 나무 장벽, 정자·등불·나뭇잎. 제목·숫자·상표·워터마크는 넣지 않았다.
- 원본 생성 PNG를 색상·구성 변경 없이 비례 축소하고 Sharp의 WebP quality 88 / effort 6으로 인코딩했다. 생성 ID는 `01a1fcfe-3c67-7392-b45d-0f04168322a4`이다.
- SHA-256: `9d96720560ea9d0d970d5fc7970dff4d16a03acc5ada23a4d2113c14fd36b416`.
- 연결: `features/tableLobby/TabletLobby.tsx`와 `features/manual/GameArt.tsx`. 태블릿은 높이가 낮은 선택 상세에서도 전체 말·판이 보이도록 `contain`으로 표시한다. 새 파일명으로 기존 이미지 캐시와 구분하며, 이전 `thumbnail.webp`는 비교·복구용으로 보존한다.
- 이 파일은 UI용 표지다. 실제 공원 맵·테이블 메시·경기판 재질·게임 규칙은 변경하지 않는다.
