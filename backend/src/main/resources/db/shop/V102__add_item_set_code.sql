-- 세트 의상(예: 장군 갑옷)의 부위 아이템을 묶는다. 같은 set_code의 보유 의상은 함께 장착·해제된다.
-- NULL은 부위별로 따로 입는 일반 의상이다. 상점 V100과 같은 선택적 db/shop 위치에 둔다.
ALTER TABLE items ADD COLUMN set_code VARCHAR(50) NULL;
