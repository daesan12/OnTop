package com.ssafy.ontop.world.mobility;

import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@DataJpaTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/shop,classpath:db/minigame")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(MobilityWallet.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class MobilityWalletMySqlTests {
    @Autowired private UserRepository users;
    @Autowired private WalletRepository wallets;
    @Autowired private WalletTransactionRepository transactions;
    @Autowired private MobilityWallet mobilityWallet;
    @Autowired private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("탈것 결제 검증은 격리 MySQL DB에서만 수행합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
    }

    @Test
    void 하차가_커밋보다_빠르면_플러시된_잔액과_원장을_함께_롤백한다() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
        String lease = UUID.randomUUID().toString();
        var user = users.saveAndFlush(new User(LoginProvider.SSAFY, "mobility-" + lease,
                "M" + lease.substring(0, 7), CharacterGender.FEMALE));
        long account = user.getId();
        var wallet = wallets.findByUserId(account)
                .orElseGet(() -> wallets.saveAndFlush(Wallet.forSignup(account, Instant.now())));
        long balance = wallet.balance();
        String first = "mobility:" + wallet.id() + ":" + lease + ":1";
        String second = "mobility:" + wallet.id() + ":" + lease + ":2";

        assertThatThrownBy(() -> mobilityWallet.charge(account, lease, 1, 2, () -> false))
                .isInstanceOf(MobilityWallet.PaymentCancelled.class);
        assertThat(wallets.findByUserId(account).orElseThrow().balance()).isEqualTo(balance);
        assertThat(transactions.existsByIdempotencyKey(first)).isFalse();

        assertThat(mobilityWallet.charge(account, lease, 1, 2, () -> true)).isEqualTo(MobilityWallet.Payment.PAID);
        assertThat(mobilityWallet.charge(account, lease, 1, 2, () -> true))
                .isEqualTo(MobilityWallet.Payment.ALREADY_PAID);
        assertThatThrownBy(() -> mobilityWallet.charge(account, lease, 2, 2, () -> false))
                .isInstanceOf(MobilityWallet.PaymentCancelled.class);
        assertThat(wallets.findByUserId(account).orElseThrow().balance()).isEqualTo(balance - 2);
        assertThat(transactions.existsByIdempotencyKey(first)).isTrue();
        assertThat(transactions.existsByIdempotencyKey(second)).isFalse();
    }
}
