package com.ssafy.ontop.raffle;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

/** V182의 시각·조건·데이터 보호가 바뀌면 MySQL 없이도 실패하도록 파일 계약을 고정한다. */
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
    void V182는_예상한_기존_종료값일_때만_마감을_바꾸고_응모권_데이터는_건드리지_않는다() throws IOException {
        String sql = migration();

        assertThat(sql)
                .contains("ON DUPLICATE KEY UPDATE sales_ends_at = IF(")
                .contains("sales_ends_at = '2026-11-22 15:00:00.000', '2026-11-18 15:00:00.000', sales_ends_at)")
                .doesNotContain("UPDATE raffle_rounds", "UPDATE raffle_tickets", "INSERT INTO raffle_tickets",
                        "wallet", "DROP TABLE", "DELETE FROM", "TRUNCATE TABLE");
    }

    @Test
    void V182는_11월16일_행사_회차를_READY로_등록하고_11월9일을_조건부로_연결한다() throws IOException {
        String sql = migration();

        assertThat(sql)
                .contains("CREATE TABLE raffle_live_events")
                .contains("CHECK (status IN ('READY', 'RUNNING', 'PAUSED', 'COMPLETED'))")
                .contains("SELECT id, 'READY', 'MIGRATION' FROM raffle_rounds WHERE week_start_date = '2026-11-16';")
                .contains("CREATE TABLE raffle_live_event_rounds")
                .contains("CONSTRAINT uk_raffle_live_event_rounds_week UNIQUE (week_start_date)")
                .contains("CONSTRAINT uk_raffle_live_event_rounds_round UNIQUE (raffle_round_id)")
                .contains("SELECT e.id, DATE '2026-11-09', (")
                // 이미 확정된 11/09 결과는 바꾸지 않고 연결 실패(NULL)로 남긴다.
                .contains("WHERE f.event_type = 'RAFFLE' AND f.raffle_round_id = s.id AND f.finalized_at IS NOT NULL");
    }

    @Test
    void V182는_소유자_외래키를_먼저_만든_뒤_회차_일치_외래키를_지운다() throws IOException {
        String sql = migration();
        int index = sql.indexOf("ADD CONSTRAINT uk_raffle_tickets_id_user UNIQUE (id, user_id)");
        int added = sql.indexOf("ADD CONSTRAINT fk_event_raffle_draw_picks_ticket_user");
        int dropped = sql.indexOf("DROP FOREIGN KEY fk_event_raffle_draw_picks_ticket_owner");

        assertThat(index).isGreaterThanOrEqualTo(0).isLessThan(added);
        assertThat(added).isLessThan(dropped);
        assertThat(sql).contains("FOREIGN KEY (raffle_ticket_id, user_id) REFERENCES raffle_tickets(id, user_id)");
    }

    private String migration() throws IOException {
        return new ClassPathResource(MIGRATION).getContentAsString(StandardCharsets.UTF_8);
    }
}
