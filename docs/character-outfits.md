# 캐릭터 의상 만들기 (마이룸 머리·얼굴·옷)

장군 세트와 갓·도포를 만든 방법을 그대로 따라 새 옷을 만들 수 있게 정리한 문서다.

- 처음 작성은 2026-11-02(S15P31B105-319)이다.
- 2026-11-05에 마이룸을 머리·얼굴·옷 세 칸으로 바꾼 내용(S15P31B105-338)과, 갓·도포를 만들며 쓴 옵션(S15P31B105-331)을 더했다.

## 1. 구조 한눈에 보기

- **공용 몸 하나 + 다섯 부위.** 남자·여자는 같은 몸을 쓰고 머리·얼굴·색만 다르다. 옷은 몸 위에 덧입는 다섯 부위(머리 `HAIR`, 얼굴 `FACE`, 상의 `TOP`, 하의 `BOTTOM`, 신발 `SHOES`)다.
- **마이룸은 세 칸이다: 머리 · 얼굴 · 옷.**
  - 머리와 얼굴은 각각 따로 입는다. 몸을 거의 가리지 않아 어떤 옷과도 섞어 써도 된다(장군 투구·선글라스로 확인).
  - 옷은 상의·하의·신발을 **한 벌로만** 입는다. 한 부위라도 입으면 나머지 옷 부위는 그 한 벌(세트)이나 기본 옷으로 바뀐다(`docs/shop-inventory.md`의 "옷 한 벌").
  - 데이터의 부위는 그대로 다섯 개다. 세 칸은 옷장 화면과 장착 규칙에서만 나뉜다.
  - 그래서 새 옷은 **자기 한 벌을 입었을 때만** 맞으면 된다. 다른 상의·하의·신발과 섞어 입는 경우는 생기지 않는다.
  - 부위별로 섞어 입게 했을 때는 바지가 다른 상의를 뚫거나, 바지 없이 신발만 신으면 발목이 비는 문제가 옷마다 생겼다.
- **캐릭터별 조각.** `item__HAIR__h__for_girl`처럼 `__for_man`/`__for_girl`이 붙은 조각은 그 캐릭터에게만 보인다(④-2).
- **의상 문자.** 기준 빌드 안의 의상은 문자로 구분한다. 이미 쓴 문자는 `a`~`j`(남자 기본 `b`·`d`, 여자 머리 `e`, 장군 `g`, 갓·도포 `h`, 투구 아래 여자 앞머리 쪽머리 `i`, 갓 아래 여자 기본 머리 모양의 낮은 쪽머리 `j`, 사또 `k`, 근육 운동복 `l`, 비둘기 옷 `m`, 허수아비 옷 `n`, 병아리 `o`, 사이버펑크 테크웨어 `p`, 제빵사 `q`, 힙한 스트릿웨어 `r`)이고, 새 옷은 `s`부터 쓴다.
  - 숨김 규칙은 부위와 문자(`TOPl`, `HAIRm`)만 보고 파일은 보지 않는다. 그래서 문자는 모든 옷을 통틀어 하나씩만 쓴다.
- **몸 조각.** 의상에 가려지는 몸은 `body__TOPd_BOTTOMg`처럼 가리는 의상 이름이 붙은 조각으로 잘려 있다. 이 조각은 그 의상 중 하나라도 입으면 숨는다. 의상 조각 `item__BOTTOM__d__under_TOPb`는 `TOP b`를 함께 입으면 숨는다.
- **게임 파일**(`frontend/public/art/characters/`):
  - `man.glb`, `girl.glb`: 공용 몸의 모든 조각 + 그 캐릭터의 기본 옷.
  - `outfits/<이름>.glb`: 그 옷의 부위 조각만 담는다. 누군가 처음 입을 때만 내려받는다.
  - 각 메시의 `extras.pieces`에 조각 이름과 범위가 들어 있고, 게임은 입은 옷에 맞는 조각만 그린다(`frontend/src/world/art/characterLook.ts`).
- **아이템과 연결.** DB `items.image_key`를 `outfit/<파일>/<의상 문자>`로 적으면 그 조각을 입힌다(예: 장군 `outfit/general/g`).
  - 한 벌인 옷은 상의·하의·신발에 `items.set_code`를 같은 값으로 둔다(장군 `GENERAL`, 갓·도포 `DOPO`, 사또 `SATTO`, 근육 `MUSCLE`, 비둘기 `PIGEON`, 허수아비 `SCARECROW`, 병아리 `CHICK`, 테크웨어 `CYBER`, 제빵사 `BAKER`, 스트릿웨어 `STREET`). 세트는 한 벌로만 입고 벗는다.
  - 머리·얼굴 아이템에는 `set_code`를 두지 않는다(따로 쓴다).

- **운영에서는 아직 꺼져 있다.** 옷장 의상은 개발 빌드(`VITE_WARDROBE_OUTFITS=true`, `frontend/vercel.dev.json`과 `Jenkinsfile`)와 로컬 개발에서만 켜진다. 운영 빌드에서는 다음처럼 동작한다(`frontend/src/features/wardrobe/feature.ts`).
  - 옷장에 의상 목록이 나오지 않고 "의상은 곧 열려요"가 보인다.
  - 서버가 장착 정보를 보내도 모든 캐릭터가 기본 옷을 입는다.
  - 운영에 열 때는 운영 빌드 명령에 `VITE_WARDROBE_OUTFITS=true`를 넣는다.

## 2. 준비물

- Blender 5.2.3 (명령줄 `blender -b`로 실행한다).
- 이 저장소의 `tools/character/` 스크립트.
- **기준 빌드 파일**은 `docs/character-outfits/`에 있다.
  - `shared_layers_r.glb`(약 122 MiB): 공용 몸, 지금까지의 모든 의상(`a`부터 `r`까지), 몸 조각, 뼈대, 동작이 들어 있다. 새 옷은 이 파일에 넣는다.
    - 사또 작업의 `hk.glb`에 `l`·`m`·`n`을 넣은 `shared_layers_n.glb`(④-4)에 `o`·`p`·`q`·`r`을 넣은 것이다(④-5). 지금의 `man.glb`·`girl.glb`는 이 빌드로 만들었다.
    - 사또 옷깃 보정(`flat_collar.py`, ④-3)과 갓·장군 모자 아래 남녀별 머리(`hat_hair.py`, ④-2)는 옷 파일을 만들 때 따로 거친 단계라 이 빌드에는 없다. 갓·장군·사또 옷 파일을 다시 만들 때는 그 단계를 다시 거친다.
  - `outfit_d_pink.jpg`: 여자 기본 상의·신발의 분홍 색 이미지(여자 파일을 다시 만들 때 쓴다).
  - 새 옷을 넣은 빌드는 새 문자 이름(예: `shared_layers_h.glb`)으로 이 폴더에 올리고, 이전 기준 파일은 지운다. 이 문서의 파일 이름도 함께 고친다. 큰 파일이라 올릴 때마다 저장소가 그만큼 커지니, 옷이 완성됐을 때 한 번만 올린다.
- Gemini(디자인 시트 편집)와 Tripo(3D 생성) 계정. Tripo는 크레딧을 쓴다(부품 생성 약 60, 4K 텍스처 약 20).

## 3. 만드는 순서

아래 명령의 `B`는 Blender 실행 파일이다. 모든 명령은 저장소 최상위에서 실행한다고 가정한다.

### ① 디자인 시트

1. 공용 몸의 T자 시트를 그린다(앞·오른쪽·뒤·왼쪽, 2x2).

   ```bash
   "$B" -b --python tools/character/pose_sheet.py -- docs/character-outfits/shared_layers_r.glb out/body_t.png size=1024 pose=t
   ```

   - 팔을 내린 자세 시트(`pose=t` 없이)로 만든 장군은 Tripo의 팔이 몸과 맞지 않아 소매·어깨판이 뭉쳐서 버렸다.
2. Gemini의 **이미지 만들기** 도구(+ 메뉴)에 이 시트와 옷 그림을 올리고, 비율은 1:1로 한다. 도구 없이 보내면 응답이 멈춘다.
   - 요청에는 "같은 몸·얼굴·T자 자세·네 방향·배치·흰 배경 유지, 소품 없음"을 꼭 넣는다(갓·도포 때 쓴 문장은 S15P31B105-331 참고).
