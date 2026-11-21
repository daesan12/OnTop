# Image Gen 생성 기록

모든 이미지는 기본 제공 built-in Image Gen으로 생성했다. API/CLI fallback이나 외부 유료 공급자는 사용하지 않았다.
사용자 실물 사진은 미술 방향의 참고이며 실제 UI 텍스트/조작을 이미지에 합성해 사용하지 않는다.

## 전체 화면 시안 — concept.png

Use case ui-mockup. Design a complete playable Korean Rummikub game screen 1536x1024, polished 2.5D perspective tabletop for existing OnTop board game, matching physical ivory plastic chunky beveled numbered tiles and a matte black three-ledge rack, light honey wood tabletop from user reference. Four players 2-4 supported. Full primary screen, restrained dark green and ochre paper UI. Header text '루미큐브', '내 차례', '첫 등록 30점', pool count '더미 50개'. Opponents at top/side compact name and tile count only. Large uncluttered central open wooden board with 4 clearly spaced valid melds: red 4 5 6, blue 9 10 11, three 12 of red blue black, yellow 2 3 joker 5. Bottom prominent black rack with 14 large ivory tiles on two ledges numbers in red blue black golden yellow only; lower rack and play area viewed from elevated fixed camera, slight 3D physical depth, crisp readable numbers. Bottom controls '색상 정렬', '숫자 정렬', '되돌리기', '타일 뽑기', green primary '턴 확정'. Board actions select tiles then add new meld or choose existing meld, ambiguous joker replacement gets explicit number/color assignment. Small '새 조합' control inside board, selected tile raised. Upper corner '게임 설명', '기권'. No marketing sections, no cards grid, no badges, no extra slogan, code-native buttons/text planned. Keep primary rack entirely visible with enough work space. No imaginary logos. Single coherent achievable frontend design. Materials realistic but clean readable game UI. Show only this primary state, not device mockups, no browser frame.

## 빈 타일 — tile.png (transparent_background=true)

Generate a single production game art asset for a physical Rummikub 2.5D web game matching previous concept: one ivory cream plastic blank tile, portrait aspect 3:4, beveled gently rounded corners, face viewed straight-on with a tiny view of its thick lower ochre shaded edge, realistic softly textured high quality material, soft warm studio light from upper left. Center the tile with 3% transparent margin. Completely blank face, no text no numbers no symbols no logo. True transparent background outside tile. This will be a reusable button background with code-rendered colored numbers. Single tile only, no grid, no other props.

## 빈 받침대 — rack.png (transparent_background=true)

Production game art asset matching the prior Rummikub UI concept. One completely empty matte charcoal black plastic Rummikub tile rack with TWO wide horizontal stepped ledges, broad landscape 4:1 shape, viewed from gently elevated front fixed 2.5D perspective. Subtle realistic plastic grain, raised rear backboard, thick lower lip with soft rim highlights, clean sloping end caps. No tiles at all, no numbers, no text, no logo, no table. Isolated on true transparent background with only a faint close contact shadow. Entire rack centered and uncropped with 3% margin. Intended as scalable backdrop under HTML tile buttons in a web boardgame, practical horizontal straight shelves.

## 선택 그림 — thumbnail.png

Board game selection thumbnail, premium stylized physical Rummikub 2.5D render matching earlier concept. A matte black two-level tile rack holding chunky ivory plastic tiles with clearly legible large numbers: top row blue 4 5 6 and red 10 10, bottom row black 7, blue 7, red 7, golden yellow 7 and a small black joker star tile. Warm honey wood tabletop, dark forest green soft background, gentle warm daylight, elevated frontal three-quarter fixed camera. Tiles have subtle bevels and real thickness. Composition tightly framed but uncropped rack, landscape 3:2, object fills 80 percent. NO text except tile numbers, NO logos, NO watermark, NO UI controls. Clean sophisticated tabletop boardgame art.

## 목재 — wood.png

A production game background texture: warm honey amber beech wood tabletop matching a premium physical Rummikub boardgame photo and previous concept. Flat orthographic overhead view, subtle fine horizontal wood grain, gentle naturally varied warm golden tan, diffuse even daylight with no shadows or hotspots. Seamless-looking continuous wood, no gaps no plank borders no knots no dramatic marks, no frame, no objects no text no logo. Wide landscape 1536x1024. A quiet warm light wood surface allowing high contrast with black tile racks and ivory numbered tiles. Not grey weathered wood.

프로젝트 사용 파일은 `frontend/public/art/rummikub/`에 복사했다. 생성 원본은 Codex generated_images에 보존했다.
