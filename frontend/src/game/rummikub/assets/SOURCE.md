# 수패마루 대표 그림

- 생성: 2026-11-23, OpenAI 내장 `image_gen` (`imagegen` 스킬, CLI 미사용).
- 용도: 테이블 착석 후 게임 선택 카드·선택 상세·준비 화면 및 공통 설명서의 수패마루 대표 그림.
- 참고: 기존 주사위 장부 `game/ledger/assets/thumbnail.webp`, 흑백수사 `game/davinci/assets/cover.webp`,
  원카드 `public/art/tablet/onecard-v2.webp`의 정자·나무 탁자·자연광·입체 놀이 도구 표현.
  생성 입력에는 주사위 장부·흑백수사와 기존 `assets/entry/ontop-logo.webp`를 사용했다.
- 결과: `cover.webp`, 1024×512, 불투명 WebP. 1774×887 생성 원본을 sharp로 축소·품질 88 변환했다.
  게임 규칙이나 숫자 판정에는 사용하지 않는다. 실제 타일과 조커의 런타임 모델·로고는 별도 에셋을 유지한다.
- 기존 미사용 `public/art/rummikub/thumbnail.png`를 덮어쓰지 않고 게임 전용 경로에 새 파일로 추가했다.
- 새 대표 그림은 원목 받침대·녹색 홈·아이보리 숫자패, 파랑 4-5-6과 서로 다른 색 7,
  빨강 9-10-11 및 세 색 8 조합을 보여준다. 조커에는 온탑 로고에서 참고한 금색 탑 문양을 사용한다.
  글자나 상용 게임명은 넣지 않는다.

## 연결·검증

- 기준: `origin/dev` `549e0c2a21b6824a86fe99fa25b1468de7006704`, 작업 브랜치 `feat/supae-cover`.
- 공통 변경은 `features/tableLobby/TabletLobby.tsx`와 `features/manual/GameArt.tsx`의 수패마루 이미지 참조뿐이다.
  태블릿 상세의 긴 가로 영역에서도 앞쪽 조합이 잘리지 않도록 수패마루만 contain/no-repeat로 표시한다.
  다른 게임 그림과 기존 채팅·맵·좌표·충돌·인프라·FE/BE 계약은 변경하지 않는다.
- 기존 태블릿·설명서 unit 2파일 16개 및 TypeScript 통과. Vite park-renewal-integration 배포용 빌드도 통과했고
  107,254바이트(약 105KiB) WebP가 해시 파일명으로 번들에 포함됨을 확인했다.
- 로컬 실제 공원 fixture에서 착석 → 수패마루 선택/설명서 목록 → 0냥 준비 → 게임·판돈 변경 → 퇴장을
  Chrome 기본 PC 화면과 390×844에서 확인했다. 설명서 이미지는 1024×512 로딩 완료를 확인했다.
  PC 선택 상세의 앞쪽 숫자패 잘림을 발견해 보정한 뒤 다시 검수했다.
- 이미지 로딩/앱 오류는 없었다. 브라우저 확장 content.js의 연결 오류와 기존 THREE.Clock 폐기 예정 경고는
  대표 그림 변경과 무관하며 남겨 두었다. 최초 CDP 캡처 타임아웃은 같은 탭의 정식 getScreenshot으로 확인했다.
- 실제 터치 기기·운영 배포 검증은 포함하지 않는다. 화면 검수는 기존 DB/재화 대역 fixture이며 게임 규칙은 바꾸지 않는다.
- 검증 화면은 저장소 밖 `OnTop/qa-supae-cover-20261123/`에 보관하고, 사용한 게임 탭 및 FE 5544/BE 19464는 즉시 종료했다.

## 생성 프롬프트

```text
Use case: stylized-concept. Asset type: final landscape 2:1 game-selection cover for OnTop's Korean number-tile board game 수패마루. Generate a NEW original scene using the attached images as references, not a collage. Image1 (dice ledger) is the main reference for warm pavilion timber table, Korean park background, premium tangible miniature 3D materials and soft sunlight; Image2 (black-white tile game) is reference only for craftsmanship and sharp readable tiles; Image3 is the OnTop brand logo, use its central stone-pagoda silhouette subtly as an engraved gold joker emblem, not the whole wordmark or mascot. Scene: close-up wooden pavilion tabletop in a traditional Korean park, a softly blurred green/red pavilion railing and sunlit foliage behind. Hero: one upright stepped dark walnut tile rack with deep forest-green felt grooves, brass end details. A row of thick, small ivory number tiles seated securely in the rack and facing camera, with clean large numerals: blue 4, blue 5, blue 6; black 7, red 7, yellow 7; and one ivory joker with a restrained gold stone-pagoda emblem. On the table in front, show two clear legal melds, each individually spaced as a group: red 9-10-11 and black 8 / blue 8 / yellow 8. Each tile carries ONLY ONE large number in its color, visible bevel thickness and softly polished ivory top, warm wood side edges; not playing cards. Keep objects simple and readable at 150px thumbnail scale. Three-quarter elevated front camera, rack in middle horizontal band, tiles foreground centered. All crucial tiles and the entire rack fit within central 80% of width and central 75% of height, safe for centered thumbnail crops. Warm natural daylight, believable soft contact shadows, crisp tactile tile edges, premium handmade Korean game prop feeling. Palette: warm walnut, hanji ivory, deep green, subtle brass gold, restrained red/blue/yellow/black numerals. No people, no hands, no box, no dice or cards, no floating tiles, no banner, no title or text other than the specified numerals, no Rummikub word, no commercial brand, no watermark. A polished game art illustration with realistic 3D depth that matches the visual family of the references. Wide 2:1 composition, opaque background.
```