3. 앞·옆·뒤가 다 보여야 한다. 아래가 잘린 이미지는 Tripo에서 다리가 짧게 나온다.

### ② Tripo로 3D 만들기

1. 시트를 네 장으로 잘라 멀티뷰(Front·Left·Right·Back)에 올리고 **Generate in Parts**(부품 나누기, Balanced)를 켜고 만든다.
   - Left는 캐릭터의 왼쪽이 보이는 그림(얼굴이 화면 왼쪽을 향함)이다. 우리 시트에서는 오른쪽 아래 칸이다.
2. 텍스처는 4K로 만든다. 내보내기 창에서도 해상도를 다시 골라야 한다(기본값이 2K).
3. 부품이 나뉜 GLB(예: `general_outfit_parts.glb`)를 받는다.

### ③ 크기 맞추기

몸과 옷의 앞·옆 실루엣을 겹쳐 보고 배율 `s`를 정한다(장군 1.2, 갓·도포 1.065). 손·발 위치를 비교하면 빠르다.
생성된 캐릭터는 머리가 공용 몸보다 작게 나오는 경우가 많다. 이때 머리 쪽은 ④의 `head_fit`으로 따로 맞춘다.

```bash
"$B" -b --python tools/character/overlay.py -- docs/character-outfits/shared_layers_r.glb new_outfit_parts.glb out/fit s=1.2
```

### ④ 기준 빌드에 새 옷 넣기

새 옷은 `tools/character/fit_outfit.py`를 쓴다. `add_set.py`(장군)에서 장군 전용 보정을 뺀 범용 스크립트다.

```bash
"$B" -b --python tools/character/fit_outfit.py -- docs/character-outfits/shared_layers_gf.glb new_outfit_parts.glb shared_layers_h.glb set=h s=1.065 head_fit=4 "map=HAIR:0,1;TOP:12,2,3,5,9;BOTTOM:7,10;SHOES:6,8" skirt=TOP pants=1 sleeve_drape=0.4 sleeves=3,5 under_tops=1 cull=1 lining=1 v_cut=-0.0088,0.498,-0.040,0.602,0.034,0.602 v_cut_margin=0.012 lining_down=0.09 pants_hem=0.003 shoe_level=1 shoe_level_up=-0.001 shoe_level_r=0.075 dark_lining=SHOES clean_dark=TOP predecimate=0:5000 shoe_cap=1 shoe_cap_depth=0.01 clean_skin=TOP brighten=TOP,BOTTOM despeck=1 pants_full=1.7 pants_low=1.55 neck_poke=1 push_neck=back rim_neck=20 rim_neck_down=0.07 neck_tone=1 lining_tone=skin v_cut_up=0 lining_up=0.006 lining_front=-0.015 "seam=12>3,5" under_layer=1 under_layer_sink=0.012 under_skirt=0.15 skirt_leg=0.9 hair_trim=0.845,-0.12
```

위는 갓·도포(세트 h)를 만든 그대로의 명령이다(그때의 기준 빌드 `shared_layers_gf.glb`는 지금 `shared_layers_r.glb`로 바뀌었다). 숫자 값(`v_cut` 좌표 등)은 이 옷에 맞춘 것이라 새 옷에서는 다시 잰다.

