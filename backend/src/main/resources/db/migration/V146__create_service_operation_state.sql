CREATE TABLE service_operation_state (
    id TINYINT UNSIGNED NOT NULL,
    mode VARCHAR(16) NOT NULL,
    notice VARCHAR(200) NOT NULL DEFAULT '',
    maintenance_started_at DATETIME(3) NULL,
    expected_open_at DATETIME(3) NULL,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_by BIGINT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT pk_service_operation_state PRIMARY KEY (id),
    CONSTRAINT ck_service_operation_state_singleton CHECK (id = 1),
    CONSTRAINT ck_service_operation_state_mode CHECK (mode IN ('NORMAL', 'DRAINING', 'MAINTENANCE')),
    CONSTRAINT fk_service_operation_state_updated_by
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO service_operation_state (
    id, mode, notice, maintenance_started_at, expected_open_at, version, updated_by, updated_at
) VALUES (1, 'NORMAL', '', NULL, NULL, 0, NULL, UTC_TIMESTAMP(3));
