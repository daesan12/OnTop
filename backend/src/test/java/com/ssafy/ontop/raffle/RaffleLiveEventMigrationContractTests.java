package com.ssafy.ontop.raffle;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

/** V182의 시각·조건 보호가 바뀌면 MySQL 없이도 실패하도록 파일 계약을 고정한다. */
class RaffleLiveEventMigrationContractTests {
    private static final String MIGRATION = "db/migration/V182__register_raffle_live_event_20261116.sql";

    @Test
    void V182는_UTC_세션에서_11월19일_0시_KST_마감을_기록한다() throws IOException {
        String sql = migration();

        assertThat(sql.indexOf("SET time_zone = '+00:00';"))
                .as("시각 리터럴보다 먼저 세션 시간대를 UTC로 고정한다")
                .isGreaterThanOrEqualTo(0)
                .isLessThan(sql.indexOf("INSERT INTO raffle_rounds"));
        assertThat(sql)
                .contains("VALUES ('2026-11-16', '2026-11-16 00:00:00.000', '2026-11-18 15:00:00.000', 'SCHEDULED')")
                // KST 값을 UTC 세션에 그대로 쓰면 9시간 늦게 마감된다.
                .doesNotContain("2026-11-19 00:00", "2026-11-23 00:00");
    }

    @Test
    void V182는_예상한_기존_종료값일_때만_마감을_바꾼다() throws IOException {
        String sql = migration();

        assertThat(sql)
                .contains("ON DUPLICATE KEY UPDATE sales_ends_at = IF(")
                .contains("sales_ends_at = '2026-11-22 15:00:00.000', '2026-11-18 15:00:00.000', sales_ends_at)")
                .doesNotContain("UPDATE raffle_rounds", "DROP TABLE", "DELETE FROM", "TRUNCATE TABLE");
    }

    @Test
    void V182는_11월16일_회차를_READY_대상으로_등록한다() throws IOException {
        String sql = migration();

        assertThat(sql)
                .contains("CREATE TABLE raffle_live_events")
                .contains("CONSTRAINT uk_raffle_live_events_round UNIQUE (raffle_round_id)")
                .contains("CONSTRAINT fk_raffle_live_events_round FOREIGN KEY (raffle_round_id) "
                        + "REFERENCES raffle_rounds(id)")
                .contains("CHECK (status IN ('READY', 'RUNNING', 'PAUSED', 'COMPLETED'))")
                .contains("SELECT id, 'READY', 'MIGRATION' FROM raffle_rounds WHERE week_start_date = '2026-11-16';");
    }

    private String migration() throws IOException {
        return new ClassPathResource(MIGRATION).getContentAsString(StandardCharsets.UTF_8);
    }
}
