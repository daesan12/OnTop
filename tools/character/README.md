# 캐릭터 의상 도구 (Blender 5.2.3)

공용 몸에 새 옷을 넣고 게임 파일로 만드는 스크립트다. 순서·명령·주의할 점은 [docs/character-outfits.md](../../docs/character-outfits.md)를 따른다.

- `add_set.py`: 장군 세트를 기준 빌드에 넣은 스크립트(새 옷은 복사본에서 시작)
- `to_game.py`, `game_pose.py`: 게임용 파일(조각 나눔 `pieces=1`)
- `overlay.py`, `pose_sheet.py`, `look.py`, `render_look.py`, `holes.py`, `check_pieces.py`, `set_art.py`: 맞춰 보기·점검·옷장 그림
- `to_clips.py`: 동작 데이터(모든 캐릭터에 영향, jin2v2와 협의)
