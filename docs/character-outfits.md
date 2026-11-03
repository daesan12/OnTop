# 캐릭터 의상 만들기 (마이룸 부위별 옷)

장군 세트를 만든 방법을 그대로 따라 새 옷을 만들 수 있게 정리한 문서다. 2026-11-02 기준이며 관련 이슈는 S15P31B105-319다.

## 1. 구조 한눈에 보기

- **공용 몸 하나 + 다섯 부위.** 남자·여자는 같은 몸을 쓰고 머리·얼굴·색만 다르다. 옷은 몸 위에 덧입는 다섯 부위(머리 `HAIR`, 얼굴 `FACE`, 상의 `TOP`, 하의 `BOTTOM`, 신발 `SHOES`)다.
- **의상 문자.** 기준 빌드 안의 의상은 문자로 구분한다. 이미 쓴 문자는 `a`~`g`(남자 기본 `b`·`d`, 여자 머리 `e`, 장군 `g`)이고, 새 옷은 `h`부터 쓴다.
- **몸 조각.** 의상에 가려지는 몸은 `body__TOPd_BOTTOMg`처럼 가리는 의상 이름이 붙은 조각으로 잘려 있다. 이 조각은 그 의상 중 하나라도 입으면 숨는다. 의상 조각 `item__BOTTOM__d__under_TOPb`는 `TOP b`를 함께 입으면 숨는다.
- **게임 파일**(`frontend/public/art/characters/`):
  - `man.glb`, `girl.glb`: 공용 몸의 모든 조각 + 그 캐릭터의 기본 옷.
  - `outfits/<이름>.glb`: 그 옷의 부위 조각만 담는다. 누군가 처음 입을 때만 내려받는다.
  - 각 메시의 `extras.pieces`에 조각 이름과 범위가 들어 있고, 게임은 입은 옷에 맞는 조각만 그린다(`frontend/src/world/art/characterLook.ts`).
- **아이템과 연결.** DB `items.image_key`를 `outfit/<파일>/<의상 문자>`로 적으면 그 조각을 입힌다(예: 장군 `outfit/general/g`). 같은 세트는 `items.set_code`를 같은 값으로 둔다. 세트는 한 벌로만 입고 벗는다(`docs/shop-inventory.md`의 세트 항목).

- **운영에서는 아직 꺼져 있다.** 옷장 의상은 개발 빌드(`VITE_WARDROBE_OUTFITS=true`, `frontend/vercel.dev.json`과 `Jenkinsfile`)와 로컬 개발에서만 켜진다. 운영 빌드에서는 다음처럼 동작한다(`frontend/src/features/wardrobe/feature.ts`).
  - 옷장에 의상 목록이 나오지 않고 "의상은 곧 열려요"가 보인다.
  - 서버가 장착 정보를 보내도 모든 캐릭터가 기본 옷을 입는다.
  - 운영에 열 때는 운영 빌드 명령에 `VITE_WARDROBE_OUTFITS=true`를 넣는다.

## 2. 준비물

- Blender 5.2.3 (명령줄 `blender -b`로 실행한다).
- 이 저장소의 `tools/character/` 스크립트.
- **기준 빌드 파일**은 `docs/character-outfits/`에 있다.
  - `shared_layers_gf.glb`(약 35 MB): 공용 몸, 지금까지의 모든 의상(`a`~`g`), 몸 조각, 뼈대, 동작이 들어 있다. 새 옷은 이 파일에 넣는다.
  - `outfit_d_pink.jpg`: 여자 기본 상의·신발의 분홍 색 이미지(여자 파일을 다시 만들 때 쓴다).
  - 새 옷을 넣은 빌드는 새 문자 이름(예: `shared_layers_h.glb`)으로 이 폴더에 올리고, 이전 기준 파일은 지운다. 이 문서의 파일 이름도 함께 고친다. 큰 파일이라 올릴 때마다 저장소가 그만큼 커지니, 옷이 완성됐을 때 한 번만 올린다.
- Gemini(디자인 시트 편집)와 Tripo(3D 생성) 계정. Tripo는 크레딧을 쓴다(부품 생성 약 60, 4K 텍스처 약 20).

