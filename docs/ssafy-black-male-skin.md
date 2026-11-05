# SSAFY 검정 남자 통짜 스킨 개발서버 적용

## 변경과 장착 계약

- 최종 기준: `origin/dev@687f720c4cb495ead3f4fbd227fa4383baf514bc`(최초 작업 기준 86ab0c00).
- 최신 dev 통합 중 `WardrobeScreen.tsx`의 남녀별 썸네일 인자와 `outfitSources.ts`의 rig=23 캐시 키 충돌을 해결했다. 최신 남녀 헤어/카메라/옷장 변경과 통짜 스킨 경로를 함께 보존했다.
- 작업 브랜치: `feat/S15P31B105-319-ssafy-whole-skin`. 기존 옷장/5슬롯 세트 계약(S15P31B105-319)을 재사용한다.
- `frontend/public/art/characters/skins/ssafy-black-male-v3.glb`: 몸·얼굴·머리·옷이 포함된 파일 하나, 1,627,276 bytes, 공통 49관절, near 32,000 / far 6,000 triangles, 2048 WebP atlas.
- SHA-256: `f09bfd93afbebdb4953cae6e0dccb29e6429566af2d8dbf17f7ca7c2d83297cc`.
- 사용자 제공 몸체와 2번 레퍼런스로 제작했다. Tripo 원본 ID `992e3d30-e205-444b-9e54-39f64e8f1a68`, 기존 승인 생성 비용 80 credits. 이번 통합에서 추가 생성 비용은 없다.
- 공개 장착 5슬롯 모두 `imageKey=skin/ssafy-black-male/v3`, `setCode=SSAFY_BLACK_MALE_V3`. DB 부위 행은 장착 정보이며 모델을 5개로 나누지 않는다.
- 남자 캐릭터에만 표시한다. 일부 슬롯 누락, 혼합·미등록 키, 로드 실패 시 기본 몸체를 유지한다. 다른 머리·얼굴·옷을 입으면 기존 서버 세트 해제 규칙으로 스킨 전체가 벗겨진다.
- 개인 미리보기는 본인에게만 적용한다. 확정 착용은 기존 REST 장착/해제와 WORLD_STATE 공개 장착 정보로 다른 방문자에게 전달한다. 통신·인증·이동 계약은 변경하지 않는다.
- 헤어 포함 완성 표면을 기본 몸체 대신 생성하며, 추가 부위 메시를 덧붙이지 않는다. 기존 man/girl GLB는 수정하지 않는다.
- 기본 캐릭터·새 스킨 모두 실제 맵 벤치 높이를 이용한다. 맵 소스/맵 해시 변경은 없다.

## 배포 전 확인

1. 사용자 최종 지시로 **V151**을 사용한다(V152 지정을 철회). 팀원이 V151을 사용할 예정이라고 공유했으므로 팀원 쪽 번호 변경 조율이 필요하다. 조율 완료를 가정하지 않는다. 새 원격/열린 MR/로컬 worktree/팀 예약을 병합 직전에 다시 확인한다.
2. 새 파일은 `backend/src/main/resources/db/shop/V151__register_ssafy_black_male_whole_skin.sql` 한 개다. 비판매·0원 카탈로그만 등록하고 누구에게도 자동 지급하지 않는다.
3. 실제 개발 DB에서 `items`, `user_items`, `set_code`와 V100/V102의 적용 이력, 전체 locations의 V151 중복을 먼저 확인한다. 미적용 V100/V102를 최신 DB에 임의로 소급 적용하거나 `outOfOrder`/repair/초기화로 우회하지 않는다.
4. 배포 서버는 `SHOP_ENABLED=true`, Flyway locations에 기존 활성 경로와 `classpath:db/shop`이 필요하다. `application-db.yml`의 dev 프로필에는 기본적으로 migration/minigame만 있으므로 **실제 유효 설정**을 확인해야 한다. 이 MR은 서버 환경변수를 변경하지 않는다.
5. 프런트엔드는 기존 Jenkins dev 빌드의 `VITE_WARDROBE_OUTFITS=true`를 사용한다. production의 의상 비활성 정책은 유지한다.
6. dev 병합은 사용자 별도 승인 후 진행한다. Jenkins `ontop-dev`가 해당 병합 SHA로 성공했고 정적 파일과 V151이 반영됐는지 확인한다. 이번 스킨용 파일이 dev에서 내려받아지기 전에는 착용 완료라고 보고하지 않는다.

