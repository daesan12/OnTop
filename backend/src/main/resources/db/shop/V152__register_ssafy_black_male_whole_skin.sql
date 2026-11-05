-- 사용자 최종 지정 V152. 팀원의 db/minigame V151은 그대로 보존한다.
-- 선택적 db/shop 스키마에만 등록한다.
-- 배포 전 팀 예약 및 전체 location의 버전 중복을 확인한다.
-- 통짜 GLB 한 개를 기존 5슬롯 세트 계약으로 착용한다. 검수용이며 판매·자동 지급은 하지 않는다.
INSERT INTO items (item_code, name, item_type, equip_slot, price, image_key, is_for_sale, set_code) VALUES
    ('SSAFY_BLACK_MALE_V3_HAIR', 'SSAFY 검정 후드 머리', 'EQUIPMENT', 'HAIR', 0, 'skin/ssafy-black-male/v3', FALSE, 'SSAFY_BLACK_MALE_V3'),
    ('SSAFY_BLACK_MALE_V3_FACE', 'SSAFY 검정 후드 얼굴', 'EQUIPMENT', 'FACE', 0, 'skin/ssafy-black-male/v3', FALSE, 'SSAFY_BLACK_MALE_V3'),
    ('SSAFY_BLACK_MALE_V3_TOP', 'SSAFY 검정 후드 상의', 'EQUIPMENT', 'TOP', 0, 'skin/ssafy-black-male/v3', FALSE, 'SSAFY_BLACK_MALE_V3'),
    ('SSAFY_BLACK_MALE_V3_BOTTOM', 'SSAFY 검정 후드 하의', 'EQUIPMENT', 'BOTTOM', 0, 'skin/ssafy-black-male/v3', FALSE, 'SSAFY_BLACK_MALE_V3'),
    ('SSAFY_BLACK_MALE_V3_SHOES', 'SSAFY 검정 후드 신발', 'EQUIPMENT', 'SHOES', 0, 'skin/ssafy-black-male/v3', FALSE, 'SSAFY_BLACK_MALE_V3');