## 3. 만드는 순서

아래 명령의 `B`는 Blender 실행 파일이다. 모든 명령은 저장소 최상위에서 실행한다고 가정한다.

### ① 디자인 시트

1. 공용 몸 시트를 기준으로 옷을 입힌 이미지를 Gemini로 만든다. 공용 몸의 T자 시트를 쓴다.
   - 팔을 내린 자세 시트(`pose_sheet.py`)로 만든 장군은 Tripo의 팔이 몸과 맞지 않아 소매·어깨판이 뭉쳐서 버렸다.
2. 앞·옆·뒤가 다 보이는 시트여야 한다. 아래가 잘린 이미지는 Tripo에서 다리가 짧게 나온다.

### ② Tripo로 3D 만들기

1. 멀티뷰로 **Generate in Parts**(부품 나누기)를 켜고 만든다.
2. 텍스처는 4K로 만든다. 내보내기 창에서도 해상도를 다시 골라야 한다(기본값이 2K).
3. 부품이 나뉜 GLB(예: `general_outfit_parts.glb`)를 받는다.

### ③ 크기 맞추기

몸과 옷의 앞·옆 실루엣을 겹쳐 보고 배율 `s`를 정한다(장군은 1.2).

```bash
"$B" -b --python tools/character/overlay.py -- docs/character-outfits/shared_layers_gf.glb new_outfit_parts.glb out/fit s=1.2
```

### ④ 기준 빌드에 새 옷 넣기

`tools/character/add_set.py`가 장군을 넣은 스크립트다. 공통 단계는 다음과 같다.

- 배율 맞추기.
- 부품을 부위로 나누기(`SLOT_PARTS`).
- 몸 밖으로 2 mm 밀어내기.
- 몸에서 뼈 가중치 가져오기.
- 가려지는 몸 조각 자르기와 이름 붙이기.

나머지 옵션은 대부분 장군 전용 보정이다(검은 모자, 끈, 옷깃 안감, 속옷, 어깨판, 팔 고리, 투구 칠). 이 보정들은 Tripo 부품 번호(`tripo_part_N`)로 대상을 고르기 때문에, 다른 옷에 그대로 쓰면 엉뚱한 부품을 고친다. 새 옷은 이렇게 시작한다.

1. `add_set.py`를 `add_set_<이름>.py`로 복사한다.
2. `SLOT_PARTS`를 새 옷의 부품 번호로 바꾼다. 부품 번호는 Blender에서 GLB를 열어 확인한다.
3. 장군 전용 블록을 지우거나 끈다.
4. 새 문자로 실행한다.

```bash
"$B" -b --python tools/character/add_set_new.py -- docs/character-outfits/shared_layers_gf.glb new_outfit_parts.glb shared_layers_h.glb set=h s=1.2
```

가중치와 가려지는 몸을 정할 때 지킨 규칙:

- **상의·하의에는 머리·목 가중치를 넣지 않는다.** 옷깃이 턱을 따라 움직인다. 대신 `Spine2`로 보낸다.
- **딱딱한 조각(갑옷 판 등)은 한 뼈에만 붙인다.** 팔·쇄골을 반반 섞으면 팔을 내릴 때 판이 찌그러진다.
- **가려지는 몸은 몸 부위(각 면의 주된 뼈)로 정한다.** 광선 검사로 정하면 판 사이 틈으로 몸이 보였다.
  - 상의는 몸통·팔을 가리지만 목은 남긴다.
  - 하의는 엉덩이·다리를 신발 테두리 위까지 가린다.
  - 신발은 그 아래를 가린다.
- **조각 이름은 `_1`, `_2`로 붙인다.** `.001`처럼 점을 쓰면 three.js가 점을 지워서 규칙 해석이 깨진다.
- **부품의 작은 구멍(30변 이하)은 메운다.** Tripo 부품에는 구멍이 자주 있다.

### ⑤ 빌드 확인

임의 방향에서 그려 본다(`POSE=idle:100`으로 자세를 줄 수 있다).