## 검수 계정 지급

V151 적용 뒤 지정된 **개발 DB와 계정 ID**를 확인하고 기존 장착을 건드리지 않도록 아래를 트랜잭션으로 실행한다. 예시 ID는 넣지 않는다. 실제 계정 ID를 운영자가 주입해야 한다.

```sql
-- SET @skin_user_id = 확인한_검수_계정_ID;
START TRANSACTION;
INSERT INTO user_items (user_id, item_id, quantity, is_equipped)
SELECT u.id, i.id, 1, FALSE
FROM users u CROSS JOIN items i
WHERE u.id = @skin_user_id
  AND i.set_code = 'SSAFY_BLACK_MALE_V3'
ON DUPLICATE KEY UPDATE quantity = GREATEST(quantity, 1);
SELECT ui.user_id, i.item_code, ui.quantity, ui.is_equipped
FROM user_items ui JOIN items i ON i.id = ui.item_id
WHERE ui.user_id = @skin_user_id AND i.set_code = 'SSAFY_BLACK_MALE_V3';
-- 반환된 5행의 계정/코드를 확인한 후 COMMIT; 다르면 ROLLBACK;
```

지급 후 공원 재접속 → 옷장 → `SSAFY 검정 후드 세트` → 미리보기 → 세트 입기. 세트 벗기는 기본 캐릭터로 복귀한다. 다른 계정 화면과 재접속에서도 외형이 유지되는지 확인한다. 판매 등록과 전체 계정 지급은 이번 범위가 아니다.

## 검증과 남은 범위

- 관련 FE 단위 테스트 통과: 부분/혼합 키 방어, 5슬롯 미리보기, 다른 부위 선택 시 전체 해제, 기존 man/girl 및 실제 새 GLB의 모션·LOD·개인별 자원 소유권, 맵 벤치 높이.
- 최신 dev 통합 후 전체 FE **2,340개 통과, 6개 skip**, 260개 테스트 파일 통과. 초기 실행의 맵 임시 파일 권한 실패는 권한을 갖춘 재실행에서 해소됐으며, 최종 전체 실행에는 실패가 없다.
- 기존 BE `ShopEquipmentSetTests` 9개 통과: 5부위 일괄 착용/해제 및 다른 옷으로 교체.
- MySQL 8.4 임시 컨테이너에서 V100 → V102 → V151 등록 성공. 신규 상점과 기존 보유 의상이 있는 상점 각각 5슬롯/단일 키·세트/비판매·0원/기존 장착 보존 확인. 전체 애플리케이션 신규 DB 구축이나 실제 dev Flyway 이력 검수와는 구분한다.
- 타입 검사, 개발 배포 설정의 park 빌드, map check 통과. 맵 `c05d8ada8b12d4e509f50c7e807949bd976811e1c69a628232520b88c15a0d07`, 18 tables/536 obstacles 유지.
- 앞선 자산 검수: 43 모션 × 두 LOD, 21,870 frames에서 비정상 수치 없음. 모든 삼각형 간 관통이나 얼굴 morph 감정표현 통과를 의미하지 않는다. 원본 게임 모션만 재사용한다.
- PC 브라우저에서 실제 Avatars 렌더러와 공개 장착 fixture로 기본/새 스킨 교체를 확인한다. fixture는 서버 소유권·다중 실제 계정 검수 결과가 아니다.
- **실제 dev 지급·착용·재접속/다중 계정과 헤드셋 착용 검수는 별도**다. VR 검수는 사용자가 나중에 진행하기로 했다.
- 실제 dev 브라우저에서는 의상 기능이 닫혀 있다는 안내와 WebGL2 불가 화면을 확인했다. 옷장은 새로고침 후 열렸으나 새 스킨은 아직 배포되지 않았다. 위의 유효 빌드 플래그·DB 경로 확인 및 계정 지급이 끝나야 실제 착용 검수를 진행할 수 있다. 로컬 새 스킨 장면은 같은 브라우저에서 렌더링됐다.
