-- 의상 뽑기: 기존 지갑/정산/선택적 상점 테이블은 변경하지 않는다.
-- 상품-아이템 연결은 선택적 db/shop 적용 후 등록하며, 부위 상품의 중복 소속을 금지한다.
CREATE TABLE gacha_machine (
    id TINYINT NOT NULL PRIMARY KEY,
    round_id BIGINT NOT NULL DEFAULT 1,
    state_version BIGINT NOT NULL DEFAULT 0,
    first_remaining INT NOT NULL DEFAULT 1,
    second_remaining INT NOT NULL DEFAULT 2,
    third_remaining INT NOT NULL DEFAULT 4,
    fourth_remaining INT NOT NULL DEFAULT 8,
    coin_remaining INT NOT NULL DEFAULT 15,
    CONSTRAINT ck_gacha_machine CHECK (id = 1 AND round_id > 0 AND state_version >= 0
        AND first_remaining BETWEEN 0 AND 1 AND second_remaining BETWEEN 0 AND 2
        AND third_remaining BETWEEN 0 AND 4 AND fourth_remaining BETWEEN 0 AND 8
        AND coin_remaining BETWEEN 0 AND 15)
) ENGINE=InnoDB;
INSERT INTO gacha_machine (id) VALUES (1);

CREATE TABLE gacha_inventory (
    user_id BIGINT NOT NULL PRIMARY KEY,
    tickets BIGINT NOT NULL DEFAULT 0,
    first_boxes BIGINT NOT NULL DEFAULT 0,
    second_boxes BIGINT NOT NULL DEFAULT 0,
    third_boxes BIGINT NOT NULL DEFAULT 0,
    fourth_boxes BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_gacha_inventory_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_gacha_inventory CHECK (tickets >= 0 AND first_boxes >= 0 AND second_boxes >= 0
        AND third_boxes >= 0 AND fourth_boxes >= 0)
) ENGINE=InnoDB;

CREATE TABLE gacha_products (
    product_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    grade TINYINT NOT NULL,
    compatibility VARCHAR(10) NOT NULL,
    image_key VARCHAR(255) NOT NULL,
    collection_code VARCHAR(64) NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT ck_gacha_product_grade CHECK (grade BETWEEN 1 AND 4),
    CONSTRAINT ck_gacha_product_compatibility CHECK (compatibility IN ('MALE','FEMALE','ANY'))
) ENGINE=InnoDB;

CREATE TABLE gacha_product_items (
    product_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    item_id BIGINT NOT NULL,
    PRIMARY KEY (product_code, item_id),
    CONSTRAINT uk_gacha_product_item UNIQUE (item_id),
    CONSTRAINT fk_gacha_product_item_product FOREIGN KEY (product_code) REFERENCES gacha_products(product_code)
) ENGINE=InnoDB;

CREATE TABLE gacha_receipts (
    user_id BIGINT NOT NULL,
    operation_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    operation_kind VARCHAR(12) NOT NULL,
    operation_target VARCHAR(64) NOT NULL,
    result_json JSON NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    PRIMARY KEY (user_id, operation_id),
    CONSTRAINT fk_gacha_receipt_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 각 서버가 자기 전달 커서로 모든 이벤트를 소비한다. 한 노드의 전송 완료가 다른 노드를 막지 않는다.
CREATE TABLE gacha_events (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    payload JSON NOT NULL,
    created_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT uk_gacha_event UNIQUE (event_id)
) ENGINE=InnoDB;
CREATE TABLE gacha_delivery_cursors (
    node_id VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    last_event_id BIGINT NOT NULL
) ENGINE=InnoDB;