| 옵션 | 뜻 |
| --- | --- |
| `map=` | 부위별 Tripo 부품 번호. 적지 않은 부품(생성된 얼굴·손·맨다리)은 버린다. 번호는 부품을 하나씩 그려 확인한다 |
| `s`, `dx/dy/dz` | 몸통·팔다리 쪽 배율과 이동 |
| `head_fit=N` | 생성된 얼굴(부품 N)을 공용 몸 얼굴에 맞춰, 머리(HAIR)·얼굴(FACE) 부품을 그 크기로 옮긴다 |
| `skirt=TOP` | 그 부위의 허리 아래(도포 자락·치마)를 엉덩이에 매달아 다리 사이로 갈라지지 않게 한다 |
| `skirt_leg=0.9` | 무릎 높이에서 자락이 다리를 따라가는 비율(기본 0.5). 낮으면 달릴 때 무릎·다리가 자락을 뚫고 나오고, 높으면 다리 사이에서 조금 갈라진다 |
| `fill=BOTTOM` | 그 부위가 숨기는 몸 중 옷이 덮지 않은 곳을 몸 표면으로 옷을 만들어 채운다. 긴 겉옷에 가려 Tripo가 바지 윗부분을 만들지 않았을 때 쓴다(안 쓰면 짧은 상의와 입을 때 허벅지가 구멍). 옷이 한 벌로만 입히는 지금은 필요 없을 때가 많다 |
| `sleeve_drape=0.4 sleeves=N,M` | T자에서 팔 아래로 늘어진 넓은 소매를 줄인다. 팔을 내리면 옆·뒤로 날개처럼 튀어나온다 |
| `stiff` | 부품 안에서 가중치를 평균 내는 반경(기본 0.03 m) |
| `pants=1` | Tripo 바지 대신 몸 표면으로 바지를 새로 만든다(허리·밑단을 수평으로 자름). `pants_hem`은 밑단이 신발 테두리 아래로 내려가는 길이 |
| `under_tops=1` | 바지가 겉옷을 뚫고 나오는 곳을 상의별로 따로 가려지는 조각(`under_TOP…`)으로 나눈다. 한 벌 구조에서는 자기 세트 상의(`under_TOPh` 등) 조각만 실제로 쓰인다 |
| `lining=1` | V자 옷깃 안쪽을 몸 표면으로 만든 안감으로 깨끗하게 채운다(앞쪽만. 뒤에 두면 등에 회색 얼룩이 비침) |
| `v_cut=ax,az,lx,lz,rx,rz` | V자 옷깃을 V의 아래 꼭짓점 A에서 왼쪽·오른쪽 위 모서리 L·R로 가는 두 직선으로 잘라 곧게 만든다. 좌표(m)는 정면에서 똑바로 찍은 그림에서 잰다. `v_cut_margin`은 선 밖으로 안감을 남기는 폭 |
| `shoe_level=1` | 낮은 신발의 들쭉날쭉한 입구를 면을 지우지 않고 한 높이로 눌러 평평하게 만든다(지우면 구멍이 남). `shoe_level_up`은 높이, `shoe_level_r`은 발목 중심에서의 범위 |
| `dark_lining=SHOES` | 신발 안쪽의 흰 안감을 신발의 어두운 색으로 칠한다 |
| `shoe_cap=1` | 신발 입구를 어두운 평평한 뚜껑으로 막는다. 위에서 보면 신발 속이 비어 바닥이 보였다. `shoe_cap_depth`는 뚜껑 둘레를 잡는 깊이 |
| `pants_full`, `pants_low` | 바지 통. `pants_low`를 주면 발목 바로 위까지 넉넉하다가 발목에서 모인다(대님 바지) |
| `push_neck=0`/`back`/`all` | 목 둘레(목 관절에서 10 cm 안, `back`이면 등 전체도, `all`이면 상의 전체)의 상의는 점마다 몸 밖으로 밀지 않고, 필요한 만큼을 이웃에 퍼뜨려 한 덩어리로 들어 올린다. 점마다 밀면 옷깃 띠가 목에 닿는 곳에서 톱니처럼 끊겨 보였다. `rim_neck=20`은 그 둘레 옷깃 가장자리(목 관절 아래 `rim_neck_down`까지)를 자기 선을 따라 20번 고르게 펴서 작은 조각을 없앤다. 도포는 `back`: 목 둘레만 들면 그 경계가 등에 가로줄로 남았고, `all`은 앞 옷깃을 거칠게 했다 |
| `v_cut_up=0` | V자 자르기를 위 모서리에서 멈춘다(기본 3 cm 위까지). 그 위는 목을 두르는 옷깃 띠라 잘리면 끊겨 보였다 |
| `neck_poke=1` | 상의 깃 뒤로 목 아래쪽 피부가 옷을 뚫고 나오면 그 몸 면도 상의가 가리게 한다. **몸 조각이 바뀌므로 man·girl도 다시 만든다** |
| `seam=12>3,5` | 몸판(12)과 소매(3,5)가 만나는 곳을 붙인다. 몸판 가장자리를 소매 위로 내려 붙이고, 맞닿는 3 cm(`seam_w`) 안의 가중치를 반반 섞는다. 소매는 팔을, 몸판은 가슴을 따라 움직여 팔을 내리면 어깨에 틈이 벌어졌다 |
| `under_layer=1` | 상의가 가리는 몸 면을 속층으로 1 mm 띄워 상의에 붙인다. 소매 이음새·깃 뒤 틈으로 속이 비어 보이던 것을 막는다. 몸과 같은 가중치라 움직여도 따라가고, 색은 바로 위 옷의 같은 자리를 쓴다. 목 둘레를 빼고는 피부 안쪽으로 묻는다(`under_layer_sink`, 도포는 1.2 cm). 피부 바로 위에 두면 옷을 뚫고 나와 어깨·등에 얼룩처럼 보였다. 어깨·팔(`under_layer_arm_x`)과 목 둘레에서는 항상 남기고, 그 밖은 옷이 가까운 곳(바깥 1.5 cm `under_layer_near`, 안쪽 3 cm `under_layer_in`)에서 빠진다 |
| `under_skirt=0.15` | 긴 겉옷(그 옷 세트의 상의) 안쪽 바지를 몸 축에서 바깥으로 15 cm 안에 그 상의가 있으면 숨긴다. 걷거나 달릴 때 다리가 치마를 뚫고 나오던 것을 막는다 |
| `neck_tone=1` | 그 상의를 입으면 보이는 목을 한 가지 피부색으로 바꾼다. 몸 텍스처의 목 아래 접힌 선과 분홍빛 띠가 열린 옷깃 사이로 층져 보였다. 색은 목의 평균 피부색에 가장 가까운 옷 텍스처 칸을 쓴다. **몸 조각이 바뀌므로 man·girl도 다시 만든다** |
| `lining_tone=skin` | `neck_tone=1`과 같이 쓰면 따로 안감을 두지 않고, 목과 V자 안의 가슴을 몸 모양 그대로 한 면으로 이어 한 가지 피부색으로 칠한다(Tripo 원본처럼). 목 아래 주름은 이 복사본에서 펴고(`neck_tone_smooth`), 가슴 쪽은 2.5 mm 안으로 넣는다(`neck_tone_sink`, 옷깃을 뚫지 않게). 흰 안감이면 티셔츠처럼, 0.3 mm 띄운 안감이면 윗선이 줄처럼 층져 보였다 |
| `lining_up`, `lining_front` | 목 안감 윗선 높이(목 관절 기준)와 앞쪽 범위. 목 피부가 끝나는 곳(-0.005)보다 낮으면 그 사이가 구멍이 된다 |
| `hair_trim=z,y` | 머리(HAIR)에서 높이 z 아래이고 앞쪽 y보다 앞에 있는 면과, 그 근처의 작은 조각(100면 미만)을 지운다. 갓 머리카락 끝 한 가닥이 이마에 붙어 오른쪽 눈썹 위에 눈썹이 하나 더 있는 것처럼 보였다 |
| `clean_skin=TOP` | Tripo가 옷에 잘못 칠한 피부색 면을 옷 색으로 바꾼다 |
| `brighten=TOP,BOTTOM despeck=1` | 회색으로 나온 흰 옷을 시트처럼 하얗게 올리고, 흰 천의 회색 점을 지운다(어두운 색은 그대로) |
| `lining_hidden=1` | 안감을 상의가 가린 몸 면(상의 뼈가 이끄는 면) 그대로 만든다. 목 면은 넣지 않아 안감이 목과 그 경계에서 만난다. 수평으로 자르는 `lining_up`만으로는, 높이면 목 위에 겹쳐 줄·얼룩이 생기고 낮추면 틈이 생겼다(근육 옷). 이때 `lining_up`은 넉넉히(0.05) 둔다 |
| `skin_any=1` | `lining_tone=skin`의 피부색 칸을 상의의 모든 텍스처에서 찾는다(기본은 첫 텍스처만). 부품마다 텍스처가 따로인 옷에서 첫 텍스처(민소매)에 고른 피부 칸이 없어 안감이 회색으로 나왔다. 안감만 그 재질을 따라가고 `neck_tone`·`v_paint`는 첫 텍스처를 그대로 쓴다 |
| `wing_parts=N,M` | 그 부품(날개)의 가중치를 가까운 몸 표면 대신 팔 사슬에서만 받는다. 점의 가로 위치로 어깨·위팔·아래팔·손을 고르고 관절마다 `wing_blend`(2.5 cm) 안에서 섞는다. T자에서 팔 아래로 늘어진 깃털이 옆구리 가중치를 받아, 팔을 내리면 날개가 찢어졌다(비둘기) |
| `cover_hands=1` | 상의를 입으면 손도 숨긴다. 손보다 긴 날개 위로 엄지가 튀어나왔다 |
| `hair_hides_front=0.03` | `hair_hides_scalp=1`과 함께. 머리 관절보다 이만큼 앞쪽까지만 숨긴다(귀·뒤통수). 후드가 입구 둘레의 볼까지 숨겨 구멍이 났다(비둘기) |
| `hair_hides_above=z` | `hair_hides_scalp=1`과 함께. 높이 z(m) 위의 면만 숨긴다. 앞 꼭대기까지 덮는 모자는 앞쪽도 숨겨야 해서 앞뒤 대신 높이로 자른다(허수아비, 눈썹 위 0.80) |

장군처럼 특별한 보정이 필요한 옷만 `add_set.py`를 복사해 쓴다. 그 보정들은 Tripo 부품 번호로 대상을 고르기 때문에, 다른 옷에 그대로 쓰면 엉뚱한 부품을 고친다.

가중치와 가려지는 몸을 정할 때 지킨 규칙:

- **상의·하의에는 머리·목 가중치를 넣지 않는다.** 옷깃이 턱을 따라 움직인다. 대신 `Spine2`로 보낸다.
- **딱딱한 조각(갑옷 판 등)은 한 뼈에만 붙인다.** 팔·쇄골을 반반 섞으면 팔을 내릴 때 판이 찌그러진다.
- **가려지는 몸은 몸 부위(각 면의 주된 뼈)로 정한다.** 광선 검사로 정하면 판 사이 틈으로 몸이 보였다.
  - 상의는 몸통·팔을 가리지만 목은 남긴다.
  - 하의는 엉덩이·다리를 신발 테두리 위까지 가린다.
  - 신발은 그 아래를 가린다.
- **조각 이름은 `_1`, `_2`로 붙인다.** `.001`처럼 점을 쓰면 three.js가 점을 지워서 규칙 해석이 깨진다.
- **부품의 작은 구멍(30변 이하)은 메운다.** Tripo 부품에는 구멍이 자주 있다.

### ④-2 모자 아래 머리 (남녀별)

모자와 머리카락이 한 아이템인 머리 아이템(갓, 장군 투구)은 남녀가 같이 쓴다. 그래서 머리카락을 캐릭터별 조각으로 따로 둔다.

