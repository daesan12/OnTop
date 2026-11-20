package com.ssafy.ontop.raffle;

import com.ssafy.ontop.raffle.domain.RaffleNumberGenerator;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import com.ssafy.ontop.raffle.service.RaffleService;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
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
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

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
        // V182의 공개 추첨 행사 연결·등록이 raffle_rounds를 참조하므로 먼저 지운다.
        for (String table : List.of("raffle_tickets", "raffle_live_event_rounds", "raffle_live_events",
                "raffle_rounds", "wallet_transactions", "wallets", "users")) {
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
    void V182_마감은_11월18일_23시59분59초999_KST까지만_구매를_받는다() throws Exception {
        // setUp이 지운 V182의 회차·등록 데이터를 파일 문장 그대로 다시 만든다(회차가 없는 경로).
        RaffleLiveEventMigrationScript.run(jdbc, sql -> sql.startsWith("INSERT INTO"));
        long userId = member(500, 0);
        var lastMoment = service(Instant.parse("2026-11-18T14:59:59.999Z"));

        assertThat(lastMoment.current(userId).salesEndsAt()).isEqualTo(Instant.parse("2026-11-18T15:00:00Z"));
        assertThat(lastMoment.purchase(userId, "before-deadline").ticketNumber()).isBetween(1, 10_000);
        var deadline = service(Instant.parse("2026-11-18T15:00:00Z"));
        assertThatThrownBy(() -> deadline.purchase(userId, "at-deadline"))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_SALES_CLOSED"));
        // 거부된 구매 트랜잭션의 상태 갱신은 롤백되므로, 복권방 화면이 받는 조회 응답으로 마감 상태를 확인한다.
        assertThat(deadline.current(userId).salesStatus()).isEqualTo("CLOSED");
        assertThat(count("raffle_tickets")).isOne();
        assertThat(balance(userId)).isEqualTo(400);
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
    void 서로_다른_회원_50명이_동시에_구매해도_응모번호와_원장은_중복되지_않는다() throws Exception {
        var users = new ArrayList<Long>();
        for (int index = 0; index < 50; index++) {
            users.add(member(500, 0));
        }
        service.current(users.getFirst());
        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var pending = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (int index = 0; index < users.size(); index++) {
                long userId = users.get(index);
                String key = "parallel-" + index;
                pending.add(executor.submit(() -> {
                    start.await();
                    return service.purchase(userId, key).ticketNumber();
                }));
            }
            start.countDown();
            var numbers = new ArrayList<Integer>();
            for (var request : pending) {
                numbers.add(request.get(20, TimeUnit.SECONDS));
            }
            assertThat(numbers).hasSize(50).doesNotHaveDuplicates();
        }
        assertThat(count("raffle_tickets")).isEqualTo(50);
        assertThat(count("wallet_transactions")).isEqualTo(50);
    }

    @Test
    void 같은_회원의_서로_다른_요청은_지갑_잠금으로_주간_한도를_지킨다() throws Exception {
        long userId = member(2_000, 0);
        service.current(userId);
        jdbc.update("UPDATE raffle_rounds SET weekly_ticket_limit = 1");
        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var pending = new ArrayList<java.util.concurrent.Future<String>>();
            for (int index = 0; index < 12; index++) {
                String key = "limit-" + index;
                pending.add(executor.submit(() -> {
                    start.await();
                    try {
                        service.purchase(userId, key);
                        return "PURCHASED";
                    } catch (RaffleException rejected) {
                        return rejected.code();
                    }
                }));
            }
            start.countDown();
            var results = new ArrayList<String>();
            for (var request : pending) results.add(request.get(20, TimeUnit.SECONDS));
            assertThat(results).filteredOn("PURCHASED"::equals).hasSize(1);
            assertThat(results).filteredOn("RAFFLE_WEEKLY_LIMIT_REACHED"::equals).hasSize(11);
        }
        assertThat(balance(userId)).isEqualTo(1_900);
        assertThat(count("raffle_tickets")).isOne();
        assertThat(count("wallet_transactions")).isOne();
    }

    @Test
    void 같은_응모번호가_충돌하면_롤백하고_새_번호로_다시_구매한다() {
        long firstUser = member(500, 0);
        int takenNumber = service.purchase(firstUser, "first").ticketNumber();
        long nextUser = member(500, 0);
        int nextNumber = takenNumber == 10_000 ? 1 : takenNumber + 1;
        RaffleNumberGenerator generated = mock(RaffleNumberGenerator.class);
        when(generated.unusedNumber(anySet())).thenReturn(takenNumber, nextNumber);
        RaffleService retrying = new RaffleService(raffles, wallets, ledger, transactions,
                Clock.fixed(OPEN_TIME, ZoneOffset.UTC), generated);

        assertThat(retrying.purchase(nextUser, "retry").ticketNumber()).isEqualTo(nextNumber);
        assertThat(balance(nextUser)).isEqualTo(400);
        assertThat(count("raffle_tickets")).isEqualTo(2);
        assertThat(count("wallet_transactions")).isEqualTo(2);
    }

    @Test
    void 조회한_직후_판매가_닫히면_공유_잠금에서_새_상태를_확인해_구매를_거절한다() throws Exception {
        long userId = member(500, 0);
        service.current(userId);
        CountDownLatch oldRoundRead = new CountDownLatch(1);
        CountDownLatch resumePurchase = new CountDownLatch(1);
        RaffleRepository delayedRead = new RaffleRepository(jdbc) {
            @Override
            public Optional<com.ssafy.ontop.raffle.domain.RaffleRound> round(LocalDate weekStartDate) {
                var snapshot = super.round(weekStartDate);
                oldRoundRead.countDown();
                try {
                    if (!resumePurchase.await(10, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("구매 재개 신호를 받지 못했습니다.");
                    }
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(interrupted);
                }
                return snapshot;
            }
        };
        RaffleService racing = new RaffleService(delayedRead, wallets, ledger, transactions,
                Clock.fixed(OPEN_TIME, ZoneOffset.UTC), new RaffleNumberGenerator());

        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var attempt = executor.submit(() -> {
                try {
                    racing.purchase(userId, "after-close");
                    return "PURCHASED";
                } catch (RaffleException rejected) {
                    return rejected.code();
                }
            });
            assertThat(oldRoundRead.await(10, TimeUnit.SECONDS)).isTrue();
            jdbc.update("UPDATE raffle_rounds SET sales_status = 'CLOSED'");
            resumePurchase.countDown();
            assertThat(attempt.get(10, TimeUnit.SECONDS)).isEqualTo("RAFFLE_SALES_CLOSED");
        }
        assertThat(balance(userId)).isEqualTo(500);
        assertThat(count("raffle_tickets")).isZero();
        assertThat(count("wallet_transactions")).isZero();
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

    private RaffleService service(Instant now) {
        return new RaffleService(raffles, wallets, ledger, transactions,
                Clock.fixed(now, ZoneOffset.UTC), new RaffleNumberGenerator());
    }

    private long balance(long userId) {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, userId);
    }

    private long count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
    }
}
