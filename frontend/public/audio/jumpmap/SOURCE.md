# 점프맵 확정 효과음

Suno에서 사용자가 생성하고 이 작업에서 최종 선택·게임 적용을 승인한 8개 효과음이다. 확정 편집본을 재인코딩하지 않고 바이트 그대로 복사했다.

- 석탑: 생성 원본 1.982–2.332초의 후반 구간.
- 방패연: 생성 원본 맨 앞 0.000–0.200초.
- 검은/흰 오목돌은 각각 슬라임 A/B, 붕어빵은 크리미 키캡 A. 예전 테마별 추천 대신 사용자 최종 선택을 따른다.
- 출력 48kHz 모노 / 16bit PCM WAV. 실제 게임 재생에서 속도·음높이·음원 내용을 바꾸지 않는다.
- 기존 공통 SFX 버스에서 음량·음소거를 적용한다. 원격 발판 거리 감쇠와 좌우 팬은 기존 점프맵 흐름을 따른다.
- 게이트 합성음은 기존 방식 유지. 선택한 발판 파일은 착지 때 한 번만 재생하고 방패연 이륙 시 재생하지 않는다.
- 원본 클립과 편집 구간, SHA-256은 selection.json에 기록했다.

| 발판 | 런타임 파일 | 길이 | 선택한 원본 클립 |
|---|---|---:|---|
| 석탑 | `stone.wav` | 0.35초 | [JM_R2_01_stone_A_target0.35s](https://suno.com/song/7d9eec09-5462-4d63-8cfe-155a55425b17) |
| 검은 오목돌 | `gomoku-black.wav` | 0.40초 | [ASMR_R4_03_squishy_slime_A_target0.40s](https://suno.com/song/bfd85e3f-c817-4870-aace-34d2b0191c6c) |
| 흰 오목돌 | `gomoku-white.wav` | 0.40초 | [ASMR_R4_03_squishy_slime_B_target0.40s](https://suno.com/song/3d5f8d37-9555-44af-adc4-509e675f920d) |
| 붕어빵 | `bread.wav` | 0.12초 | [ASMR_R4_07_keycap_creamy_A_target0.12s](https://suno.com/song/1ea26c57-5c52-42dd-bf6f-3ee5afe6ea57) |
| 구름 | `cloud.wav` | 0.25초 | [JM05_cloud_asmr_A_target0.25s](https://suno.com/song/e93f8acc-9e8b-4f13-9deb-fa1939f46d2b) |
| 청사초롱 | `lantern.wav` | 0.12초 | [JM_R2_06_lantern_A_target0.12s](https://suno.com/song/3c4e7774-c641-4be4-81c2-1912f8b46000) |
| 방패연 | `kite.wav` | 0.20초 | [JM07_kite_asmr_A_target0.20s](https://suno.com/song/bf51e768-aa29-485a-9bd7-3bb0fb19e0e8) |
| 연잎 | `lotus.wav` | 0.15초 | [JM12_lotus_sub_A_target0.15s](https://suno.com/song/e6284742-3f81-44a9-abc2-32ab7be475b9) |