- 조각 이름은 `item__HAIR__<문자>__for_man` / `item__HAIR__<문자>__for_girl`이다. 게임은 그 캐릭터에만 그린다(`characterLook.ts`).
- 남자 머리카락은 기본 머리 `b`를 복사해 쓴다. Tripo 머리보다 깔끔하고 기본 모습과 머릿결이 같다.
- 여자는 기본 머리 `e`(포니테일)를 쓰면 모자 아래에서 어색해서, 모자마다 머리를 따로 둔다.
  - **갓: `j`, 기본 머리 모양에 포니테일 대신 낮은 쪽.** 앞머리 쪽머리 `i`와 나란히 비교한 뒤 기본 머리 쪽을 골랐다(user). 모자를 벗은 모습과 앞머리·옆머리가 이어진다.
  - **장군 투구: `i`(눈썹을 덮는 두꺼운 앞머리, 얼굴 옆으로 내린 가는 머리, 낮은 쪽머리).** 아래는 `i`를 만든 순서다.
  - 처음 만든 가르마 올백 쪽머리는 이마가 다 드러나 정면에서 남자처럼 보였다(user).
  - 두 번째로 만든 눈썹이 보이는 시스루 앞머리는, 모델 눈썹을 지운 자리가 앞머리 끝에서 들쭉날쭉하게 잘려 이상해 보였다(user). 그래서 눈썹을 덮는 앞머리로 바꿨다. 이제 눈썹은 앞머리 밑에 가려져 지울 필요가 없다(`split_head.py`의 `brows=`는 이때 쓴 옵션이다).
  1. 공용 몸 T자 시트(`pose_sheet.py pose=t`)를 Gemini에 넣고, 몸·얼굴·배치는 그대로 두고 머리만 그리게 했다: 이마를 다 덮고 눈 바로 위에서 고르게 끝나는 두꺼운 앞머리(틈 없이), 귀 앞으로 턱까지 내린 가는 머리, 목덜미의 둥근 쪽. 정수리와 뒤는 머리에 붙게 해서 모자가 얹히게 한다. 모자·장신구는 넣지 않는다.
  2. Tripo 여러 면(정면 / Left = 오른쪽 아래 / Right = 오른쪽 위 / 뒤), Generate in Parts, Balanced, 4K 텍스처.
  3. Tripo가 머리카락과 얼굴을 한 부품(`tripo_part_0`, 쪽만 `tripo_part_2`)으로 냈다. `split_head.py`가 텍스처 밝기로 나눈다(머리 `tripo_part_90`, 얼굴 `tripo_part_91`).
     - `cut=0.1,-0.12,0.755`: 앞머리 아래 얼굴 앞쪽(어두운 눈동자)은 머리가 아니다.
     - `under=0.70,0.80,0.17,0.008`: 앞머리 끝 바로 아래 얼굴에 붙어 있던 어두운 면(모델의 눈꺼풀 선, 두피 가장자리)이 앞머리 밑으로 검게 번져 보였다(user). 그 높이에서 얼굴 피부와 8 mm 안에 있는 면은 머리가 아니다. 앞머리는 얼굴보다 1 cm 넘게 앞에 떠 있어서 남는다. 깊이(y)로 자르면 이마가 뒤로 휘는 양옆에서 앞머리 끝까지 잘렸다.
     - `face_above=0.62`: 맞추기(`head_fit`)에 쓰는 얼굴은 턱 위만 남긴다. 목까지 들어 있으면 맞추기가 19 cm 어긋났다. 잘라 낸 면(`cut`, `under`)은 얼굴에도 넣지 않는다. 넣으면 맞추기가 1.6 cm 움직였다.
  4. 머리만 기준 빌드에 맞춘다. 얼굴로 맞추니 크기 0.986배였다.

```bash
"$B" -b --python tools/character/split_head.py -- girl_fringe_parts.glb girl_fringe_split.glb part=0 min_island=300 cut=0.1,-0.12,0.755 under=0.70,0.80,0.17,0.008 face_above=0.62
"$B" -b --python tools/character/fit_outfit.py -- shared_layers_h.glb girl_fringe_split.glb shared_layers_hi.glb set=i s=1.065 head_fit=91 "map=HAIR:90,2"
```

- `j`는 기본 머리를 Tripo로 다시 만든 머리다.
  - 처음에는 기본 머리 `e`에서 포니테일만 잘라 냈다. 그러자 뒤통수 아래가 비어 빡빡이처럼 보였다(user). 포니테일을 뒤통수에 눕히거나 다른 머리의 뒤쪽을 붙여 메워 봤지만, 높낮이와 음영이 옆머리와 달라 여전히 머리카락이 없는 것처럼 보였다(user). 한 머리를 이어 붙이는 방법으로는 자연스럽지 않아서, 한 덩어리 머리를 새로 만들었다.
  1. `pose_sheet.py pose=t keep=item__HAIR__e`로 기본 머리를 쓴 몸의 T자 시트를 그린다.
  2. Gemini에 넣고 포니테일과 분홍 머리끈만 목덜미의 낮은 쪽으로 바꾸게 한다. 앞머리·옆머리·색은 그대로, 뒤통수는 옆머리와 같은 볼륨과 머릿결로 채운다.
  3. Tripo 여러 면, Generate in Parts, Balanced, 4K 텍스처. 이번에는 머리카락(`tripo_part_0`)과 얼굴(`tripo_part_2`)이 따로 나와 나누지 않고 바로 맞춘다.
  4. Tripo 텍스처가 기본 머리보다 밝고 분홍빛이라, `recolor_hair.py`로 기본 머리 `e`의 색(채널별 평균·퍼짐)에 맞춘다.
     - `drop_skin=0.006`: 가르마 가장자리에 Tripo가 두피색을 칠한 머리 조각이 이마에 흉터 같은 선으로 보였다(user). 피부색이면서 몸 표면과 6 mm 안에 있는 머리 면은 먼저 뺀다. 1.2 cm로 넓히면 정수리에 구멍이 났다.

```bash
"$B" -b --python tools/character/fit_outfit.py -- shared_layers_hi.glb girl_lowbun_parts.glb hij_t.glb set=j s=1.065 head_fit=2 "map=HAIR:0"
"$B" -b --python tools/character/recolor_hair.py -- hij_t.glb shared_layers_hij.glb item=j like=e drop_skin=0.006
```

- `i`와 `j`는 모자 아래 머리의 원본일 뿐이라 아이템으로 팔지 않는다(옷 파일에도 넣지 않는다).
- `tools/character/hat_hair.py`가 머리카락을 모자 안으로 넣는다.
  - 머리 중심에서 그 점 사이에 모자가 있으면, 그 점을 모자 안쪽 3 mm로 당긴다.
  - 모두 당겨져 모자 속에 숨은 면은 지운다.
  - `drop_hair=1`은 모자 아이템에 있던 Tripo 머리(갈색 조각)를 뺀다. 20면보다 작은 부스러기도 함께 뺀다(`crumbs`). 이마 앞에 뜬 삼각형 두 개가 남자 앞머리에 가려 있다가, 이마가 드러난 쪽머리에서 검은 자국으로 보였다(게임은 면 양쪽을 그린다).

```bash
"$B" -b --python tools/character/hat_hair.py -- shared_layers_hij.glb hh1.glb set=h drop_hair=1 girl=j straps=1000        # 갓: 남자 기본 머리, 여자 포니테일 뗀 기본 머리
"$B" -b --python tools/character/hat_hair.py -- hh1.glb hh2.glb set=g man= girl=i cap_for=man,cap_black crown_for=girl,1.15,0.035 down=0 pull=0   # 장군 투구
```

- `straps=1000`: 1000면보다 작은 모자 조각(갓의 턱끈)은 모자 안쪽을 판단할 때 빼고 본다. 턱끈이 얼굴 옆 머리 바로 바깥을 지나서, 옆머리가 모자 속으로 당겨져 잘려 나갔다. 투구에는 옆머리가 있는데 갓에는 없어서 남자처럼 보였다(user).
- 갓은 머리 중심에서 바깥으로 당기는 것에 더해, 위에서 아래로도 검사해 챙 위로 삐져나온 머리를 챙 아래로 누른다(`down`, 기본 12 cm). 왕관 모양 투구에는 쓰지 않는다(`down=0`).
- 장군 투구는 두건(검은 모자)이 머리를 덮는 모양이라, 여자에게 씌우면 뒤로 검은 공처럼 보였다. 그래서 여자에게는 두건을 빼고 왕관을 머리 위에 얹는다.
  - `cap_for=man,cap_black`: 두건(재질 `cap_black`과 거의 검은 면)은 남자 조각으로만 두고, 두건이 가리던 두피는 여자 조각에 되살린다(같이 가리던 상의가 있으면 `__under_` 규칙 유지).
  - `crown_for=girl,1.15,0.035`: 여자용 왕관을 머리 중심 기준 1.15배, 3.5 cm 위로 복사해 머리 위에 얹는다. 원래 크기면 왕관 뒤쪽이 머리에 파묻혔고, 포니테일 때 쓰던 1.2배·4.5 cm는 쪽머리 위에서 떠 보였다.
  - `pull=0`: 여자 머리는 당기지 않는다. 당기면 왕관을 지나는 머리카락이 가시처럼 삐죽해졌다.

