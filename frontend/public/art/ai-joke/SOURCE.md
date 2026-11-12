# 아재 심사위원 대화 초상화

- 현재 사용: `judge-portrait-v2.png`. 2026-11-10 사용자가 제공한 안경·남색 재킷·노란 넥타이의 투명 PNG 원본(1254×1254)을 그대로 복사했다. 새 이미지 생성·리터칭·배경 제거는 하지 않았다.
- 이전 사용: `judge-portrait-v1.png`. 갈색 모자 영감 상반신 그림은 이전 버전으로 보존한다.
- `judge-head-v2.png`는 이전 얼굴만 요청에 따라 생성한 대안으로 보존하며 현재 UI에서는 사용하지 않는다. v1을 내장 image_gen으로 편집했고 모자·귀·턱까지만 남겼다.
- 2026-11-09 사용자 요청: 게임 대화창 아래 배치, 왼쪽에 아저씨 얼굴 그림을 두고 OnTop 공원 분위기에 맞출 것.
- 기존 캐릭터 참고: `../bungeoppang/customers/older-flat-cap-reference-v1.png`. 기존 3D 캐릭터를 대체하지 않고 대화 UI에서만 사용한다.
- 생성: 내장 image_gen 도구, 실제 투명 배경 출력. 생성한 원본을 그대로 복사했고 별도의 리터칭은 하지 않았다.
- UI 테두리·이름·대사·입력·버튼은 이미지에 굽지 않고 CSS/React로 구현했다.
- 공원 NPC는 사용자 전후좌우 참고 그림의 특징을 기본 도형으로 간단히 표현한 `JokeJudgePlaceholder.tsx`를 임시로 사용한다. 기존 주민 GLB는 수정하지 않으며 팀원의 최종 모델로 해당 컴포넌트만 교체할 수 있다.

## v2 얼굴만 편집 프롬프트

Edit this NPC portrait into a FACE-ONLY dialogue icon for a Pokemon-style game conversation. Preserve the exact character identity, 2D watercolor/ink style, smiling face, gray mustache, brown flat cap. Show ONLY his head: entire brown cap, ears, eyes, nose, mouth, mustache, cheeks and chin. Absolutely NO torso, NO shoulders, NO jacket, NO chest, NO scarf. Head only, floating on real transparent background. Face should fill most of a square icon with small safe padding, upright friendly frontal three-quarter view looking a little to the right. Do not add a frame or text; UI will provide its own small portrait square. This is a head icon, not a bust portrait.

## v1 참고 원본 생성 프롬프트

Create a production game dialogue portrait asset based on the supplied OnTop elderly Korean park resident character reference. Preserve his recognizable brown flat cap, thick gray eyebrows, gray mustache, kind round face, olive quilted winter jacket, and muted rust plaid scarf. Transform the 3D reference into a beautiful HAND-DRAWN 2D character illustration, warm Korean storybook watercolor and gouache with confident soft ink contours. Friendly mischievous elderly dad-joke judge, lively warm smile, one eyebrow slightly raised, looking slightly toward the viewer's right where dialogue text will sit. Single bust portrait showing entire cap, head, shoulders and chest, upright rather than leaning, generous margin around cap, centered composition, no full body. Face is the main focus and must read clearly at 180px size. Cozy Korean neighborhood park game aesthetic, muted forest green, warm browns, parchment-compatible colors, softly shaded handcrafted illustration, polished professional NPC dialogue art, not photorealistic, not a 3D render, not anime teen. Transparent background with clean alpha, no scenery, NO text, NO lettering, NO speech bubble, NO border, NO UI, one single character only. This is the character artwork, the developer will create the dialogue UI separately in CSS. Save the generated image and return its local saved image path in output_hint if available.
