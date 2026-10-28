# 원카드 뿅망치·투명 손 이미지

사용자가 2026-10-28 첨부한 온탑 뿅망치 디자인과 방해 시안에서 파생한 HUD 이미지입니다. 내장 image_gen 도구로 생성했으며 CLI/API 키 방식은 사용하지 않았습니다. 투명 알파를 보존해 WebP로 최적화했습니다. 게임판·버튼·투명도·애니메이션·서버 판정은 코드에서 처리합니다.

- `frontend/public/art/onecard/prank/hammer.webp`: 640×585, 알파 포함. 게임 HUD·들기 버튼에서 사용.
- `frontend/public/art/onecard/prank/ghost-hand.webp`: 768×512, 알파 포함. 서버가 승인한 손 뻗기 시도에만 표시. FE에서 반투명 처리.

뿅망치 최종 프롬프트:

> Use case: background-extraction. Create ONE production game sprite from the reference sheet: the exact red accordion toy hammer with green central barrel, gold Korean plaque reading 온탑, pale round end caps embossed with a golden fish-shaped pastry, wooden handle with red grip, gold fittings, green bead and fish charm with red tassel. Preserve this design and materials. Show just one complete hammer in a three-quarter view, diagonal: hammer head upper left, handle grip lower right, whole object uncropped, centered with clean 8% transparent padding. Stylized high-quality 3D game render matching the reference. No human hand, no character, no background, no board, no UI, no labels, no collage, no drop shadow outside the object. Genuinely transparent alpha background. This is an asset extraction/derivative, not a design sheet.

손 최종 프롬프트:

> Use case: compositing. Produce ONE isolated hand sprite for a playful Korean park card game, using the translucent reaching hand in the reference as a visual guide. A friendly chibi 3D character's LEFT hand reaching toward the viewer's playing cards, five clearly readable rounded fingers, palm oblique toward camera, fingers extending upper left from a short forearm at lower right. Soft pale ivory skin, no jewelry, no clothing beyond a very short neutral cuff. Render solid light skin material with clean transparent alpha around the hand; application will apply ghost translucency. Whole hand and short wrist uncropped, centered with generous clear padding. No hammer, no character body, no cards, no background, no UI, no writing, no multiple hands. Polished stylized 3D game asset, not photoreal human anatomy.
