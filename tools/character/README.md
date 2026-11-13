# 캐릭터 의상 도구 (Blender 5.2.3)

공용 몸에 새 옷을 넣고 게임 파일로 만드는 스크립트다. 순서·명령·주의할 점은 [docs/character-outfits.md](../../docs/character-outfits.md)를 따른다.

- `add_set.py`: 장군 세트를 기준 빌드에 넣은 스크립트(새 옷은 복사본에서 시작)
- `to_game.py`, `game_pose.py`: 게임용 파일(조각 나눔 `pieces=1`)
- `overlay.py`, `pose_sheet.py`, `look.py`, `render_look.py`, `holes.py`, `check_pieces.py`, `set_art.py`: 맞춰 보기·점검·옷장 그림
- `to_clips.py`: 동작 데이터(모든 캐릭터에 영향, jin2v2와 협의)
- `skin_match.py`: Tripo 부품의 피부색을 공용 몸 피부색에 맞춤(근육 운동복, 병아리 발목)
- `split_part.py`: Tripo 부품 하나를 높이로(허수아비의 머리·조끼, 테크웨어 상하의), 또는 피부색으로(`by_skin=1`, 제빵사의 모자·얼굴) 나눔
- `chick_prep.py`: 병아리 부품 0을 후드·날개 소매·몸판·아랫단으로 나누고 소매를 들어 올림
- `cat_prep.py`: 고양이 우주복 부품을 공용 몸 어깨·팔에 맞추고 목걸이 안쪽 고리·다리 구멍 띠를 더함
- `chicken_prep.py`: 치킨 다리 튀김옷을 목에서 후드·몸판으로 나누고(후드가 몸판 표면을 4.5 cm 겹쳐 가짐), 맨팔의 주황 면을 피부색으로 바꿈
- `skin_cover.py`: 통합 스킨 파일을 입은 모습 그대로 대표 그림으로 그림(후드처럼 얼굴이 보여야 하는 옷)
- `lift_arms.py`: T자보다 처진 소매를 공용 몸 팔 높이로 올림(제빵사)
- `shrink_items.py`: 기준 빌드 안 새 세트의 면 수를 줄임(빌드 크기)
- `fit_cards.mjs`: `item_art.py` 그림을 옷장 카드 규격(320 px, 긴 쪽 232 px, WebP)으로 맞춤