- 머리를 넣은 옷 파일은 `to_game.py`의 `near`를 머리 몫만큼 올린다(갓 4만 → 7만 5천). 그대로 두면 촘촘한 머리가 삼각형을 다 가져가 도포가 거칠어지고 어깨에 구멍이 생겼다(도포 17,324 → 6,674). 머리를 미리 크게 줄이면(`hair_faces`) 머리 텍스처가 줄무늬처럼 깨져서 쓰지 않는다.
- 카드 그림은 `item_art.py ... variant=girl`로 `-girl` 그림(`outfit-gat-h-hair-girl.webp`)을 따로 만든다. 옷장은 여자 캐릭터일 때 이 그림을 먼저 쓴다.
  - 투구의 쪽머리(`i`)는 얼굴을 덮지 않아 앞에서 그리면 머리 안쪽이 비어 보인다. 그래서 `view=-1,0.5,0.2`로 옆뒤에서 쪽이 보이게 그린다. 갓의 기본 머리(`j`)는 앞에서 그린다.

### ④-3 예시: 사또 (세트 `k`, S15P31B105-361)

- 디자인: 공용 몸 T자 시트에 전립(붉은 술·호박 구슬 끈), 검은 전복, 붉은 소매, 주황 안감, 파란 띠와 노란 술, 검은 목화. 손에 드는 등채는 손 부위가 없어 넣지 않았다. 대머리 위에 모자만 얹으면 어색해 보여서(user) 모자 아래 머리를 그려 넣고, 앞머리를 정돈해 다시 그렸다. 시트의 머리는 모자 높이를 잡는 데만 쓰고, 게임에서는 캐릭터별 머리(남자 `b`, 여자 `j`)를 넣는다.
- Tripo 부품: 0 전립, 1 머리(머리카락·구슬·얼굴이 한 부품), 10 전복 윗부분, 6·8 소매, 2 전복 자락, 11 주황 안감, 3 띠와 술, 4·5 목화, 7·9 손(버림). 바지는 나오지 않았다.
- `satto_prep.py`: 부품 1을 색으로 나눠 머리카락(90, 버림), 구슬(92, 모자 아이템), 턱 위 얼굴(91, `head_fit`)로 만들고, 자락(2)을 93으로 복사한다. 93은 하의 자리에 두어 `pants=1`이 몸 표면으로 만든 바지에 검은색을 준다.
- 모자 아래 머리: 구슬 끈(1774면)이 얼굴 옆을 지나 옆머리를 잘라 내지 않게 `straps=2000`. 구슬이 주황이라 `drop_hair=1`(갈색 조각 빼기)은 쓰지 않는다.
- 옷깃: 게임에서 흰 깃·주황 띠가 번지고 끊겨 보였다(user). 두 가지를 고쳤다.
  - 원본 얼룩: `flat_collar.py`가 목 주변 전복 텍스처를 흰색·주황·검정으로 나누고(`win=31` 다수결로 얼룩과 끊긴 검은 끈 제거) 각각 한 색으로 칠한다.
  - 그래도 왼쪽 주황 띠가 V 끝까지 오지 않고 오른쪽 띠에 검은 톱니가 파고들었다(user). `mirror=1`: 앞에서 본 지도(1mm 칸마다 가장 앞 면)로 좌우를 맞춰 더 밝은 쪽 색(주황 > 흰색 > 검정)을 준다. 오른쪽 섶이 왼쪽 섶을 덮는 여밈이라 3D 거울점으로는 가려진 안쪽 섶에 맞춰졌다.
  - 가운데 검은 줄은 칠이 아니라 두 섶 사이 틈(옷 뒤판 안쪽이 보임)이었다. `plug=1`: 틈을 흰색·주황(반대편 색)의 면으로 뒤에서 막고, 틈 안의 텍스처 넓이 0인 가는 면은 지운다. 그 주변의 가는 면은 지도 색으로 다시 칠한다(한 텍셀 색이라 흰 깃 속에 검은 가시로 보였다).
  - 위에서 보면 목 아래로 바닥이 비쳤다(user). 게임은 면의 앞쪽만 그리는데 깃이 목 앞에서 떨어져 있어, 틈으로 옷 안쪽(그려지지 않음)을 지나 뒤가 보였다. `lining=0.12`: 목 관절 12cm 아래부터 위의 상의 면을 안쪽으로 뒤집어 0.5mm 안에 한 겹 더 둔다(같은 텍셀·가중치).
  - 목 양옆 깃 안쪽이 검고 목 아래 안감이 회색으로 보여, 양옆은 흰색·가운데는 피부색으로 해 달라고 했다(user). `inner=1`: 목을 향한 면과 목 바로 옆 깃 윗부분의 검은 텍셀을 흰색으로. `skin=0.04`: 앞 가운데(|x| < 4cm) 안감에 몸의 목 색을 준다(상의 텍스처의 쓰지 않는 자리에 칠한 피부색 칸).
  - 게임 변환: 각도 1.5도로 새로 펼친 조각이 수천 개라 조각 사이 여백이 아틀라스를 차지해, 옷깃에 텍셀이 적게 돌아가 계단처럼 뭉개졌다. `repack=1`로 여백을 줄여 다시 배치한다. `atlas=4096`이나 `bake=project`, 목 주변 감량 제외로는 나아지지 않았다.

```bash
"$B" -b --python tools/character/satto_prep.py -- satto_outfit_parts.glb satto_parts_prep.glb
"$B" -b --python tools/character/fit_outfit.py -- shared_layers_hij.glb satto_parts_prep.glb shared_k.glb set=k s=1.065 head_fit=91 "map=HAIR:0,92;TOP:10,6,8,2,11,3;BOTTOM:93;SHOES:4,5" skirt=TOP pants=1 under_tops=1 cull=1 "seam=10>6,8" dark_lining=SHOES shoe_cap=1 shoe_cap_depth=0.01 under_layer=1 under_layer_sink=0.012 under_skirt=0.15 skirt_leg=0.9 push_neck=back rim_neck=20
"$B" -b --python tools/character/hat_hair.py -- shared_k.glb hk.glb set=k girl=j straps=2000
"$B" -b --python tools/character/flat_collar.py -- hk.glb hk_c.glb set=k win=31 mirror=1 plug=1 lining=0.12 inner=1 skin=0.04
"$B" -b --python tools/character/to_game.py -- hk_c.glb out/satto_raw.glb satto HAIR=k TOP=k BOTTOM=k SHOES=k pieces=1 body=0 near=75000 atlas=2048 fill=1 keep_head=0 repack=1
```

- 카드(`item_art.py`)도 `hk_c.glb`에서 그린다.

- 새 몸 조각(`TOPk` 등)이 생기므로 남자·여자 파일도 `hk.glb`에서 다시 만들고, 캐릭터 캐시 번호(`characterAssets.ts`의 `?rig=`)를 올린다.

### ④-4 예시: 근육 운동복·비둘기·허수아비 (세트 `l`·`m`·`n`, S15P31B105-363)

세 벌 모두 공용 몸 T자 시트에 옷을 입힌 사용자 시트로 만들었다. Tripo 여러 면, Generate in Parts, Balanced, 4K 텍스처, 배율 `s=1.0`(시트가 공용 몸 그대로라 실루엣이 겹친다). `hk.glb`에 `l` → `m` → `n` 차례로 넣는다.

- **근육 운동복 `l`** (`MUSCLE`): 민소매·근육 팔·손목 밴드(상의), 반바지·근육 다리(하의), 운동화.
  - 근육 팔다리는 피부지만 옷으로 넣는다. 공용 몸 팔다리를 쓰면 근육이 없어지고, 몸에 칠해진 흰 반팔·회색 속바지가 민소매·반바지 밖으로 보인다. 손목은 밴드가, 발목은 운동화가 이음매를 가린다.
  - Tripo 피부가 몸보다 밝고 붉었다. `skin_match.py`가 몸(목·손·아래팔·정강이)의 피부 중앙값에 맞춰 부품 텍스처의 피부색 픽셀을 채널별로 곱한다(근육 음영은 남음).
  - 앞 목 아래 피부가 버린 머리 부품에 있어 가슴이 비었다. 피부색 안감으로 채운다(`lining_hidden`, `skin_any`). `neck_tone`은 목 뒤 머리와 깃 사이에 자홍 틈·검은 톱니를 남겨 쓰지 않는다.
- **비둘기 옷 `m`** (`PIGEON`): 후드·앞머리(머리), 날개(상의), 몸통 옷·꼬리(하의), 발(신발).
  - Tripo가 몸통과 다리를 한 부품으로 냈다. 통째로 하의에 두고 상의는 날개만 둔다(한 벌로만 입어 상관없다).
  - 날개는 `wing_parts`, 손은 `cover_hands`, 후드 아래 귀는 `hair_hides_front`.