```bash
"$B" -b --python tools/character/look.py -- out/front.png 0,-1,0.1 0,0,0.8 1.2 shared_layers_h.glb
```

### ⑥ 게임용 파일 만들기

새 옷 파일 하나와, 새 몸 조각이 들어간 남자·여자 파일을 다시 만든다. 남자·여자를 다시 만들지 않으면 새 옷을 입었을 때 그 밑의 몸이 숨지 않는다.

```bash
# 새 옷 (몸 없이 의상 조각만)
"$B" -b --python tools/character/to_game.py -- shared_layers_h.glb out/newoutfit_raw.glb newoutfit HAIR=h TOP=h BOTTOM=h SHOES=h pieces=1 body=0 near=60000 atlas=2048 fill=1
# 남자 기본 / 여자 기본
"$B" -b --python tools/character/to_game.py -- shared_layers_h.glb out/man_raw.glb man HAIR=b TOP=d BOTTOM=d SHOES=d pieces=1 near=32000 fill=1 keep_edges=pieces
"$B" -b --python tools/character/to_game.py -- shared_layers_h.glb out/girl_raw.glb girl HAIR=e TOP=d BOTTOM=d SHOES=d tex=TOP:docs/character-outfits/outfit_d_pink.jpg,SHOES:docs/character-outfits/outfit_d_pink.jpg pieces=1 near=32000 fill=1 keep_edges=pieces
```

옵션 설명은 `to_game.py` 맨 위에 있다. 요점:

| 옵션 | 뜻 | 쓰는 곳 |
| --- | --- | --- |
| `pieces=1` | 조각을 나눠 담는다 | 모든 게임 파일 |
| `body=0` | 몸을 빼고 의상만 담는다 | 의상 파일 |
| `near` | 가까이 볼 때의 삼각형 수 | 기본 캐릭터 32000, 장군 60000 |
| `fill=1` | 비어 있는 텍스처 칸을 원래 색으로 채운다. 끄면 얼굴·갑옷에 검은 점이 생긴다 | 항상 |
| `keep_edges=pieces` | 조각 경계만 고정하고 나머지는 자유롭게 줄인다 | 남자·여자 |
| `keep_edges=1`(기본) | 색 경계·텍스처 이음매·머리 부분까지 고정한다 | 장식이 가는 옷(장군 투구 불꽃, 팔 고리) |
| `atlas` | 텍스처 크기 | 2048 |

남자·여자에 `keep_edges=1`을 쓰면 줄일 곳이 얼굴로 몰려 얼굴이 각진다.

### ⑦ 압축해서 넣기

```bash
cd frontend
node scripts/prepare-characters.mjs man=../out/man_raw.glb girl=../out/girl_raw.glb outfit:newoutfit=../out/newoutfit_raw.glb
```

- 결과는 `public/art/characters/`(의상은 `outfits/`)에 들어가고 `manifest.json`이 갱신된다.
- 참고 크기는 남자 2.00 MB, 여자 1.97 MB, 장군 2.65 MB다.
- 캐릭터 파일을 바꾸면 `src/world/art/characterAssets.ts`의 `?rig=` 번호와 `src/world/art/outfitSources.ts`의 번호를 올린다(브라우저 캐시 때문).
- 바꾼 코드 파일이 `tests/fixtures/parkVisualCheckpoint.json`에 고정돼 있으면 그 해시도 갱신한다.

### ⑧ 그림으로 점검

- **입은 모습:** 숨길 조각을 빼고 그린다.

  ```bash
  "$B" -b --python tools/character/render_look.py -- out/man_raw.glb out/look HAIR=man/b TOP=newoutfit/h BOTTOM=newoutfit/h SHOES=man/d
  ```

- **구멍·검은 점:** 배경을 자홍색으로 그린다. 구멍은 자홍, 칠해지지 않은 텍스처는 검정으로 보인다.

  ```bash
  "$B" -b --python tools/character/holes.py -- out/newoutfit_raw.glb out/holes
  ```

- **조각별 높이:** 조각 이름이 엉뚱한 곳에 붙지 않았는지 본다.

  ```bash
  "$B" -b --python tools/character/check_pieces.py -- out/man_raw.glb
  ```

