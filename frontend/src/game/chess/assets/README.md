# 체스 대표 이미지

- 현재 대표 이미지: `thumbnail.webp`, 1200×600, 129,824 bytes. 선택 카드·준비 화면·설명서 목록이 같은 이미지를 사용한다.
- 2026-11-23 내장 `image_gen`으로 제작했다. 알까기·과일 땡·주사위 장부 대표 이미지의 따뜻한 나무 테이블, 공원 정자와 입체적인 소재 표현을 참고했다.
- 생성 원본은 1774×887 PNG이며 `sharp`로 1200×600, WebP quality 88로 인코딩했다. 배경이나 기물의 추가 편집은 하지 않았다.
- `thumbnail.png`는 사용자가 제공한 기존 참고 이미지로 보존한다. 현재 대표 이미지에는 연결하지 않는다. `pieces.png`는 기존 기물 표시용이며 변경하지 않았다.

## 최종 생성 프롬프트

입력 1은 기존 체스 `thumbnail.png`, 입력 2~4는 각각 알까기·과일 땡·주사위 장부의 `assets/thumbnail.webp`이다. 2~4는 스타일 참고이며 해당 게임 도구를 복사하지 않는다.

```text
Use case: style-transfer. Asset type: final production replacement for the CHESS game-selection thumbnail in the OnTop Korean park board-game UI. Redesign image 1 completely as a polished new cover; preserve only its subject of western chess. Images 2, 3 and 4 are STYLE REFERENCES ONLY: match their warm sunlit wooden tabletop, softly blurred green Korean park and traditional green-roof pavilion, detailed tactile materials, inviting premium 3D game illustration. Do not copy their game objects, Chinese characters, fruit, dice, lanterns or coins.
Create one wide landscape image with a 2:1 aspect ratio, preferably 1536x768. A beautifully crafted walnut and ivory 8x8 chessboard on the wooden park table, three-quarter slightly elevated close view. Recognizable elegant Staunton chess pieces in creamy ivory and deep walnut brown, matching the game's actual 3D chess palette. A clear, readable central ivory king, queen and horse-head knight opposed by dark king, rook and a few pawns in an uncluttered midgame composition. All pieces stand firmly on squares of the same single board. Keep the main chess silhouettes and board in the central 75 percent so the image remains recognizable in a small UI card and in a center crop. The chessboard has a plausible single continuous regular 8 by 8 alternating grid and a subtle walnut frame, never multiple boards or extra grids. Soft golden late-afternoon light from the left, natural contact shadows, shallow depth of field, gentle green and honey tones, restrained material highlights. A traditional Korean pavilion and leafy trees only as a softly blurred supporting background, like images 2-4. The chess objects should be sharp and tactile, not a blurry screenshot, flat icons, toy plastic or metallic gold pieces. No floating pieces, no action explosions, no people or hands, no text, no letters or numbers on squares, no logos, no borders around the entire picture, no watermark. Deliver only the finished thumbnail artwork.
```
