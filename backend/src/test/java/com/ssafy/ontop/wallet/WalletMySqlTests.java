package com.ssafy.ontop.wallet;

import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthUserStateService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.user.service.UserWithdrawalPersistenceService;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import com.ssafy.ontop.wallet.service.ExistingWalletInitializationService;
import com.ssafy.ontop.wallet.service.WalletInitializationService;
import jakarta.persistence.EntityManagerFactory;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

@Tag("mysql")
@ActiveProfiles("db")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class WalletMySqlTests {

    @Autowired private UserRepository users;
    @Autowired private WalletRepository wallets;
    @MockitoSpyBean private WalletTransactionRepository transactions;
    @Autowired private WalletInitializationService initializer;
    @Autowired private ExistingWalletInitializationService existing;
    @Autowired private UserWithdrawalPersistenceService withdrawal;
    @Autowired private AuthUserStateService login;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager manager;
    @Autowired private EntityManagerFactory entities;
    @Autowired private Flyway flyway;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("Wallet 검증은 격리 MySQL DB에서만 수행합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
    }

    @Test
    void 상점없이_V6와_지갑엔티티와_FK와_조회인덱스가_등록된다() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
        assertThat(entities.getMetamodel().getEntities()).extracting(type -> type.getJavaType().getName())
                .contains(Wallet.class.getName(), WalletTransaction.class.getName());
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("6");
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(jdbc.queryForList("""
                SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN ('wallets','wallet_transactions')
                """, String.class)).containsExactlyInAnyOrder("fk_wallets_user", "fk_wallet_transactions_wallet");
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
                AND TABLE_NAME='wallet_transactions' AND INDEX_NAME='ix_wallet_transactions_wallet_id'
                """, Integer.class)).isEqualTo(2);
    }

    @Test
    void 기존활성회원_초기화와_반복실행은_최초100코인만_지급한다() {
        User user = user();
        assertThat(wallets.findByUserId(user.getId())).isEmpty();

        existing.initializeExistingMembers();
        Wallet wallet = wallets.findByUserId(user.getId()).orElseThrow();
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(wallet.reserved()).isZero();
        assertBonus(user.getId(), wallet.id());
        long entries = transactions.count();

        assertThat(existing.initializeExistingMembers().created()).isZero();
        assertThat(wallets.findByUserId(user.getId()).orElseThrow().id()).isEqualTo(wallet.id());
        assertThat(transactions.count()).isEqualTo(entries);
    }

    @Test
    void 지급원장이_없는_기존지갑도_금액과예약액을_그대로_보존한다() {
        User user = user();
        jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES (?,73,20)", user.getId());

        assertThat(initializer.initializeActiveMember(user.getId()))
                .isEqualTo(WalletInitializationService.Result.PRESERVED);
        Wallet wallet = wallets.findByUserId(user.getId()).orElseThrow();
        assertThat(wallet.balance()).isEqualTo(73);
        assertThat(wallet.reserved()).isEqualTo(20);
        assertThat(transactions.existsByIdempotencyKey(WalletTransaction.signupBonusKey(user.getId()))).isFalse();
    }

    @Test
    void 탈퇴회원은_지급하지않고_기존지갑은_복구후에도_중복지급하지_않는다() {
        User without = user();
        withdrawal.withdraw(without.getId());
        existing.initializeExistingMembers();
        assertThat(wallets.findByUserId(without.getId())).isEmpty();

        User owner = user();
        initializer.initializeActiveMember(owner.getId());
        Wallet wallet = wallets.findByUserId(owner.getId()).orElseThrow();
        jdbc.update("UPDATE wallets SET balance=73,reserved_balance=20 WHERE id=?", wallet.id());
        withdrawal.withdraw(owner.getId());
        assertThat(initializer.initializeActiveMember(owner.getId())).isEqualTo(WalletInitializationService.Result.INACTIVE);
        assertThat(login.resolve(new OAuthIdentity(OAuthProvider.SSAFY, owner.getProviderUserId())).userId())
                .isEqualTo(owner.getId());

        assertThat(initializer.initializeActiveMember(owner.getId())).isEqualTo(WalletInitializationService.Result.PRESERVED);
        assertThat(wallets.findByUserId(owner.getId()).orElseThrow().balance()).isEqualTo(73);
        assertThat(wallets.findByUserId(owner.getId()).orElseThrow().reserved()).isEqualTo(20);
        assertBonus(owner.getId(), wallet.id());
    }

    @Test
    void 동시8회_초기화도_회원행잠금으로_지갑과원장을_한번만_생성한다() throws Exception {
        User user = user();
        CountDownLatch ready = new CountDownLatch(8);
        CountDownLatch start = new CountDownLatch(1);
        List<WalletInitializationService.Result> results = new ArrayList<>();
        try (var executor = Executors.newFixedThreadPool(8)) {
            var calls = java.util.stream.IntStream.range(0, 8).mapToObj(index -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("동시 초기화 대기 실패");
                }
                return initializer.initializeActiveMember(user.getId());
            })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            for (var call : calls) {
                results.add(call.get(20, TimeUnit.SECONDS));
            }
        }
        assertThat(results).filteredOn(value -> value == WalletInitializationService.Result.CREATED).hasSize(1);
        assertThat(results).filteredOn(value -> value == WalletInitializationService.Result.PRESERVED).hasSize(7);
        assertBonus(user.getId(), wallets.findByUserId(user.getId()).orElseThrow().id());
    }

    @Test
    void 원장실패는_호출자트랜잭션의_회원과_지갑도_롤백한다() {
        String social = "wallet-fail-" + UUID.randomUUID();
        long beforeWallets = wallets.count();
        doThrow(new DataAccessResourceFailureException("fixture-ledger-failure"))
                .when(transactions).saveAndFlush(any());

        assertThatThrownBy(() -> new TransactionTemplate(manager).execute(status -> {
            User created = users.saveAndFlush(new User(LoginProvider.SSAFY, social, nickname(), CharacterGender.MALE));
            initializer.initializeActiveMember(created.getId());
            return null;
        })).isInstanceOf(DataAccessResourceFailureException.class);

        assertThat(users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, social)).isEmpty();
        assertThat(wallets.count()).isEqualTo(beforeWallets);
    }

    @ParameterizedTest
    @ValueSource(strings = {"-1,0", "100,-1", "100,101"})
    void 잔액과_예약액_CHECK를_DB가_보장한다(String values) {
        User user = user();
        String[] parts = values.split(",");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES (?,?,?)",
                user.getId(), Long.parseLong(parts[0]), Long.parseLong(parts[1])))
                .isInstanceOf(org.springframework.dao.DataAccessException.class)
                .satisfies(exception -> assertThat(((java.sql.SQLException)
                        org.springframework.core.NestedExceptionUtils.getMostSpecificCause(exception)).getErrorCode())
                        .isEqualTo(3819));
    }

    @Test
    void 회원과_최초지급키_UNIQUE와_두_FK가_중복및삭제를_거절한다() {
        User user = user();
        initializer.initializeActiveMember(user.getId());
        Wallet wallet = wallets.findByUserId(user.getId()).orElseThrow();
        assertThatThrownBy(() -> jdbc.update("INSERT INTO wallets(user_id) VALUES (?)", user.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id,transaction_type,balance_delta,reserved_delta,idempotency_key)
                VALUES (?,'SIGNUP_BONUS',100,0,?)
                """, wallet.id(), WalletTransaction.signupBonusKey(user.getId())))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM wallets WHERE id=?", wallet.id()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM users WHERE id=?", user.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO wallets(user_id) VALUES (?)", Long.MAX_VALUE))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void 지갑없이_다른지갑에_가입지급키가_연결된_비정상상태는_관리대상으로_거절한다() {
        User owner = user();
        initializer.initializeActiveMember(owner.getId());
        long walletId = wallets.findByUserId(owner.getId()).orElseThrow().id();
        User broken = user();
        String key = WalletTransaction.signupBonusKey(broken.getId());
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id,transaction_type,balance_delta,reserved_delta,idempotency_key)
                VALUES (?,'SIGNUP_BONUS',100,0,?)
                """, walletId, key);
        try {
            assertThatThrownBy(() -> initializer.initializeActiveMember(broken.getId()))
                    .isInstanceOf(DataIntegrityViolationException.class)
                    .hasMessageContaining("WALLET_INITIALIZATION_REVIEW_REQUIRED");
            assertThat(wallets.findByUserId(broken.getId())).isEmpty();
        } finally {
            // 이 테스트에서 만든 비정상 fixture만 제거한다. 기존 사용자/지갑은 지우지 않는다.
            jdbc.update("DELETE FROM wallet_transactions WHERE idempotency_key=?", key);
        }
    }

    private void assertBonus(long userId, long walletId) {
        var rows = jdbc.queryForList("""
                SELECT transaction_type,balance_delta,reserved_delta,game_session_id,minigame_session_id,item_id
                FROM wallet_transactions WHERE wallet_id=?
                """, walletId);
        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst()).containsEntry("transaction_type", "SIGNUP_BONUS")
                .containsEntry("balance_delta", 100L).containsEntry("reserved_delta", 0L)
                .containsEntry("game_session_id", null).containsEntry("minigame_session_id", null)
                .containsEntry("item_id", null);
        assertThat(transactions.existsByIdempotencyKey(WalletTransaction.signupBonusKey(userId))).isTrue();
    }

    private User user() {
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "wallet133-" + UUID.randomUUID(),
                nickname(), CharacterGender.MALE));
    }

    private String nickname() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }
}
