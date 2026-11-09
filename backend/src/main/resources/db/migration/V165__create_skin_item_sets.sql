-- 아이템 선등록과 세트 구성을 분리한다. 기존 보유/착용/영수증/상품은 수정하지 않는다.
CREATE TABLE skin_item_registrations (
    skin_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    CONSTRAINT fk_skin_item_registration FOREIGN KEY (skin_id) REFERENCES skin_catalog(id)
) ENGINE=InnoDB;

CREATE TABLE skin_item_parts (
    skin_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    item_id BIGINT NOT NULL,
    PRIMARY KEY (skin_id,item_id),
    CONSTRAINT uk_skin_component_item UNIQUE (item_id),
    CONSTRAINT fk_skin_component_registration FOREIGN KEY (skin_id) REFERENCES skin_item_registrations(skin_id),
    CONSTRAINT fk_skin_component_inventory FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB;

CREATE TABLE skin_sets (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    product_code VARCHAR(28) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(100) NOT NULL,
    grade TINYINT NOT NULL,
    compatibility VARCHAR(10) NOT NULL,
    image_skin_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    state VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    state_version BIGINT NOT NULL DEFAULT 0,
    published_at TIMESTAMP(3) NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT uk_skin_set_code UNIQUE (product_code),
    CONSTRAINT fk_skin_set_image FOREIGN KEY (image_skin_id) REFERENCES skin_item_registrations(skin_id),
    CONSTRAINT ck_skin_set_grade CHECK (grade BETWEEN 1 AND 4),
    CONSTRAINT ck_skin_set_character CHECK (compatibility IN ('MALE','FEMALE','ANY')),
    CONSTRAINT ck_skin_set_state CHECK (state IN ('DRAFT','PUBLISHED','DISABLED') AND state_version>=0)
) ENGINE=InnoDB;

CREATE TABLE skin_set_members (
    set_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    skin_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (set_id,skin_id),
    CONSTRAINT fk_skin_set_member_set FOREIGN KEY (set_id) REFERENCES skin_sets(id),
    CONSTRAINT fk_skin_set_member_item FOREIGN KEY (skin_id) REFERENCES skin_item_registrations(skin_id)
) ENGINE=InnoDB;
