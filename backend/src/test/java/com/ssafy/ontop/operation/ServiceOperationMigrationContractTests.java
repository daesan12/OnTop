package com.ssafy.ontop.operation;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

class ServiceOperationMigrationContractTests {
    private static final String MIGRATION = "db/migration/V146__create_service_operation_state.sql";

    @Test
    void V146은_단일_운영_상태와_낙관적_버전을_생성한다() throws IOException {
        String sql = new ClassPathResource(MIGRATION).getContentAsString(StandardCharsets.UTF_8);

        assertThat(sql)
                .contains("CREATE TABLE service_operation_state")
                .contains("CHECK (id = 1)")
                .contains("'NORMAL', 'DRAINING', 'MAINTENANCE'")
                .contains("expected_open_at DATETIME(3) NULL")
                .contains("version BIGINT UNSIGNED NOT NULL DEFAULT 0")
                .contains("VALUES (1, 'NORMAL'")
                .doesNotContain("DROP TABLE", "DELETE FROM", "TRUNCATE TABLE");
    }
}
