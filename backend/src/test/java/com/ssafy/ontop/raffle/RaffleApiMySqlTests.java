package com.ssafy.ontop.raffle;

import com.ssafy.ontop.raffle.domain.RaffleNumberGenerator;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import com.ssafy.ontop.raffle.service.RaffleService;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.raffle.enabled=true",
        // 운영 DB_MIGRATION_LOCATIONS와 같이 적용한다. V165가 db/shop의 items를 참조한다.
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop,classpath:db/minigame",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class RaffleApiMySqlTests {
    private static final Instant OPEN_TIME = Instant.parse("2026-11-02T00:30:00Z");
    @Autowired private RaffleRepository raffles;
    @Autowired private WalletRepository wallets;
    @Autowired private WalletTransactionRepository ledger;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private Flyway flyway;
    private RaffleService service;

    @DynamicPropertySource
    static void 격리_DB만_사용한다(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_RAFFLE_API_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_raffle_api_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_raffle_api_test_ 전용 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_RAFFLE_API_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_RAFFLE_API_DB_PASSWORD"));
    }

    @BeforeEach
    void setUp() {
        for (String table : List.of("raffle_tickets", "raffle_rounds", "wallet_transactions", "wallets", "users")) {
            jdbc.update("DELETE FROM " + table);
        }
        service = new RaffleService(raffles, wallets, ledger, transactions,
                Clock.fixed(OPEN_TIME, ZoneOffset.UTC), new RaffleNumberGenerator());
    }

    @Test
    void V140에서_구매와_멱등_재요청은_한_번의_차감과_한_응모권만_남긴다() {
        long userId = member(500, 100);

        var first = service.purchase(userId, "request-1");
        var repeated = service.purchase(userId, "request-1");

        assertThat(flyway.info().pending()).isEmpty();
        assertThat(repeated).isEqualTo(first);
        assertThat(balance(userId)).isEqualTo(400);
        assertThat(count("raffle_tickets")).isOne();
        assertThat(count("wallet_transactions")).isOne();
        assertThat(service.current(userId).tickets()).singleElement()
                .satisfies(ticket -> assertThat(ticket.ticketNumber()).isEqualTo(first.ticketNumber()));
    }

    @Test
    void 한_회원은_한_주에_서로_다른_번호를_쉰_장까지만_구매한다() {
        long userId = member(6_000, 0);
        var numbers = new ArrayList<Integer>();
        for (int index = 0; index < 50; index++) {
            numbers.add(service.purchase(userId, "request-" + index).ticketNumber());
        }

        assertThat(numbers).doesNotHaveDuplicates().allMatch(number -> number >= 1 && number <= 10_000);
        assertThatThrownBy(() -> service.purchase(userId, "request-50"))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_WEEKLY_LIMIT_REACHED"));
        assertThat(balance(userId)).isEqualTo(1_000);
        assertThat(count("raffle_tickets")).isEqualTo(50);
    }

    @Test
    void 같은_키의_동시_요청은_응모권과_차감을_중복하지_않는다() throws Exception {
        long userId = member(1_000, 0);
        var start = new CountDownLatch(1);
        var tickets = new ArrayList<Long>();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var pending = java.util.stream.IntStream.range(0, 6).mapToObj(index -> executor.submit(() -> {
                start.await();
                return service.purchase(userId, "same-key").ticketId();
            })).toList();
            start.countDown();
            for (var request : pending) {
                tickets.add(request.get(15, TimeUnit.SECONDS));
            }
        }

        assertThat(tickets).allMatch(tickets.getFirst()::equals);
        assertThat(balance(userId)).isEqualTo(900);
        assertThat(count("raffle_tickets")).isOne();
        assertThat(count("wallet_transactions")).isOne();
    }

    @Test
    void 원장_저장이_실패하면_잔액과_응모권을_함께_롤백한다() {
        long userId = member(500, 0);
        jdbc.execute("""
                ALTER TABLE wallet_transactions ADD CONSTRAINT ck_raffle_test_fail_ledger
                CHECK (transaction_type <> 'RAFFLE_PURCHASE')
                """);
        try {
            assertThatThrownBy(() -> service.purchase(userId, "rollback"))
                    .isInstanceOf(RuntimeException.class);
            assertThat(balance(userId)).isEqualTo(500);
            assertThat(count("raffle_tickets")).isZero();
            assertThat(count("wallet_transactions")).isZero();
        } finally {
            jdbc.execute("ALTER TABLE wallet_transactions DROP CHECK ck_raffle_test_fail_ledger");
        }
    }

    private long member(long balance, long reserved) {
        String providerId = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO users(login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)
                VALUES ('NAVER', ?, ?, 'MALE', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                """, providerId, "r" + UUID.randomUUID().toString().substring(0, 7));
        long userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE login_provider = 'NAVER' AND provider_user_id = ?",
                Long.class, providerId);
        jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, ?, ?)",
                userId, balance, reserved);
        return userId;
    }

    private long balance(long userId) {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, userId);
    }

    private long count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
    }
}
