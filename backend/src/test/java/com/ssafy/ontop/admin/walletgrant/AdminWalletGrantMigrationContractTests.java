package com.ssafy.ontop.admin.walletgrant;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

class AdminWalletGrantMigrationContractTests {
    private static final String MIGRATION = "db/migration/V142__create_admin_wallet_grants.sql";

    @Test
    void V142는_일괄_지급_배치와_회원별_감사_기록을_생성한다() throws IOException {
        String sql = migration();

        assertThat(sql)
                .contains("CREATE TABLE admin_wallet_grant_batches")
                .contains("CREATE TABLE admin_wallet_grant_entries")
                .contains("administrator_user_id BIGINT NOT NULL")
                .contains("amount_per_member BIGINT NOT NULL")
                .contains("recipient_count INT NOT NULL")
                .contains("total_amount BIGINT NOT NULL")
                .contains("balance_before BIGINT NOT NULL")
                .contains("balance_after BIGINT NOT NULL")
                .doesNotContain("DROP TABLE", "DELETE FROM", "TRUNCATE TABLE");
    }

    @Test
    void V142는_멱등성과_원장_연결을_DB에서_보장한다() throws IOException {
        String sql = migration();

        assertThat(sql)
                .contains("CONSTRAINT uk_admin_wallet_grant_batches_request UNIQUE (request_id)")
                .contains("CONSTRAINT pk_admin_wallet_grant_entries PRIMARY KEY (batch_id, user_id)")
                .contains("CONSTRAINT uk_admin_wallet_grant_entries_transaction UNIQUE (wallet_transaction_id)")
                .contains("FOREIGN KEY (administrator_user_id) REFERENCES users(id)")
                .contains("FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id)")
                .contains("CHECK (total_amount = amount_per_member * recipient_count)");
    }

    private String migration() throws IOException {
        return new ClassPathResource(MIGRATION).getContentAsString(StandardCharsets.UTF_8);
    }
}