- **허수아비 옷 `n`** (`SCARECROW`): 모자(머리), 조끼·셔츠깃·소매·새끼줄 띠·방울·주머니(상의), 조끼 아랫단·반바지·바지·발목(하의), 신발. 맨 아래팔·손(12·13)은 버린다.
  - Tripo가 생성된 머리와 조끼 윗부분을 한 부품(3)으로 냈다. `split_part.py`가 목 높이(0.56)에서 나누고, 위쪽(31)은 `head_fit`에만 쓴다. 아래쪽(30)에서 0.535 위의 살색 면(목 밑동)은 지운다.
  - 생성된 머리가 작아 모자 정수리가 공용 몸 머리 안으로 들어갔고, 밀려 나온 모자가 깔때기처럼 찌그러져 두피가 비쳤다(user: 모자에 구멍). `head_fit=31`로 모자를 1.072배 키워 맞춘다. 모자 메시 자체에는 머리 입구 말고 열린 둘레가 없다.
  - 찢어진 천 가장자리와 텍스처 이음매를 고정하면 게임 파일이 6만이 아니라 10만 삼각형으로 남았다. 게임 변환은 `keep_edges=pieces`(조각 경계만 고정). 가장자리도 오히려 깔끔했다.
  - 조끼·셔츠의 갈색·베이지가 피부로 잡혀 `skin_match.py`는 쓰지 않는다.
- **기준 빌드 크기:** 부품을 그대로 넣으니 `hk.glb` 71 MB가 세 벌 뒤 259 MB가 됐다(한 벌 116만~186만 면, 다른 옷은 3만~12만 면). 다 넣은 뒤 `shrink_items.py`로 새 세트를 한 벌 12만 면으로 줄인다(95 MB). 게임 파일은 줄이기 전과 같아 보였다.

```bash
"$B" -b --python tools/character/skin_match.py -- hk.glb muscle_outfit_parts.glb muscle_outfit_parts_tone.glb parts=1,5,6,7,8
"$B" -b --python tools/character/fit_outfit.py -- hk.glb muscle_outfit_parts_tone.glb hk_l.glb set=l s=1.0 "map=TOP:1,7,8,11,12;BOTTOM:3,5,6;SHOES:2,4" cull=1 lining=1 lining_tone=skin lining_hidden=1 lining_up=0.05 lining_cull=0.006 skin_any=1 under_layer=1 under_layer_sink=0.012
"$B" -b --python tools/character/fit_outfit.py -- hk_l.glb pigeon_outfit_parts.glb hk_lm.glb set=m s=1.0 "map=HAIR:1,7;TOP:2,3;BOTTOM:0,8,9,10,11,12,13;SHOES:4,5" cull=1 cover_hands=1 wing_parts=2,3 hair_hides_scalp=1 hair_hides_front=0.03 under_layer=1 under_layer_sink=0.012
"$B" -b --python tools/character/split_part.py -- scarecrow_outfit_parts.glb scarecrow_split.glb part=3 z=0.56 skin_above=0.535
"$B" -b --python tools/character/fit_outfit.py -- hk_lm.glb scarecrow_split.glb hk_lmn.glb set=n s=1.0 head_fit=31 "map=HAIR:0;TOP:30,1,14,4,11,5,8,9;BOTTOM:10,2,15,16;SHOES:6,7" cull=1 lining=1 lining_tone=skin lining_hidden=1 lining_up=0.05 skin_any=1 under_layer=1 under_layer_sink=0.012 hair_hides_scalp=1 hair_hides_above=0.80
"$B" -b --python tools/character/shrink_items.py -- hk_lmn.glb docs/character-outfits/shared_layers_n.glb sets=l,m,n faces=120000
# 게임 파일: 머리가 없는 옷은 keep_head=0 (높이로 정하는 "머리 부분"이 가슴·팔에 걸려 50만 삼각형으로 남았다)
"$B" -b --python tools/character/to_game.py -- shared_layers_n.glb out/muscle_raw.glb muscle TOP=l BOTTOM=l SHOES=l pieces=1 body=0 near=60000 atlas=2048 fill=1 keep_head=0
"$B" -b --python tools/character/to_game.py -- shared_layers_n.glb out/pigeon_raw.glb pigeon HAIR=m TOP=m BOTTOM=m SHOES=m pieces=1 body=0 near=60000 atlas=2048 fill=1 keep_head=0
"$B" -b --python tools/character/to_game.py -- shared_layers_n.glb out/scarecrow_raw.glb scarecrow HAIR=n TOP=n BOTTOM=n SHOES=n pieces=1 body=0 near=60000 atlas=2048 fill=1 keep_edges=pieces
```

- 남자·여자 파일도 `shared_layers_n.glb`에서 ⑥의 명령으로 다시 만든다(새 몸 조각 `TOPl`·`HAIRm`·`HAIRn` 등).
- 카드는 `item_art.py ... together=TOP,BOTTOM,SHOES cut_above=0.035`로 그리고 `tools/character/fit_cards.mjs`로 맞춘다(⑨).
- 한 벌이 20분 넘게 걸린다(가중치 정리·부품 안 평균). 컴퓨터가 잠들면 Blender도 멈춰, 3시간 넘게 진행되지 않은 적이 있다.

### ④-5 예시: 병아리·사이버펑크 테크웨어·제빵사·힙한 스트릿웨어 (세트 `o`·`p`·`q`·`r`, S15P31B105-364·365·367·368)

`shared_layers_n.glb`에 `o` → `p` → `q` → `r` 차례로 넣고, 한 벌을 넣을 때마다 `shrink_items.py`로 12만 면으로 줄인다. 병아리·테크웨어·스트릿웨어는 받은 그림을 Gemini로 공용 몸 T자 시트에 입혀 썼고, 제빵사는 사용자 시트를 그대로 썼다. 배율은 모두 `s=1.0`이다.

- **병아리 `o`** (`CHICK`): 후드·앞머리·새싹(머리), 털 몸판·날개 소매·배(상의), 아랫단·발목(하의), 병아리 발(신발).
  - Tripo가 후드·몸판·소매를 한 부품(0)으로 냈다. `chick_prep.py`가 위치로 후드(31)·날개 소매(32)·몸판(30)·아랫단(33)으로 나누고, T자보다 처진 소매를 들어 올린다.
  - 생성된 머리가 작아 `head_fit=2`로 후드를 1.107배 키운다. 그러면 후드가 6 cm쯤 올라가 몸판과 사이에 목이 드러났다. 그래서 후드가 목 둘레 몸판(`collar_z`, `collar_x`)도 함께 가져간다.
  - 소매는 `wing_parts`, 후드 아래 귀는 `hair_hides_front`. 발목 피부는 `skin_match.py`로 몸 피부색에 맞춘다(몸 피부를 `body` 하나에서만 찾아 실패해서, 모든 몸 조각에서 찾게 고쳤다).
- **사이버펑크 테크웨어 `p`** (`CYBER`): 고글(얼굴, 머리는 캐릭터 자기 머리), 재킷·하네스·배낭끈(상의), 카고 바지·무릎 보호대(하의), 부츠(신발). 실제 팀 상표·글자는 넣지 않았다.
  - 고글 띠를 머리 위에 맞추려고 남자 기본 머리를 쓴 T자 시트(`pose_sheet.py ... keep=item__HAIR__b`)에 입혔다.
  - 재킷·바지·부츠가 한 부품(1)이라 `split_part.py`로 두 번 나눴다(z 0.31, 0.125).
  - 고글 아래 생성된 얼굴은 턱과 귀뿐이라 `head_fit`이 고글을 6 cm 안으로 옮겼다. `head_fit` 없이 `face_scale=1.15`(머리 관절 기준으로 키움)를 쓴다. 가로로만 키우면 렌즈가 코와 눈 아래쪽을 덮었다.
  - Tripo 반장갑은 생성된 가는 손에 맞춰져 몸 손 안에 묻혔다. 생성된 손가락을 쓰면 게임 파일에서 가시처럼 뭉개졌다. `gloves=1`이 몸 팔(손목 5 cm 앞부터 손가락 뿌리까지)을 잘라 장갑을 만든다. 한 텍셀로 칠한 장갑이 게임 변환에서 상자처럼 뭉개져, `glove_gap=0.005`로 띄우고 `to_game.py`에 `hold_flat=1`을 준다.
