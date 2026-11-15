# 구구구 줄넘기 확정 사운드 팩 v5

사용자가 확정한 `ontop_jump_rope_audio_final.zip`(사운드 팩 v5)의 12개 오디오를 재인코딩 없이 바이트 그대로 복사했다.
재생 연결과 음량·중복 정책은 `src/jump-rope-preview/jumpRopeAudio.ts`, 이벤트 판정은 `jumpRopeAudioCues.ts`에 있다.

- GOOD·PERFECT(10콤보 이상 포함)는 무음이다. `rope_whoosh`, `jump_pop`, PERFECT 콤보음 등 팩에서 삭제한 소리는 없다.
- MISS는 비둘기 비웃음만 재생한다. 빗자루 피격 순간에는 울리지 않고 다음 줄의 실제 MISS에서 재생한다.
- 공개 전 라이선스 확인 필요: ElevenLabs 보이스(구독 약관), Freesound 445117(Breviceps), Pixabay Whack02.

| 파일 | 길이 | 재생 시점 | 출처 (팩 manifest 기준) |
|---|---:|---|---|
| `bgm_comedy_loop.ogg` | 26.95초 | GO 이후 반복 | 생성 코미디 BGM, 사용자 선택 |
| `sfx/countdown_tick.ogg` | 0.45초 | 3·2·1 각 1회 | 팩 제작음 |
| `sfx/game_go.ogg` | 0.95초 | GO 1회 | 팩 제작음 |
| `sfx/pigeon_miss_laugh.ogg` | 2.00초 | MISS 확정(스턴 MISS 포함) | 사용자 업로드 「비둘기 비웃음 소리」 |
| `sfx/grandpa_enter_voice.ogg` | 2.35초 | 할아버지 등장 1회, BGM 감쇄 | 사용자 업로드 ElevenLabs 생성 보이스 |
| `sfx/broom_windup.ogg` | 0.59초 | 위험 스윙 예고(안전 스윙 제외) | Freesound 392174(BOBtheROSS, CC0) 7.76–8.35초 |
| `sfx/broom_swing.ogg` | 0.59초 | 모든 실제 스윙 | Freesound 392174(BOBtheROSS, CC0) 23.28–23.87초 |
| `sfx/broom_hit.ogg` | 0.50초 | 숙이기 실패 스턴 확정 | Pixabay Whack02 (freesound_community) |
| `sfx/pigeon_flap.ogg` | 0.95초 | 비둘기 비행 방해 시작 | CC0 빗자루 녹음 + 합성 저음 레이어 (실제 비둘기 녹음 아님) |
| `sfx/pigeon_poop_splat.ogg` | 0.54초 | 화면에 똥이 묻는 순간 | Freesound 445117 cartoon-splat (Breviceps), Vorbis 변환만 |
| `sfx/victory_fanfare.ogg` | 1.24초 | 60초 완주 | 팩 제작음 |
| `sfx/game_over.ogg` | 1.16초 | MISS 3회 실패 결과 | 팩 제작음 |

SHA-256

```
01135ef17a894877741ae4e9fa6722f5e96772a1ba6f0f42f565afd355d24de4  bgm_comedy_loop.ogg
c2c98730b6728062284961a8e53ea2b9e66099a01aeef285647cd5c611557a3f  sfx/broom_hit.ogg
d57f87f4b0bc9ecf48d6c3d91180896f81f8761b7a0bf6fee2e17218e473117d  sfx/broom_swing.ogg
96df9e234106630bedaa6ba28c21856fa029fa037c330f2c4f4eeb99e0672707  sfx/broom_windup.ogg
11c8f9f36bbde9b4d5edc405992190dde63a6c077e2c872f482bad2c0d258f6c  sfx/countdown_tick.ogg
7228319946bfcac56d5d343ddcf65930df9f277167e3ea78d136e69d4b481d2f  sfx/game_go.ogg
5f2b934821b5e60663371a5dac3854dd7a2d66d289a0f44643ef080290513a0c  sfx/game_over.ogg
f69dfe42547c9fd0a69f90005c5d05c7962559e8775ef944da8465fb65f016bc  sfx/grandpa_enter_voice.ogg
9a29265cd89fc79c48dd8ac04d9f2baf6df5b14f3dc10d3886f5216339c04c0c  sfx/pigeon_flap.ogg
3ee0ce3058721fcb11f028913a2831e4f6b96ef870c198d81993a11e2afc9163  sfx/pigeon_miss_laugh.ogg
f8d10a7f296b5718e2ac51387aad52857122bc01bad6ede4a378e5e008105acc  sfx/pigeon_poop_splat.ogg
6945a8319e2650effce0b20bb106c06801dc4cc75e4aaafd4ac857bd5f958646  sfx/victory_fanfare.ogg
```
