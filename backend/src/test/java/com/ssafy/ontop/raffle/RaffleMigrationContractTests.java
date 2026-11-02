package com.ssafy.ontop.raffle;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

class RaffleMigrationContractTests {
    private static final String MIGRATION = "db/migration/V140__create_weekly_raffle_tickets.sql";

    @Test
    void V140은_주차와_응모권의_영속_스키마를_생성한다() throws IOException {
        String sql = migration();

        assertThat(sql)
                .contains("CREATE TABLE raffle_rounds", "CREATE TABLE raffle_tickets")
                .contains("week_start_date DATE NOT NULL")
                .contains("sales_starts_at TIMESTAMP(3) NOT NULL")
                .contains("sales_ends_at TIMESTAMP(3) NOT NULL")
                .contains("ticket_price BIGINT NOT NULL DEFAULT 100")
                .contains("weekly_ticket_limit SMALLINT UNSIGNED NOT NULL DEFAULT 10")
                .contains("sales_status VARCHAR(16) NOT NULL DEFAULT 'SCHEDULED'")
                .contains("wallet_transaction_id BIGINT NOT NULL")
                .contains("idempotency_key VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL")
                .doesNotContain("DROP TABLE", "DELETE FROM", "TRUNCATE TABLE");
    }

    @Test
    void V140은_번호와_요청과_원장_중복을_DB에서_차단한다() throws IOException {
        String sql = migration();

        assertThat(sql)
                .contains("CONSTRAINT uk_raffle_rounds_week_start UNIQUE (week_start_date)")
                .contains("CONSTRAINT uk_raffle_tickets_round_number UNIQUE (round_id, ticket_number)")
                .contains("CONSTRAINT uk_raffle_tickets_round_user_request UNIQUE "
                        + "(round_id, user_id, idempotency_key)")
                .contains("CONSTRAINT uk_raffle_tickets_wallet_transaction UNIQUE (wallet_transaction_id)")
                .contains("CONSTRAINT ck_raffle_tickets_number CHECK (ticket_number BETWEEN 1 AND 10000)")
                .contains("CONSTRAINT ck_raffle_rounds_ticket_price CHECK (ticket_price > 0)")
                .contains("CONSTRAINT ck_raffle_rounds_weekly_limit CHECK (weekly_ticket_limit > 0)")
                .contains("CONSTRAINT ck_raffle_rounds_sales_status "
                        + "CHECK (sales_status IN ('SCHEDULED', 'OPEN', 'CLOSED'))")
                .contains("CONSTRAINT ck_raffle_tickets_purchase_price CHECK (purchase_price > 0)")
                .contains("CONSTRAINT ck_raffle_tickets_balance_after CHECK (balance_after >= 0)");
    }

    @Test
    void V140은_주간_사용자_구매수_조회와_참조_무결성을_보장한다() throws IOException {
        String sql = migration();

        assertThat(sql)
                .contains("INDEX ix_raffle_tickets_round_user_purchased "
                        + "(round_id, user_id, purchased_at, id)")
                .contains("CONSTRAINT fk_raffle_tickets_round FOREIGN KEY (round_id) REFERENCES raffle_rounds(id)")
                .contains("CONSTRAINT fk_raffle_tickets_user FOREIGN KEY (user_id) REFERENCES users(id)")
                .contains("FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id)");
    }

    private String migration() throws IOException {
        var resource = new ClassPathResource(MIGRATION);
        return resource.getContentAsString(StandardCharsets.UTF_8);
    }
}
