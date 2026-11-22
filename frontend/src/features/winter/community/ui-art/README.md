# 크리스마스 전체 화면 상호작용 아트

2026-11-22 사용자 요청에 따라 built-in `image_gen`으로 새로 생성했다.
소리함·메모함·뽑기 화면의 이미지는 복사하지 않았다. 공원 GLB·배치·충돌에는 사용하지 않는다.

- `tree-illustration.webp`: 전체 화면 왼쪽에 사용하는 장식된 트리 그림이다.
  오른쪽 장식 카드와 누적 수, 별도 편지 작성 팝업은 네이티브 DOM으로 구성한다.
- 원본 PNG는 Codex generated_images에 보존하고 프로젝트에는 WebP quality=90,
  alphaQuality=100으로 인코딩했다. 이미지 안에는 글자·버튼·입력란을 그리지 않았다.
  제목·장식 선택·작성·이름 공개·편지 조회는 실제 DOM 및 기존 서버 계약을 사용한다.

생성 프롬프트 요지: 하나의 온전하고 자연스러운 전나무 그림, 꼭대기의 입체 금빛 별,
정교한 녹색 가지·따뜻한 전구·금색 가랜드·붉은 리본·양말·종·구슬,
밑동의 포장 선물과 눈. 중앙도 풍성한 잎과 장식으로 채운 일반 트리이며
빈 프레임이나 입력 영역을 그리지 않는다. 외부는 투명하고 3:4 세로 구도다.
글자·버튼·입력란·게시판·기와·건물·목재 프레임을 그리지 않는다.

원본 파일:

- `exec-178cc52a-8aa7-4598-957f-8685b57d7ff1.png`

검수에서는 트리 그림의 비율·선명도와 왼쪽 그림/오른쪽 정보 배치, 장식 카드 클릭,
팝업의 초기 포커스·Tab 순환·Escape 복귀·저장, 작은 화면 내부 스크롤을 확인한다.

## 실사 소재감의 장식 선택 이미지

사용자 요청으로 2D 선택 화면에만 사용하는 `stocking-photo.webp`, `bauble-photo.webp`,
`bell-photo.webp`, `gift-photo.webp`를 built-in image_gen으로 각각 생성했다.
기존 트리 그림, 공원 GLB와 모델 미리보기, 배치·충돌·맵 버전은 변경하지 않았다.
원본의 투명도를 유지해 긴 변 512px, WebP quality=90/alphaQuality=100으로 인코딩했다.
편지 작성창은 기존 메모함의 작성 방식을 참고하되 크리스마스 전용 편지지를 사용한다.

공통 프롬프트: `Use case: product-mockup. Game UI ornament selector asset.
Photorealistic premium product photography, soft warm studio key light from upper left,
tactile physical materials, clear recognisable silhouette at thumbnail size. Isolated one
object centered fully in square frame, three-quarter angle, occupies about 80% of frame.
Genuinely transparent background, no surface or backdrop, no fake transparency checkerboard,
no scenery, no text, no logo, no frame. Cohesive Christmas red / antique gold / ivory palette.
Not cartoon, not plastic low-poly, not vector clipart. Save project-bound asset.`

각 이미지의 피사체 프롬프트:

- Stocking: `A single red knitted Christmas stocking ornament with thick ivory wool cuff,
  red hanging loop, visible wool fibers and realistic cable knit stitches. Slight natural lean.`
- Bauble: `A single deep red glass Christmas bauble ornament, small antique brass cap and
  fine hanging loop. Real translucent blown glass, subtle reflections and surface imperfections.`
- Bell: `A single small antique golden brass Christmas bell ornament, red velvet bow and a
  small hanging loop, visible bell opening and clapper. Real brushed brass patina and woven velvet.`
- Gift: `A single small Christmas present ornament: neatly wrapped matte ivory paper cubical
  box tied with a deep crimson velvet ribbon and natural bow. Real paper folds and ribbon texture.`

원본 PNG는 같은 generated_images 세션에 보존했다:
stocking `exec-695a3a51-3292-46f7-b46f-4010a521bfd4.png`,
bauble `exec-14f6485c-07be-4a15-bef9-0c880e0a3d54.png`,
bell `exec-fd7f1c11-7326-4549-b53d-9fea039dbdea.png`,
gift `exec-e9295d4d-c9e4-4f10-948d-80be5a092b48.png`.

## 크리스마스 편지지

`christmas-letter-paper.webp`는 메모함 `features/notes/art/notes-paper.webp`를
편집 대상으로 built-in image_gen에서 새로 편집했다. 원본 메모함 파일은 수정하지 않는다.
담쟁이·꽃잎을 솔가지·붉은 벨벳 리본·열매·황동 종으로 바꾸고, 얇은 녹색/금색 프레임과
밝은 종이 중앙을 유지한다. 투명도를 보존하고 폭 900px WebP quality=90/alphaQuality=100으로
인코딩했다. 원본 PNG: `exec-20714ebf-fab9-469d-abf2-feeb485401a1.png`.

편집 프롬프트: `Edit this existing game memo paper into a Christmas letter-writing background.
Preserve the straight-on flat portrait rectangle, large plain warm ivory parchment center,
thin tactile physical frame, softly rounded corners and genuinely transparent outside silhouette.
Replace ALL ivy leaves, spring vines, pink petals and flowers with restrained realistic evergreen
fir sprigs, a few red holly berries and deep crimson velvet ribbon at outer corners, plus one tiny
antique brass bell at the lower left corner. Use a very slim muted antique gold and dark fir-green
frame instead of prominent ordinary brown wood. Make it look like a real handmade Christmas
stationery piece with soft photographic material texture, matching red knitted stockings and
brass bell product photography. The CENTER MUST be completely blank calm pale cream writing
paper: no decorations or shadows crossing into central 84 percent width, no branches behind
future UI text. Keep ornaments strictly in outermost 6-8% at corners; top center and upper-right
inner corner must stay empty for title and close button. Spacious and refined, not busy.
No text, no letters, no UI controls, no drawn textbox, no watermark, no glow particles.
Keep all four frame edges fully visible within the image.`
