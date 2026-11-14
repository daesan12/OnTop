-- 점프맵 반복 패턴(녹화 재생 의심) 기록. 운영자 조회 전용이며 판정·보상·랭킹에는 쓰지 않는다.
-- 한 판이 여러 규칙에 걸릴 수 있어 (판, 규칙)마다 한 행이다. 적발 판 수는 run_id 기준으로 센다.
CREATE TABLE jump_macro_detections (
    id BIGINT NOT NULL AUTO_INCREMENT,
    run_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id BIGINT NOT NULL,
    rule VARCHAR(24) NOT NULL,
    matched_runs INT NOT NULL,
    evidence JSON NOT NULL,
    detected_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pk_jump_macro_detections PRIMARY KEY (id),
    CONSTRAINT uk_jump_macro_detections_run_rule UNIQUE (run_id, rule),
    CONSTRAINT fk_jump_macro_detections_run FOREIGN KEY (run_id) REFERENCES jump_runs(id),
    CONSTRAINT fk_jump_macro_detections_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ck_jump_macro_detections_rule CHECK (rule IN ('REPLAY', 'FIXED_START')),
    CONSTRAINT ck_jump_macro_detections_matched CHECK (matched_runs > 0),
    INDEX ix_jump_macro_detections_user (user_id, detected_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
