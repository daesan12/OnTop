# 태블릿 아트 제작 기록

## 원카드 수정 — 최종 프롬프트 (2026-10-26)

> Create ONE corrected One Card game thumbnail, based closely on the TOP-RIGHT thumbnail of the provided reference atlas. Output a single landscape illustration, aspect ratio 2:1, no atlas or collage. Keep the warm wooden tabletop, softly blurred green park background, cream playing cards fanned to the left and a neat red-backed deck on the right, gentle painterly 3D-render style and warm sunlight matching the reference.
> The sole requested improvement is clean, logically correct playing cards. Use a fan of only FOUR cards: from left to right 2 of spades, 3 of clubs, 4 of diamonds, and a clearly visible ACE OF HEARTS at the front. All cards have straight smooth rounded rectangular edges and consistent thickness. Each upper-left index consists of the correct rank and a small matching suit. The front ace of hearts has exactly ONE large central red heart, an A and small heart at the upper left, and the same A and small heart rotated 180 degrees at the lower right. Both corners MUST identify A of hearts. Rear cards have correct visible corner ranks and suits, with obscured areas naturally hidden by the fan. No duplicate or mismatched ranks on a card, no J/Q/K face cards, no malformed letters, no hand, no extra cards floating, no labels or UI. Keep the full fan and deck comfortably inside the frame with generous breathing room.

2026-10-26. 사용자가 제공한 게임 선택·준비·결과 레퍼런스를 수용한 시안이다. UI 레이아웃을 다시 생성해 변경하지 않았다. 배경과 썸네일만 built-in Image Gen으로 제작했다. 텍스트·버튼·입력·상태는 실제 HTML/React이며 사진으로 대체하지 않는다.

## 산출물

- `public/art/tablet/hanji.webp`: 90,042 bytes. 한지·구름·잎·산·정자 장식 배경. PNG 생성 후 sharp로 WebP 최적화.
- `public/art/tablet/games.webp`: 277,330 bytes. 2×2 썸네일 atlas. 순서는 오목/원카드/주사위/거짓말 다리. CSS background-position으로 사용하며 이미지 텍스트를 UI 문구로 쓰지 않는다.
- `public/art/tablet/onecard-v2.webp`: 원카드만 별도 교체한 2:1 썸네일. 기존 atlas의 다른 게임은 유지한다. 카드 모서리의 숫자·무늬 불일치를 수정했다. built-in Image Gen으로 원본 atlas를 참조해 생성하고 sharp로 폭 1,000px WebP 최적화.
- 목재 프레임은 기존 `SurfaceMaterial`의 목재 재질, 캐릭터 초상은 기존 `characterUrls` GLB. 사용자 레퍼런스의 신규 의상·배경·캐릭터를 무단으로 교체/임포트하지 않았다.

## 한지 배경 — 최종 프롬프트

> Use case: precise-object-edit, production UI background asset extraction. Reference is an approved game UI concept. Create ONLY the blank decorative ivory hanji paper artwork from the screen, flat and front-on, landscape 16:10. Warm light cream #f5ebd3 paper with very subtle natural fibers. Faint olive Korean ink wash park scenery ONLY at the bottom edge: a pine tree lower left, distant hills bottom, and the slender traditional Korean pavilion at lower right. Very faint flowing thin cloud lines in the upper left and a small muted olive leafy branch in the upper right. Center 85% and all middle area clean uninterrupted blank light cream for UI text. NO text, NO numbers, NO letters, NO logos, NO UI controls, NO cards, NO wooden tablet, NO people, NO frame, NO border, NO cast shadows, NO perspective. Match subtle understated border illustrations of supplied reference exactly. Do not make a busy landscape painting. This image will be a reusable background below real HTML controls.

## 게임 썸네일 atlas — 최종 프롬프트

> Create a production sprite atlas for a Korean Tapgol Park boardgame UI, using the four game thumbnails in reference as the exact style guide. ONE landscape 2:1 image divided into a precise TWO COLUMN TWO ROW grid of FOUR equally sized 2:1 rectangular game illustrations, no gutters, no borders. Each quadrant is a standalone cinematic tabletop still life, 3D rendered game art with warm sunlight and softly blurred green park in background. Top-left: a square wooden 15x15 omok board with black and white round stones, wooden stone bowl, close perspective tabletop. Top-right: fan of standard playing cards with recognizable hearts spades diamonds clubs and stacked deck on warm wooden table, no people or hands. Bottom-left: six ivory dice with normal black pips and a dark brown leather dice cup tipped on warm wood table. Bottom-right: small arched wooden bridge board game with red blue green yellow wooden pawn pieces, ivory dice beside it. No characters, NO title labels, NO UI, NO typography outside standard playing card rank/suit markings, NO invented watermarks. Keep the important props well centered within each quadrant for web CSS background cropping. This is an asset atlas, not a screenshot of a UI. Consistent illumination and tasteful 3D material finish across quadrants.