- **제빵사 `q`** (`BAKER`): 요리사 모자(머리), 조리복·스카프·빵 바구니(상의), 앞치마·도구·바지(하의), 부츠(신발). 생성된 손·눈·눈썹은 버린다.
  - 모자와 생성된 머리가 한 부품(0)이고 모자 띠가 기울어 높이로는 못 나눈다. `split_part.py by_skin=1 keep_largest=1`이 피부색 면(얼굴 40, `head_fit`용)과 나머지(모자 41, 딸려 온 눈 테두리를 빼고 가장 큰 덩어리만)로 나눈다.
  - 소매가 몸 팔보다 4.4 cm 처져 `lift_arms.py`로 올린다.
- **힙한 스트릿웨어 `r`** (`STREET`): 뒤로 쓴 야구 모자(머리), 후드티·크로스백(상의), 카고 조거(하의), 하이탑(신발). 운동화 상표는 넣지 않았다. 실루엣이 거의 겹쳐 앞뒤로 `dy=0.01`만 맞춘다.

```bash
# o 병아리
"$B" -b --python tools/character/chick_prep.py -- chick_outfit_parts.glb chick_prep.glb
"$B" -b --python tools/character/skin_match.py -- shared_layers_n.glb chick_prep.glb chick_prep_tone.glb parts=9,10
"$B" -b --python tools/character/fit_outfit.py -- shared_layers_n.glb chick_prep_tone.glb hk_o.glb set=o s=1.0 head_fit=2 "map=HAIR:31,7,8;TOP:30,32,3;BOTTOM:33,9,10;SHOES:1,4" cull=1 wing_parts=32 hair_hides_scalp=1 hair_hides_front=0.03 under_layer=1 under_layer_sink=0.012
"$B" -b --python tools/character/shrink_items.py -- hk_o.glb shared_layers_o.glb sets=o faces=120000
# p 테크웨어
"$B" -b --python tools/character/split_part.py -- cyber_outfit_parts.glb split_a.glb part=1 z=0.31 below=41 above=40
"$B" -b --python tools/character/split_part.py -- split_a.glb cyber_split.glb part=41 z=0.125 below=42 above=43
"$B" -b --python tools/character/fit_outfit.py -- shared_layers_o.glb cyber_split.glb hk_p.glb set=p s=1.0 face_scale=1.15 gloves=1 glove_gap=0.005 "map=FACE:5,4,12,15,30;TOP:40,10,11,20,21,23,31,32;BOTTOM:43,16,17,33,34,27,29;SHOES:42,8,9,18,19,24,28" cull=1 under_layer=1 under_layer_sink=0.012
"$B" -b --python tools/character/shrink_items.py -- hk_p.glb shared_layers_p.glb sets=p faces=120000
# q 제빵사
"$B" -b --python tools/character/split_part.py -- baker_outfit_parts.glb baker_split.glb part=0 by_skin=1 keep_largest=1 below=40 above=41
"$B" -b --python tools/character/lift_arms.py -- baker_split.glb baker_lift.glb parts=14,15,23,24 lift=0.33 from=0.1
"$B" -b --python tools/character/fit_outfit.py -- shared_layers_p.glb baker_lift.glb hk_q.glb set=q s=1.0 head_fit=40 "map=HAIR:41;TOP:5,25,14,15,23,24,6,1,7,13,10,11,12,26,28;BOTTOM:2,3,9,20,29,35,36,8,22,27,30,37;SHOES:17,18,4,21" cull=1 hair_hides_scalp=1 under_layer=1 under_layer_sink=0.012
"$B" -b --python tools/character/shrink_items.py -- hk_q.glb shared_layers_q.glb sets=q faces=120000
# r 스트릿웨어
"$B" -b --python tools/character/fit_outfit.py -- shared_layers_q.glb street_outfit_parts.glb hk_r.glb set=r s=1.0 dy=0.01 head_fit=1 "map=HAIR:3;TOP:0,4;BOTTOM:2,20,24,15;SHOES:6,7,5,14,10,11,12,13,16,17,22,23,25,26,28,29,30" cull=1 hair_hides_scalp=1 under_layer=1 under_layer_sink=0.012
"$B" -b --python tools/character/shrink_items.py -- hk_r.glb docs/character-outfits/shared_layers_r.glb sets=r faces=120000
# 게임 파일 (머리가 있는 옷도 keep_head=0, 테크웨어는 장갑 때문에 hold_flat=1)
"$B" -b --python tools/character/to_game.py -- shared_layers_r.glb out/chick_raw.glb chick HAIR=o TOP=o BOTTOM=o SHOES=o pieces=1 body=0 near=60000 atlas=2048 fill=1 keep_head=0
"$B" -b --python tools/character/to_game.py -- shared_layers_r.glb out/cyber_raw.glb cyber FACE=p TOP=p BOTTOM=p SHOES=p pieces=1 body=0 near=60000 atlas=2048 fill=1 keep_head=0 hold_flat=1
"$B" -b --python tools/character/to_game.py -- shared_layers_r.glb out/baker_raw.glb baker HAIR=q TOP=q BOTTOM=q SHOES=q pieces=1 body=0 near=60000 atlas=2048 fill=1 keep_head=0
"$B" -b --python tools/character/to_game.py -- shared_layers_r.glb out/street_raw.glb street HAIR=r TOP=r BOTTOM=r SHOES=r pieces=1 body=0 near=60000 atlas=2048 fill=1 keep_head=0
```

- 남자·여자 파일도 `shared_layers_r.glb`에서 ⑥의 명령으로 다시 만든다. 캐시 번호는 캐릭터 `rig=16`, 옷 `rig=27`.
- 테크웨어 카드는 고글 부위가 얼굴(`outfit-cyber-p-face.webp`)이다.
- 붐박스를 어깨에 얹은 바시티 재킷(S15P31B105-372)은 만들어 봤다가 뺐다. 공용 몸은 팔이 짧고(어깨에서 손목까지 17 cm) 머리가 커서, 손으로 머리 옆 소품을 받치게 하면 손이 꼬여 보이고 큰 소품은 머리를 파고든다.

### ④-6 스킨 공방용 통합 스킨 파일

dev의 관리자 스킨 공방(`docs/skin-registration-api.md`, S15P31B105-371)에 올릴 통합 스킨(WHOLE)은 몸·얼굴·머리·옷이 한 표면인 파일이다. `to_game.py`를 `pieces=1` 없이 variant `man`/`girl`로 돌리면 그 옷을 입은 모습 그대로 나온다(가려진 몸 조각은 빠진다).

```bash
"$B" -b --python tools/character/to_game.py -- shared_layers_r.glb out/chick-man_raw.glb man HAIR=o TOP=o BOTTOM=o SHOES=o near=60000 fill=1 keep_edges=pieces hold_flat=1
"$B" -b --python tools/character/to_game.py -- shared_layers_r.glb out/chick-girl_raw.glb girl HAIR=o TOP=o BOTTOM=o SHOES=o near=60000 fill=1 keep_edges=pieces hold_flat=1
```

- 모자가 없는 옷은 남자 `HAIR=b`, 여자 `HAIR=e`를 넣는다(테크웨어·근육 운동복).
- 갓·장군·사또는 이 빌드에 없는 `hat_hair.py`(④-2)와 `flat_collar.py`(④-3)를 먼저 다시 거친다. 그래야 여자 파일에 모자 아래 여자 머리가 들어간다.
- 압축은 `prepare-characters.mjs`와 같은 방식(Meshopt, WebP)이어야 한다. 이 스크립트는 `public/`과 manifest에만 쓰니, 공방용 파일은 같은 압축을 다른 폴더로 내보내서 만든다. 서버가 GLB 20 MiB, WebP 2 MiB, 49개 관절, 근거리·원거리 표면, variant를 검사한다.
- 공방의 부위별(PARTS) 등록은 조각 문자가 항상 `a`이고, 남자·여자 파일에 `a` 몸 조각이 없어 옷 밑의 몸이 숨지 않는다. 이 문서의 옷은 통합 스킨으로 올린다.

