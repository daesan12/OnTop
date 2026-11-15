# 돌탑 생존전 아트 출처

## 현재 로딩 화면: 실제 게임 모델 렌더 — 2026-11-07

- 현재 `StoneLoadingTips`는 `loading/scene-{tiles,pigeon,dive}-native-{640,1280,1920}.webp` 9개를 사용한다. 아래 기록의 이전 AI 팁 그림은 보존하지만 현재 로딩 화면에서 사용하지 않는다.
- 기존 `man.glb`, `girl.glb`와 `CharacterRig`를 그대로 사용해 얼굴·머리·재킷·반바지·신발을 실제 게임과 맞췄다. 기존 `StoneRumbleTiles`, `pigeonGeometry`, `StoneRumbleEnvironment`와 최신 공원 장면을 재사용했다. 원래 모델의 출처는 `ASSET_CREDITS.md`를 따른다. 모델·리그·실제 맵·게임 판정은 수정하지 않았다.
- 로딩 설명을 위한 정적인 포즈를 별도 브라우저 어댑터에서 렌더했다. 실제 진행 중 경기의 스크린샷이나 생중계로 간주하지 않는다. 제품 로딩 UI는 이 WebP만 읽으며 추가 3D 렌더러를 실행하지 않는다.
- 원본은 가로 1920×1080, 세로 900×1600 PNG다. sharp로 종횡비를 유지해 WebP quality88/effort5로 변환했다. 640px는 세로 전용, 1280/1920px는 가로 전용이다. 합성·색 보정·AI 캐릭터 재생성 없음. 9개 총 911,236bytes, 가로1920px 세 장 455,550bytes, 세로640px 세 장 190,514bytes.
- 별도로 내장 Image Gen을 사용한 전체 화면 UI 시안만 만들었다. 제품에는 AI 시안 속 그림·글자를 넣지 않고 실제 모델 렌더와 React 제목·팁·키캡·실제 준비 인원을 사용한다.
- 원본/생성 시안/전체 프롬프트/렌더 어댑터/출력 SHA-256/모델·리그·맵 소스 SHA-256/검수 이미지는 저장소 밖 `stone-loading-native-20261107/`의 `DESIGN.md`, `render-scenes.cjs`, `v3/`, `native-assets.json`에 보존했다. 로컬 전용이며 외부 업로드·유료 모델 생성·DB 변경 없음.

2026-11-06. 내장 Image Gen 사용. CLI/API 우회 없음.

- `concept.png`: 이 채팅에서 사용자가 요청한 3층 돌탑 생존 게임 콘셉트. 원본 생성 파일 `exec-d99d3b4e-3b01-4ee7-a176-2182eb6f165e.png`를 보존 복사했다. 로비 설명용이며 실제 게임 화면은 3D 코드로 동작한다.
- `park-background.webp`: 같은 콘셉트에서 경기장·캐릭터·HUD를 제거한 별도 배경을 생성하고 sharp로 WebP 변환했다. 색 보정이나 UI를 배경에 합성하지 않았다.
- 캐릭터는 기존 `/art/characters/man.glb`, `girl.glb`; 돌은 기존 `/art/materials/stone-color.webp`; 비둘기는 `src/world/pigeons/pigeonGeometry.ts`를 재사용한다. 게임 HUD의 작은 비둘기 아이콘은 코드 네이티브 SVG다. 원래 에셋의 출처는 기존 `ASSET_CREDITS.md`를 따른다.

배경 생성 프롬프트:

> Create a production background asset extracted from this game's art direction. Wide landscape 16:9 game backdrop, polished soft stylized 3D Korean stone-pagoda park high above the clouds in warm morning light. Remove ALL foreground arenas and tower decks, ALL characters, pigeons, game UI, timers, text, labels, and icons. Keep an uncluttered broad pale blue sky and misty clouds through the entire middle and lower central 70 percent so actual live 3D gameplay can be composited on top. Park greenery and small authentic Korean stone cairns, stone balustrades and a small pavilion only in the distant extreme left and right edges, softly out of focus, framed like the original. Sky true soft light-blue, no tan tint, pleasant dimensional soft lighting. Do not paint a new arena, foreground platform or ground across the center. No text, no logos, no watermark.

2026-11-06 후속 수정: park-background.webp는 초기 시안 기록으로 보존하며 현재 플레이 화면에서는 사용하지 않는다. 실제 배경은 StoneRumbleEnvironment.tsx의 3D 장면이다. 로비의 concept.png는 설명용 이미지로 유지한다.

## 로딩 팁 이미지 — 2026-11-07

내장 Image Gen으로 실제 로컬 게임 스크린샷의 캐릭터·정사각형 석재 발판·비둘기·공원을 참고해 설명용 그림3종을 생성했다. 실시간 게임 화면의 스크린샷을 그대로 표시하는 것이 아니라 해당 게임을 바탕으로 만든 로딩 전용 일러스트다. 게임 배경/모델/발판 판정은 변경하지 않는다. 글자·키캡·준비 인원·버튼은 React UI다.

| 에셋 | 내용 | PNG 원본 이름 | 640px / 1280px WebP 용량 |
| --- | --- | --- | --- |
| `loading/tip-tiles-*.webp` | 밟은 황토색 발판의 지연 붕괴와 다음 돌로 이동 | `exec-160b00de-5fc1-4b6f-8970-3ee8d105b97b.png` | 48,114 / 109,222bytes |
| `loading/tip-pigeon-*.webp` | 비둘기 공격에 맞아 한 칸 밀려나는 상대 | `exec-924f9efb-1178-45b6-9d7c-5d90bc662c05.png` | 43,426 / 100,716bytes |
| `loading/tip-dive-*.webp` | 공중에서 앞으로 한 칸 다이빙하는 슬라이딩 | `exec-682df057-e54c-45d3-abba-0d2fc386e2f5.png` | 37,766 / 85,730bytes |

- 원본1536×1024 PNG는 생성 기본 위치에 보존했다. sharp로 종횡비를 바꾸지 않고640/1280px, WebP quality82/effort5로 변환했다. 별도 합성·색 보정·확대·텍스트 삽입 없음. 전체6개424,974bytes,640px3개129,306bytes.
- 전체 생성 프롬프트: [loading/PROMPTS.md](loading/PROMPTS.md). CLI/API 우회·외부 업로드·유료 에셋 구입 없음.
- 입력 레퍼런스는 최신 dev 기준 공원 통합 로컬 시연의 `07-pigeon-cooldown.png`, `04-cloud-drop.png`다. 실제 회원/운영 정보가 아닌 test classpath 계정 화면을 사용했다. 원본·변환 SHA-256/보존 manifest는 저장소 밖 `stone-loading-art-20261107/`에 기록했다.
