# 지하 미궁 녹음 효과음 (#450)

`horrorAudio.ts`가 지하에 들어갈 때 한 번 불러와 합성음 위에 겹친다. 못 불러오면 합성음만 난다.
모두 OpenGameArt의 **CC0**(퍼블릭 도메인) 자료이고, 모노 48kHz Ogg Opus 40kbps로 자르고 줄였다
(`Desktop/character_work/horror_sounds/make_clips.py`, 블렌더 내장 aud로 변환).

| 파일 | 원본 | 묶음 · 만든 사람 |
| --- | --- | --- |
| hit-low.ogg | Very Bassy 3.wav | [Horror Hit Soundpack 1](https://opengameart.org/content/horror-hit-soundpack-1) · psychhead_ |
| hit-deep.ogg | Bassy 5.wav | 〃 |
| hit-mid.ogg | Mid 7.wav | 〃 |
| scream-a.ogg | scream_01.ogg | [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) · rubberduck |
| scream-b.ogg | scream_02.ogg | 〃 |
| roar-low.ogg | monster_04.ogg | 〃 |
| growl-low.ogg | monster_07.ogg | 〃 |
| breath.ogg | breath.ogg | 〃 |
| roar-a.ogg | monster-1.wav | [Monster Sound Effects 2](https://opengameart.org/content/monster-sound-effects-2) · Ogrebane |
| snarl-a.ogg | monster-4.wav | 〃 |
| moan-a.ogg | qubodup-GhostMoan01.wav | [Ghost Monster Voice Moaning & Growling](https://opengameart.org/content/ghost-monster-voice-moaning-growling) · qubodup |
| moan-b.ogg | qubodup-GhostMoan03.wav (0–5.2초) | 〃 |
| moan-c.ogg | qubodup-GhostMoan05.wav | 〃 |
| dread.ogg | horror_effect2.wav (3.5–12초) | [Horror SFX](https://opengameart.org/content/horror-sfx) · TinyWorlds |

## 쓰는 곳
- 깜짝 연출: 시작부터 `dread`가 차오르고, 괴물이 보일 때 괴물마다 목소리(`VOICES`), 달려들 때 비명(`scream-*`) + 포효(`roar-low`), 불이 꺼질 때 타격음(`hit-*`).
- 기척: 귓가 속삭임 뒤 숨소리(`breath`), 먼 쾅 소리(`hit-mid`)와 대답하는 신음, 사라지는 형체(`moan-c`).
- 배경: 가끔 멀리서 느리게 들리는 신음(`moan-*`).
