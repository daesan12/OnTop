# 생성 기록

도구: OpenAI 내장 Image Gen. 사용자 요청에 따라 공원 분위기의 에셋을 다시 생성했다. `cover.webp`는 생성한 래스터 대표 그림이고, 게임 중 타일·테이블은 Three.js 코드 모델이다. 생성 이미지의 원본 사진이나 실물 제품의 공식 아트는 사용하지 않는다.

최종 대표 그림 프롬프트:

> Landscape 3:2 polished 3D game selection cover illustration for a Korean traditional park board game. A small solid walnut wooden tray with a deep forest-green felt inset on a pavilion timber table, in soft park daylight. Foreground 5 upright slightly rounded ivory and matte charcoal black number tiles with large clean centered numerals 1,3,6,9,11 in contrasting ink, thin inset gold double engraved borders and tiny brass-gold foot ridge. Their numbers face camera and are unobscured. Opposite row shows only blank framed backs. Central two black/ivory face-down tiles, one white tile lying face-up with 7. Restrained hand-crafted Korean style wood joinery, dark green pavilion rail blurred and muted pine shapes in distant park, warm hanji ivory highlights, subtle realistic shadows. No people, no branding, no text or labels apart from tile numerals, no interface, no badges, no cardboard boxes. Readable simple composition at thumbnail scale. This must harmonize with OnTop's Korean park hanji/green/gold design.

워크스페이스 파일: `frontend/src/game/davinci/assets/cover.webp` (768×512). 생성 원본을 로컬 sharp로 크기 축소·WebP 변환했다. 게임 입력이나 숫자 판정에 이 그림을 사용하지 않는다.