### ⑨ 옷장 그림

- 세트는 카드 한 장으로 보이고 그림은 `frontend/src/features/wardrobe/parts/set-<세트 코드 소문자>.webp`(320 px, 투명 배경)다.
- 옷 전체를 입은 캐릭터를 `set_art.py`로 그린 뒤 잘라서 넣는다. 원본은 몸까지 넣은 빌드여야 한다(예: `to_game.py`를 `pieces` 없이 실행한 결과).

  ```bash
  "$B" -b --python tools/character/set_art.py -- out/newoutfit_whole_raw.glb out/set.png
  ```

- 세트가 아닌 옷은 아직 부위 기본 그림을 옷 이름의 색 낱말로 다시 칠해 쓴다(`itemArt.ts`).

### ⑩ 아이템 등록과 로컬 확인

아이템 행 예시(로컬 테스트 DB 전용이다. 실제 판매 이름·가격은 따로 정한다):

```sql
INSERT INTO items (item_code, name, item_type, equip_slot, price, image_key, is_for_sale, set_code) VALUES
 ('GENERAL_HAIR', '장군 투구', 'EQUIPMENT', 'HAIR', 0, 'outfit/general/g', FALSE, 'GENERAL'),
 ('GENERAL_TOP', '장군 갑옷', 'EQUIPMENT', 'TOP', 0, 'outfit/general/g', FALSE, 'GENERAL');
```

- 부위별로 따로 파는 옷은 `set_code`를 `NULL`로 둔다.
- 로컬 서버는 `scripts/start-frontend-test.ps1`로 띄운다. 상점을 켜려면 다음 환경 변수가 필요하다.
  - `ONTOP_SHOP_ENABLED=true`
  - `SPRING_FLYWAY_LOCATIONS`에 `classpath:db/shop` 추가
- 옷장에서 확인할 것:
  - 미리보기를 누르면 내 캐릭터에 바로 입혀진다.
  - 입기 / 벗기가 저장된다.
  - 다른 계정 화면에도 같은 모습으로 보인다.
  - 걷기·달리기·앉기를 해 봐도 옷이 뚫리거나 몸이 비치지 않는다.

## 4. 겪은 문제와 해결

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 얼굴·갑옷·투구 띠에 작은 검은 점 | 텍스처 지도의 아주 작은 조각이 색칠되지 않고 검은 바탕으로 남음 | `fill=1` |
| 가는 장식(불꽃) 위에 뒤쪽 검은색이 칠해짐 | 새로 펼친 텍스처 섬이 앞뒤 면을 한 섬으로 묶어 겹침 | `unwrap=split`(기본값) |
| 고리 무늬가 삐죽삐죽하게 깨짐 | 삼각형을 줄이며 색 경계가 무너짐 | `keep_edges=1` |
| 기본 캐릭터 얼굴이 각짐 | 고정점이 많아 줄일 곳이 얼굴로 몰림 | 남자·여자는 `keep_edges=pieces` |
| 걸을 때 어깨판이 앞으로 돌며 구겨짐 | 걷기 동작의 위팔 비틀림을 판이 그대로 따라감 | 판을 쇄골에만 붙이기. 동작 데이터를 고치는 방법은 모든 캐릭터에 영향이 있어 jin2v2와 협의 |
| 부위를 바꿨는데 밑의 몸이 비침 | 남자·여자 파일에 새 옷의 몸 조각이 없음 | ⑥에서 남자·여자도 다시 빌드 |
| 옷 이름 규칙이 안 먹음 | 조각 이름에 `.001` | `_1`로 이름 붙이기 |

## 5. 협의할 곳

- **캐릭터 파일·뼈대·동작 데이터:** jin2v2. 남자·여자 파일을 다시 만들거나 `characterClips.json`을 바꿀 때 먼저 알린다.
- **상점 API·DB(아이템, 세트, 해제):** 상점 담당. 실제 판매 아이템은 담당자와 정해서 넣는다.
- **Tripo 크레딧:** 쓰기 전에 팀과 정한다.
