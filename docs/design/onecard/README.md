# 원카드 구도 시안

2026-10-28 갱신: 사용자가 제공한 `card-ability-reference.png`를 카드 설명 배치 기준으로 사용한다. 게임 시점은 초기 생성 시안의 어깨 너머 구도에서 1인칭으로 변경하며, 내 손패와 버튼은 화면에 고정된 2D UI를 유지한다. 능력 이름·짧은 설명을 중앙 정렬하고 일반 카드에는 설명을 넣지 않는다. 초기 생성 이미지와 프롬프트는 작업 이력으로 보존한다.

내장 ImageGen으로 생성한 `over-shoulder-concept.png`를 구도 참조로 사용했다. 사용자에게 별도 시안 승인을 받은 것은 아니다. 실제 제품은 기존 OnTop 3D 캐릭터·공원·테이블을 재사용하고 HTML/CSS 손패·컨트롤을 구현한다. 시안의 사실적인 인물·목재 모델·광원을 새 게임 에셋으로 교체하는 작업은 범위에 포함하지 않는다.

## 생성 프롬프트

Use case: ui-mockup. Create one polished 1536x1024 desktop gameplay UI concept for existing OnTop Korean 3D multiplayer park ONE CARD game redesign. Full main screen, actual gameplay, not a marketing page. Stylized low-poly existing 3D wooden pavilion in a lush green park, wooden rectangular table with dark green felt and a small face-up hearts 6 card plus face-down deck on table. True third person over-the-right-shoulder camera: player's seated avatar's head and shoulder visible near bottom-left, other two or three seated 3D avatars visible around table. Above each other avatar head a small open nameplate with nickname and card count (민지 5장, 준 7장, 하늘 3장). Natural warm light and subdued earthy green palette, cream paper card faces, dark teal card backs, gold accents. Large clear fan of 7 overlapping poker cards across bottom center. Each card has rank/suit visible in its upper left. Legal hearts cards have thin sage green outline and tiny '낼 수 있어요' label, one selected card raised with gold border. One or two non-selected cards visibly flipped to patterned dark teal BACKS, never reveal opponents cards. All cards must fit comfortably, large enough click target. Compact bottom action strip contains Korean labels '선택 카드 내기', '한 장 뽑고 넘기기', '손패 정리'. Above cards small live status '내 차례 · 24초' and '현재 무늬: ♥ 하트'. Small upper right '원카드 규칙' and refresh tools. Keep center 60 percent screen unobstructed to view characters and table. Background is live existing Three.js scene in implementation, do not require replacing assets. All UI controls and text code native HTML/CSS, poker cards code native deterministic UI, existing 3D character assets and table reused. No new logos, icons, marketing headers, dashboards, big side panels, or invented features. Complete coherent app surface as a screenshot. The goal is tangible fan cards with subtle 3D flip and readable controls, minimal furniture over scene. No approval screen or explanatory text around mockup.

## 구현과 시안의 의도적 차이

- 기존 3D 에셋을 유지하므로 사실적인 인물·정자 배경과 픽셀 단위 동일함을 주장하지 않는다. 원카드 화면 구조와 상호작용을 구현 기준으로 사용한다.
- 현재 무늬·공개 카드 요약은 상단 중앙으로 옮겨 손패 위 정보가 겹치지 않게 한다.
- 기존 카드 효과·30초 차례·드로우 후 제출 불가 안내·규칙·기권·복구·선언·신고 경로를 유지한다. 시안에 없던 별도 기능 추가가 아니라 기존 필수 기능이다.
- 제출 버튼은 시안의 일반 문구 대신 선택한 카드명으로 표시한다. 선택 전에는 ‘카드를 선택하세요’를 유지한다.
- 좁은 화면은 5장씩, 데스크톱은 10장씩 묶어 본다. 모든 카드가 접근 가능하고 여러 묶음의 뒤집힌 카드도 한 번에 복구한다.
- 시안의 카드/드로우/정리 버튼 아이콘은 기존 제품에 맞는 동일 벡터 세트가 없어 새 근사 아이콘을 추가하지 않고 텍스트로 명확히 표시한다.
