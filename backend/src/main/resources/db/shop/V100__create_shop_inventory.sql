-- 선택적 상점 스키마. 기본 db/migration에는 자동 포함하지 않는다.
-- 기존 items/user_items가 이미 있으면 별도 대조 후 통합한다. 공통 wallets/원장은 생성하지 않는다.
CREATE TABLE items (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    item_code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    item_type VARCHAR(20) NOT NULL,
    equip_slot VARCHAR(20) NULL,
    price BIGINT NOT NULL,
    image_key VARCHAR(255) NOT NULL,
    is_for_sale BOOLEAN NOT NULL,
    CONSTRAINT uk_items_code UNIQUE (item_code),
    CONSTRAINT ck_items_price CHECK (price >= 0),
    CONSTRAINT ck_items_type_slot CHECK (
        (item_type = 'CONSUMABLE' AND equip_slot IS NULL)
        OR (item_type = 'EQUIPMENT' AND equip_slot IS NOT NULL
            AND equip_slot IN ('HAIR','FACE','TOP','BOTTOM','SHOES'))
    )
) ENGINE=InnoDB;

CREATE TABLE user_items (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL,
    quantity INT NOT NULL,
    is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uk_user_items_user_item UNIQUE (user_id, item_id),
    CONSTRAINT fk_user_items_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_user_items_item FOREIGN KEY (item_id) REFERENCES items(id),
    CONSTRAINT ck_user_items_quantity CHECK (quantity >= 0)
) ENGINE=InnoDB;

-- 원장에는 수량/당시가격/응답이 없어 동일 키 재조회·충돌 판정용 영수증을 별도로 보존한다.
CREATE TABLE shop_purchases (
    purchase_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    item_id BIGINT NOT NULL,
    quantity INT NOT NULL,
    unit_price BIGINT NOT NULL,
    total_price BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    user_item_id BIGINT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT uk_shop_purchase_user_key UNIQUE (user_id, request_key),
    CONSTRAINT fk_shop_purchase_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_shop_purchase_item FOREIGN KEY (item_id) REFERENCES items(id),
    CONSTRAINT fk_shop_purchase_owned FOREIGN KEY (user_item_id) REFERENCES user_items(id),
    CONSTRAINT ck_shop_purchase_values CHECK (
        quantity > 0 AND unit_price >= 0 AND total_price >= 0 AND balance_after >= 0
    )
) ENGINE=InnoDB;