### ⑤ 빌드 확인

임의 방향에서 그려 본다(`POSE=idle:100`으로 자세를 줄 수 있다).

```bash
"$B" -b --python tools/character/look.py -- out/front.png 0,-1,0.1 0,0,0.8 1.2 shared_layers_h.glb
```

걷기·달리기에서 옷이 뚫리는지는 `pose_look.py`로 본다. 그 옷 세트를 입었을 때 게임이 보여 주는 몸 조각과 옷 조각만 남기고, 동작의 프레임마다 앞·뒤·옆을 그린다(카메라는 엉덩이를 따라간다).

```bash
"$B" -b --python tools/character/pose_look.py -- hk.glb out/pose set=k variant=girl frames=walk:4,walk:30,run:4,run:18
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
  "$B" -b --python tools/character/render_look.py -- out/man_raw.glb out/look HAIR=man/b TOP=newoutfit/h BOTTOM=newoutfit/h SHOES=man/d with=newoutfit@out/newoutfit_raw.glb
  ```

  옷은 한 벌로만 입으니 다른 상의·하의·신발과 섞은 모습은 보지 않아도 된다. 대신 머리·얼굴과의 조합(기본 머리, 갓, 장군 투구·선글라스)은 꼭 본다.
  - 정지 그림만으로는 부족하다. 걷기·달리기 자세도 본다(`look.py`에 `POSE=walk:8`, `POSE=run:6` 등).
  - 갓·도포는 달릴 때 무릎이 자락을 뚫는 것을 여기서 찾았다(`skirt_leg`).
  - 게임처럼 뒷면을 그리지 않게 그려서(`render_look.py`가 기본으로 그렇게 그린다) 옷 틈으로 비치는 곳도 찾는다.

- **구멍·검은 점:** 배경을 자홍색으로 그린다. 구멍은 자홍, 칠해지지 않은 텍스처는 검정으로 보인다.

  ```bash
  "$B" -b --python tools/character/holes.py -- out/newoutfit_raw.glb out/holes
  ```

- **조각별 높이:** 조각 이름이 엉뚱한 곳에 붙지 않았는지 본다.

  ```bash
  "$B" -b --python tools/character/check_pieces.py -- out/man_raw.glb
  ```

### ⑨ 옷장 그림

그림은 모두 `frontend/src/features/wardrobe/parts/`에 넣고, 크기는 320 px에 투명 배경이다.

- **한 벌(옷 칸) 카드:** `set-<세트 코드 소문자>.webp`(예: `set-general.webp`, `set-dopo.webp`). 상의·하의·신발만 함께 그린다. 머리·얼굴은 넣지 않는다.
- **머리·얼굴 카드와 부위 그림:** `outfit-<파일>-<의상 문자>-<부위 소문자>.webp`. 옷장은 아이템의 imageKey로 이 그림을 찾는다. 그림이 없으면 기본 그림을 옷 이름의 색 낱말로 다시 칠해 쓴다(`itemArt.ts`).
- 두 가지를 한 번에 만든다.
  - `together=TOP,BOTTOM,SHOES`는 한 벌 그림 `set-<파일>-<의상 문자>.raw.png`를 같이 그린다.
  - `cut_above=0.035`는 상의·한 벌 그림에서 목 관절 3.5 cm 위를 뺀다. 상의에 목 피부가 들어 있는 옷(`neck_tone`)은 이게 없으면 목 조각이 옷 위에 떠서 보인다.

  ```bash
  "$B" -b --python tools/character/item_art.py -- shared_layers_h.glb out/art newoutfit h together=TOP,BOTTOM,SHOES cut_above=0.035
  ```

  결과(`*.raw.png`)는 잘라서 긴 쪽 232 px로 줄이고 320 px 투명 칸 가운데에 놓는다. 저장소 최상위에서 `node tools/character/fit_cards.mjs frontend/src/features/wardrobe/parts out/art/set-muscle-l.raw.png=set-muscle ...`가 이렇게 WebP로 만든다.

### ⑩ 아이템 등록과 로컬 확인

아이템 행 예시(로컬 테스트 DB 전용이다. 실제 판매 이름·가격은 따로 정한다):

```sql
INSERT INTO items (item_code, name, item_type, equip_slot, price, image_key, is_for_sale, set_code) VALUES
 ('GENERAL_HAIR', '장군 투구', 'EQUIPMENT', 'HAIR', 0, 'outfit/general/g', FALSE, NULL),
 ('GENERAL_TOP', '장군 갑옷', 'EQUIPMENT', 'TOP', 0, 'outfit/general/g', FALSE, 'GENERAL'),
 ('GENERAL_BOTTOM', '장군 바지', 'EQUIPMENT', 'BOTTOM', 0, 'outfit/general/g', FALSE, 'GENERAL'),
 ('GENERAL_SHOES', '장군 장화', 'EQUIPMENT', 'SHOES', 0, 'outfit/general/g', FALSE, 'GENERAL'),
 ('SATTO_HAIR', '전립', 'EQUIPMENT', 'HAIR', 0, 'outfit/satto/k', FALSE, NULL),
 ('SATTO_TOP', '사또 전복', 'EQUIPMENT', 'TOP', 0, 'outfit/satto/k', FALSE, 'SATTO'),
 ('SATTO_BOTTOM', '사또 바지', 'EQUIPMENT', 'BOTTOM', 0, 'outfit/satto/k', FALSE, 'SATTO'),
 ('SATTO_SHOES', '사또 목화', 'EQUIPMENT', 'SHOES', 0, 'outfit/satto/k', FALSE, 'SATTO');
```

- `is_for_sale`이 `FALSE`면 상점 목록에 안 나오고 살 수도 없다. 위 예시는 `user_items`에 직접 넣어 옷장에서 입어 보는 용도다. 상점 진열·구매까지 확인하려면 `TRUE`와 가격을 넣는다.
- 머리·얼굴은 `set_code`를 `NULL`로 둔다. 옷 칸에서 따로 고르게 된다.
- 한 벌인 옷은 상의·하의·신발 세 개 모두 같은 `set_code`를 둔다. 하나라도 빠지면 그 부위는 기본 옷이 된다.
- 상의 하나만 있는 낱개 옷(`set_code` `NULL`)도 입을 수 있다. 이때 하의·신발은 기본 옷이 된다. 그 조합에서 보기 좋은지 확인해야 하니, 되도록 한 벌로 만든다.
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
| 바지가 다른 상의를 뚫음, 바지를 벗고 갓 신발만 신으면 발목이 빔 | 상의·하의·신발을 부위별로 섞어 입게 해서 조합마다 몸 가림이 어긋남 | 마이룸을 머리·얼굴·옷 세 칸으로, 옷은 한 벌로만 입기(S15P31B105-338) |
| 수정한 모델이 화면에 안 바뀜 | 브라우저가 예전 캐릭터 파일을 들고 있음 | `?rig=` 번호를 올리고 강력 새로고침 |
| 모자·고글이 얼굴 안으로 들어가거나 엉뚱하게 커짐 | `head_fit`에 쓴 생성 얼굴이 고글·모자에 가려 턱·귀뿐이거나 목까지 붙어 있음 | 얼굴만 남기거나(`split_part.py by_skin=1`), `face_scale`로 머리 관절 기준으로 키우기(④-5) |
| 반장갑 안으로 손이 비치거나 장갑이 상자처럼 뭉개짐 | 생성 장갑이 몸 손보다 가늘고, 한 색 면은 게임 변환에서 마음대로 줄어듦 | `gloves=1 glove_gap=0.005`, `to_game.py hold_flat=1`(④-5) |

## 5. 협의할 곳

- **캐릭터 파일·뼈대·동작 데이터:** jin2v2. 남자·여자 파일을 다시 만들거나 `characterClips.json`을 바꿀 때 먼저 알린다.
- **상점 API·DB(아이템, 세트, 해제, 옷 한 벌 규칙):** 상점 담당. 실제 판매 아이템은 담당자와 정해서 넣는다.
- **옷장 화면(`frontend/src/features/wardrobe`):** 화면을 만든 JEAWOOK. 칸 구성이나 말풍선을 바꿀 때 먼저 알린다.
- **Tripo 크레딧:** 쓰기 전에 팀과 정한다.
