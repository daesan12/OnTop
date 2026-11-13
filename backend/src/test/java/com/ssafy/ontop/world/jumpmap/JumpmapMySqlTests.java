package com.ssafy.ontop.world.jumpmap;

import java.nio.file.Path;
import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 실제 MySQL 8.4: V131, 문 지급 트랜잭션·하루 상한·멱등·자정·원장 일치·재시작 정리(BE 명세 8·10·15장). */
@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.world.jumpmap.enabled=true",
        // V165가 db/shop의 items를 참조한다.
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=공원",
        "ontop.world.channels[0].capacity=20",
        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
        "ontop.world.map.json-path=../frontend/generated/park/server-map.json",
        "ontop.world.map.manifest-path=../frontend/generated/park/manifest.json"
})
class JumpmapMySqlTests {
    @Test
    void 과거_시간검사만_실패한_판을_랭킹과_최고기록에서_일관되게_조회한다() {
        // 기존 DB의 과거 행을 배포 후 처음 읽는 상황. 다른 테스트의 메모리 스냅샷은 재사용하지 않는다.
        var reader = new JdbcJumpmapStore(jdbc, entities, transactions);
        String run = startRun(101, NOON);
        store.end(run, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON.plusSeconds(60),
                60_158, 60_158L, 7, true, 46, List.of(12, 5, 7, 7, 9, 10, 7), true,
                List.of("TOO_FAST:7")));

        assertThat(reader.ranking(101).me()).isNotNull().satisfies(me -> {
            assertThat(me.rank()).isEqualTo(1);
            assertThat(me.finishMs()).isEqualTo(60_158);
        });
        assertThat(reader.status(101, NOON.plusSeconds(61)).bestFinishMs()).isEqualTo(60_158);
        assertThat(jdbc.queryForObject("SELECT suspicious FROM jump_runs WHERE id=?", Boolean.class, run)).isTrue();
        assertThat(jdbc.queryForObject("SELECT coins_granted FROM jump_runs WHERE id=?", Integer.class, run)).isZero();

        String slower = startRun(101, NOON.plusSeconds(100));
        var end = store.end(slower, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON.plusSeconds(170),
                70_000, 70_000L, 7, true, 46, List.of(), false, List.of()));
        assertThat(end.newBest()).isFalse();
        assertThat(end.bestFinishMs()).isEqualTo(60_158);
    }

    @Test
    void 완주_저장후_빈랭킹과_개인최고를_즉시_갱신하고_밀리초를_보존한다() throws Exception {
        assertThat(store.ranking(101).items()).isEmpty();
        String run = startRun(101, NOON);
        var finish = new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON.plusSeconds(100), 90_085,
                90_085L, 7, true, 46, List.of(), false, List.of());

        store.end(run, finish);
        var first = mapper.readTree(call("GET", "/rankings", 101L, null).body());

        assertThat(first.at("/me/finishMs").asLong()).isEqualTo(90_085);
        assertThat(first.at("/items/0/finishMs").asLong()).isEqualTo(90_085);
        String faster = startRun(202, NOON.plusSeconds(200));
        store.end(faster, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON.plusSeconds(290), 89_999,
                89_999L, 7, true, 46, List.of(), false, List.of()));
        assertThat(store.ranking(101).me().rank()).isEqualTo(2);
        String improved = startRun(101, NOON.plusSeconds(300));
        store.end(improved, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON.plusSeconds(380), 80_085,
                80_085L, 7, true, 46, List.of(), false, List.of()));
        assertThat(store.ranking(101).me().finishMs()).isEqualTo(80_085);
        assertThat(store.ranking(202).me().rank()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT finish_ms FROM jump_runs WHERE id=?", Long.class, improved))
                .isEqualTo(80_085);
        // 같은 종료 재시도와 의심 기록은 확정 최고 기록을 바꾸지 않는다.
        assertThat(store.end(improved, finish).newBest()).isFalse();
        String suspicious = startRun(101, NOON.plusSeconds(400));
        store.end(suspicious, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON.plusSeconds(401), 1_000,
                1_000L, 7, true, 46, List.of(), true, List.of("TOO_FAST")));
        assertThat(store.ranking(101).me().finishMs()).isEqualTo(80_085);
    }

    @Test
    void 랭킹은_검증된_개인최고와_공동등수와_먼저도착한순서를_사용한다() throws Exception {
        jdbc.update("INSERT INTO users(id, login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)"
                + " VALUES (303, 'NAVER', 'rank303', '세번째', 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))");
        jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (303, 100, 0)");
        String first = startRun(202, NOON), second = startRun(101, NOON);
        store.end(first, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON.plusSeconds(100), 90_123, 90_123L,
                7, true, 46, List.of(), false, List.of()));
        store.end(second, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON.plusSeconds(101), 90_123, 90_123L,
                7, true, 46, List.of(), false, List.of()));
        String third = startRun(303, NOON);
        store.end(third, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON.plusSeconds(102), 100_001, 100_001L,
                7, true, 46, List.of(), false, List.of()));
        String slower = startRun(202, NOON);
        store.end(slower, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON.plusSeconds(200), 100_000, 100_000L,
                7, true, 46, List.of(), false, List.of()));
        String suspicious = startRun(101, NOON);
        store.end(suspicious, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON.plusSeconds(10), 1_000, 1_000L,
                7, true, 46, List.of(), true, List.of("TOO_FAST")));

        var ranking = store.ranking(101);
        assertThat(ranking.items()).extracting(JumpmapStore.RankingEntry::userId).containsExactly("202", "101", "303");
        assertThat(ranking.items()).extracting(JumpmapStore.RankingEntry::rank).containsExactly(1, 1, 3);
        assertThat(ranking.me().finishMs()).isEqualTo(90_123);
        assertThat(call("GET", "/rankings", null, null).statusCode()).isEqualTo(401);
        assertThat(mapper.readTree(call("GET", "/rankings", 101L, null).body()).path("items").size()).isEqualTo(3);
        jdbc.update("UPDATE jump_runs SET rules_version = 'v2' WHERE id = ?", first);
        // 공유 스냅샷은 2분 동안 유지한다. 새 인스턴스의 첫 조회는 변경된 DB를 읽는다.
        assertThat(store.ranking(202).me().finishMs()).isEqualTo(90_123);
        assertThat(store.ranking(101).items()).extracting(JumpmapStore.RankingEntry::userId)
                .containsExactly("202", "101", "303");
        var refreshed = new JdbcJumpmapStore(jdbc, entities, transactions).ranking(202);
        assertThat(refreshed.me().finishMs()).isEqualTo(100_000);
        assertThat(refreshed.items()).extracting(JumpmapStore.RankingEntry::userId)
                .containsExactly("101", "202", "303");
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired JumpmapStore store;
    @Autowired JumpmapService service;
    @Autowired JumpmapActivation activation;
    @Autowired Flyway flyway;
    @Autowired jakarta.persistence.EntityManager entities;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @Autowired com.ssafy.ontop.auth.service.AuthExchangePersistenceService issuer;
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    private final java.net.http.HttpClient http = java.net.http.HttpClient.newHttpClient();
    private final com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
    private int runs;

    private java.net.http.HttpResponse<String> call(String method, String path, Long user, String body) throws Exception {
        var builder = java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:" + port + "/api/v1/minigames/jumpmap" + path))
                .header("Origin", "http://localhost:8080");
        if (user != null) {
            builder.header("Authorization", "Bearer " + issuer.issueExisting(new com.ssafy.ontop.auth.domain.LoginOutcome(
                    com.ssafy.ontop.auth.domain.OAuthProvider.NAVER, com.ssafy.ontop.auth.domain.LoginOutcome.Status.EXISTING_MEMBER,
                    user, null)).accessToken());
        }
        if (body != null) builder.header("Content-Type", "application/json");
        return http.send(builder.method(method, body == null ? java.net.http.HttpRequest.BodyPublishers.noBody()
                : java.net.http.HttpRequest.BodyPublishers.ofString(body)).build(), java.net.http.HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void REST_status와_tips_계약과_최근종료_lastRun() throws Exception {
        assertThat(call("GET", "/status?channelId=channel-1", null, null).statusCode()).isEqualTo(401);
        var first = mapper.readTree(call("GET", "/status?channelId=channel-1", 101L, null).body());
        assertThat(first.path("enabled").asBoolean()).isTrue();
        assertThat(first.path("channelId").asText()).isEqualTo("channel-1");
        assertThat(first.path("mapVersion").asText()).isEqualTo(service.mapVersion()).matches("[0-9a-f]{64}");
        assertThat(first.path("courseVersion").asText()).isEqualTo("park180-jump-v1");
        assertThat(first.path("rulesVersion").asText()).isEqualTo("v3");
        assertThat(first.path("isFirstRun").asBoolean()).isTrue();
        assertThat(first.path("dailyCap").asInt()).isEqualTo(1000);
        assertThat(first.path("todayEarned").asInt()).isZero();
        assertThat(first.path("earningsDate").asText()).matches("\\d{4}-\\d{2}-\\d{2}");
        assertThat(first.path("activeRunId").isNull()).isTrue();
        assertThat(first.path("activeRun").isNull()).isTrue();
        assertThat(first.path("lastRun").isNull()).isTrue();
        assertThat(first.path("bestFinishMs").isNull()).isTrue();

        assertThat(call("POST", "/tips", 101L, "{\"tips\":[\"START_SPOT\",\"UNKNOWN\"]}").statusCode()).isEqualTo(204);
        assertThat(call("POST", "/tips", 101L, "{\"tips\":\"START_SPOT\"}").statusCode()).isEqualTo(400);
        assertThat(call("GET", "/status?channelId=", 101L, null).statusCode()).isEqualTo(400);

        var view = new JumpmapTracker.RunView("rest-run", 0, 0, false, .65, false, List.of(), List.of());
        service.sink((user, type, payload) -> { });
        service.accept(new JumpmapTracker.Started("101", "channel-1", "rest-run", 0), List.of("101"));
        service.accept(new JumpmapTracker.Progress("101", "channel-1", "rest-run",
                new JumpRun.Ended(JumpRun.EndReason.DISCONNECT, 41_000, null), view), List.of("101"));
        service.drain(java.time.Duration.ofSeconds(10));

        var after = mapper.readTree(call("GET", "/status?channelId=channel-1", 101L, null).body());
        assertThat(after.path("revision").asLong()).isGreaterThan(first.path("revision").asLong());
        assertThat(after.path("isFirstRun").asBoolean()).isFalse();
        assertThat(after.path("seenTips")).extracting(com.fasterxml.jackson.databind.JsonNode::asText).containsExactly("START_SPOT");
        assertThat(after.at("/lastRun/runId").asText()).isEqualTo("rest-run");
        assertThat(after.at("/lastRun/reason").asText()).isEqualTo("DISCONNECT");
        assertThat(after.at("/lastRun/elapsedMs").asLong()).isEqualTo(41_000);
        assertThat(after.at("/lastRun/finishMs").isMissingNode()).isTrue();
        // 다른 채널 요청에는 그 판의 결과를 싣지 않는다.
        var other = mapper.readTree(call("GET", "/status?channelId=channel-2", 101L, null).body());
        assertThat(other.path("lastRun").isNull()).isTrue();
        assertThat(mapper.readTree(call("GET", "/status?channelId=channel-1", 202L, null).body()).path("lastRun").isNull()).isTrue();
    }

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_JUMPMAP_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_jumpmap_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_jumpmap_test_ 전용 검증 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_JUMPMAP_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_JUMPMAP_DB_PASSWORD"));
    }

    @BeforeEach
    void setup() {
        jdbc.execute("DROP TRIGGER IF EXISTS jumpmap_test_fail_ledger");
        for (String table : List.of("jump_macro_detections", "jump_gate_rewards", "jump_daily_earnings", "jump_profiles", "jump_runs",
                "wallet_transactions", "wallets", "refresh_tokens", "users")) {
            jdbc.update("DELETE FROM " + table);
        }
        for (long user : new long[] {101, 202}) {
            jdbc.update("INSERT INTO users(id, login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)"
                    + " VALUES (?, 'NAVER', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))", user, "jump-" + user, "jump" + user);
            jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, 100, 10)", user);
        }
    }

    private static Instant kst(String local) {
        return ZonedDateTime.parse(local + "+09:00[Asia/Seoul]").toInstant();
    }

    private static final Instant NOON = kst("2026-10-30T12:00:00");
    private static final int[] REWARDS = {5, 10, 20, 30, 40, 60, 85};

    private String startRun(long user, Instant at) {
        String id = "run-" + user + "-" + (++runs);
        store.start(id, user, "channel-1", at);
        return id;
    }

    private void earned(long user, LocalDate date, int coins) {
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id, transaction_type, balance_delta, reserved_delta, idempotency_key, created_at)
                SELECT id, 'MINIGAME_REWARD', ?, 0, ?, ? FROM wallets WHERE user_id = ?
                """, coins, "seed-" + user + "-" + date, java.sql.Timestamp.from(date.atStartOfDay(JumpmapStore.KST).toInstant()), user);
    }

    private int pass(String run, long user, int gate, Instant at) {
        assertThat(store.passGate(run, user, gate, REWARDS[gate - 1], gate * 10_000L, at)).isTrue();
        return store.settle(run, gate, at).orElseThrow().coinsGranted();
    }

    private List<Integer> passAll(String run, long user, int from, int to, Instant at) {
        var granted = new ArrayList<Integer>();
        for (int gate = from; gate <= to; gate++) granted.add(pass(run, user, gate, at));
        return granted;
    }

    private long balance(long user) {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, user);
    }

    private long ledger(long user) {
        return jdbc.queryForObject("""
                SELECT COALESCE(SUM(t.balance_delta), 0) FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id
                WHERE w.user_id = ? AND t.transaction_type = 'JUMP_GATE_REWARD'
                """, Long.class, user);
    }

    private int today(long user, LocalDate date) {
        return store.status(user, date.atStartOfDay(JumpmapStore.KST).toInstant()).todayEarned();
    }

    @Test
    void V131이_적용되고_생성맵에서_점프맵이_활성이다() {
        assertThat(flyway.info().applied()).extracting(info -> info.getVersion().getVersion())
                .contains("130", "131", "141");
        assertThat(flyway.info().pending()).isEmpty();
        assertThat(activation.state()).isEqualTo(JumpmapActivation.State.ACTIVE);
        assertThat(service.active()).isTrue();
    }

    @Test
    void JVM이_한국시간이어도_늦은저녁_지급을_같은_KST날짜의_예산에_포함한다() {
        Instant at = kst("2026-11-03T23:59:59.999");
        String run = startRun(101, at);

        assertThat(pass(run, 101, 1, at)).isEqualTo(5);

        assertThat(today(101, LocalDate.of(2026, 11, 3))).isEqualTo(5);
        assertThat(today(101, LocalDate.of(2026, 11, 4))).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT created_at FROM wallet_transactions
                WHERE transaction_type = 'JUMP_GATE_REWARD' ORDER BY id DESC LIMIT 1
                """, java.time.LocalDateTime.class))
                .isEqualTo(java.time.LocalDateTime.of(2026, 11, 3, 14, 59, 59, 999_000_000));
    }

    @Test
    void 엽전과_상한_표대로_지급하고_지갑과_원장이_일치한다() {
        LocalDate date = LocalDate.of(2026, 10, 30);
        // 오늘 0 → 한 판 완주 250냥
        String firstRun = startRun(101, NOON);
        assertThat(passAll(firstRun, 101, 1, 7, NOON)).containsExactly(5, 10, 20, 30, 40, 60, 85);
        assertThat(today(101, date)).isEqualTo(250);
        assertThatThrownBy(() -> jdbc.update("UPDATE jump_runs SET coins_granted = 251 WHERE id = ?", firstRun))
                .isInstanceOf(org.springframework.dao.DataAccessException.class)
                .hasMessageContaining("ck_jump_runs_coins")
                .hasRootCauseInstanceOf(java.sql.SQLException.class);
        // 네 판까지 합계 1000냥, 그 뒤에는 지급하지 않는다.
        for (int i = 0; i < 3; i++) {
            assertThat(passAll(startRun(101, NOON), 101, 1, 7, NOON)).containsExactly(5, 10, 20, 30, 40, 60, 85);
        }
        assertThat(passAll(startRun(101, NOON), 101, 1, 7, NOON)).containsOnly(0);
        assertThat(balance(101)).isEqualTo(1100);
        assertThat(ledger(101)).isEqualTo(1000);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Integer.class)).isEqualTo(28);

        // 붕어빵 등 다른 미니게임 995냥 → 문1 5냥 → 문2 0냥 → 문3 0냥
        earned(202, date, 995);
        String run = startRun(202, NOON);
        assertThat(passAll(run, 202, 1, 3, NOON)).containsExactly(5, 0, 0);
        assertThat(today(202, date)).isEqualTo(1000);
        assertThat(jdbc.queryForObject("SELECT coins_granted FROM jump_runs WHERE id = ?", Integer.class, run)).isEqualTo(5);
        assertThat(balance(202) - 100).isEqualTo(ledger(202)).isEqualTo(5);
    }

    @Test
    void 잔여_177냥이면_6구간_165냥_뒤_완주는_12냥에서_멈춘다() {
        LocalDate date = LocalDate.of(2026, 10, 30);
        earned(101, date, 823);
        String run = startRun(101, NOON);
        assertThat(passAll(run, 101, 1, 6, NOON).stream().mapToInt(Integer::intValue).sum()).isEqualTo(165);
        assertThat(today(101, date)).isEqualTo(988);
        assertThat(pass(run, 101, 7, NOON)).isEqualTo(12);
        assertThat(today(101, date)).isEqualTo(1000);
        var ended = store.end(run, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON, 251_800, 251_800L, 7, true,
                46.5, List.of(24, 10, 14, 13, 18, 19, 15), false, List.of()));
        assertThat(ended.runCoins()).isEqualTo(177);
        assertThat(ended.todayEarned()).isEqualTo(1000);
        assertThat(ended.bestFinishMs()).isEqualTo(251_800);
        assertThat(ended.newBest()).isTrue();
    }

    @Test
    void 같은_문을_동시에_정산해도_한번만_지급하고_같은_결과를_돌려준다() throws Exception {
        String run = startRun(101, NOON);
        assertThat(store.passGate(run, 101, 1, 2, 9_600, NOON)).isTrue();
        assertThat(store.passGate(run, 101, 1, 2, 9_600, NOON)).isTrue();
        var results = new CopyOnWriteArrayList<Integer>();
        var errors = new CopyOnWriteArrayList<Throwable>();
        var ready = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(8);
        for (int i = 0; i < 8; i++) {
            pool.execute(() -> {
                try {
                    ready.await();
                    results.add(store.settle(run, 1, NOON).orElseThrow().coinsGranted());
                } catch (Throwable error) {
                    errors.add(error);
                }
            });
        }
        ready.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        assertThat(errors).isEmpty();
        assertThat(results).hasSize(8).containsOnly(2);
        assertThat(balance(101)).isEqualTo(102);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM jump_gate_rewards", Integer.class)).isEqualTo(1);
    }

    @Test
    void 두_판의_문을_동시에_정산해도_하루_상한을_넘지_않는다() throws Exception {
        earned(101, LocalDate.of(2026, 10, 30), 900);
        String first = startRun(101, NOON), second = startRun(101, NOON);
        for (var run : List.of(first, second)) {
            for (int gate = 1; gate <= 7; gate++) assertThat(store.passGate(run, 101, gate, REWARDS[gate - 1], gate, NOON)).isTrue();
        }
        var pool = Executors.newFixedThreadPool(14);
        var ready = new CountDownLatch(1);
        var errors = new CopyOnWriteArrayList<Throwable>();
        for (var run : List.of(first, second)) {
            for (int gate = 1; gate <= 7; gate++) {
                int g = gate;
                pool.execute(() -> {
                    try {
                        ready.await();
                        store.settle(run, g, NOON);
                    } catch (Throwable error) {
                        errors.add(error);
                    }
                });
            }
        }
        ready.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(60, TimeUnit.SECONDS)).isTrue();
        assertThat(errors).isEmpty();
        assertThat(today(101, LocalDate.of(2026, 10, 30))).isEqualTo(1000);
        assertThat(balance(101)).isEqualTo(200);
        assertThat(ledger(101)).isEqualTo(100);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM jump_gate_rewards WHERE status = 'GRANTED'", Integer.class)).isEqualTo(14);
    }

    @Test
    void 실제_지급한_한국시각_날짜로_공통_수입을_센다() {
        String run = startRun(101, kst("2026-10-30T23:59:30"));
        assertThat(store.passGate(run, 101, 1, 2, 9_600, kst("2026-10-30T23:59:59"))).isTrue();
        assertThat(store.passGate(run, 101, 2, 4, 30_000, kst("2026-10-31T00:00:10"))).isTrue();
        // 공통 원장은 실제 지급일 기준이므로 지연 지급도 자정 뒤 예산을 사용한다.
        store.settle(run, 1, kst("2026-10-31T00:00:20"));
        var second = store.settle(run, 2, kst("2026-10-31T00:00:20")).orElseThrow();
        assertThat(today(101, LocalDate.of(2026, 10, 30))).isZero();
        assertThat(today(101, LocalDate.of(2026, 10, 31))).isEqualTo(6);
        assertThat(second.todayEarned()).isEqualTo(6);
        assertThat(second.today()).isEqualTo(LocalDate.of(2026, 10, 31));
    }

    @Test
    void 순서가_어긋나거나_끝난_판의_문은_기록하지_않는다() {
        String run = startRun(101, NOON);
        assertThat(store.passGate(run, 101, 2, 4, 1, NOON)).isFalse();
        assertThat(store.passGate(run, 202, 1, 2, 1, NOON)).isFalse();
        store.end(run, new JumpmapStore.RunEnd(JumpRun.EndReason.FALL, NOON, 5_000, null, 0, false, 3, List.of(1), false, List.of()));
        assertThat(store.passGate(run, 101, 1, 2, 1, NOON)).isFalse();
        assertThat(store.settle(run, 1, NOON)).isEmpty();
        // 이미 끝난 판의 늦은 종료 신호는 바꾸지 않는다.
        store.end(run, new JumpmapStore.RunEnd(JumpRun.EndReason.DISCONNECT, NOON.plusSeconds(9), 9_000, null, 0, false, 3,
                List.of(1), false, List.of()));
        assertThat(jdbc.queryForObject("SELECT end_reason FROM jump_runs WHERE id = ?", String.class, run)).isEqualTo("FALL");
        assertThat(balance(101)).isEqualTo(100);
    }

    @Test
    void 원장_실패는_전체를_되돌리고_PENDING으로_남아_다시_정산된다() {
        String run = startRun(101, NOON);
        assertThat(store.passGate(run, 101, 1, 2, 9_600, NOON)).isTrue();
        jdbc.execute("CREATE TRIGGER jumpmap_test_fail_ledger BEFORE INSERT ON wallet_transactions"
                + " FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test ledger failure'");
        try {
            assertThatThrownBy(() -> store.settle(run, 1, NOON)).isInstanceOf(RuntimeException.class);
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS jumpmap_test_fail_ledger");
        }
        assertThat(balance(101)).isEqualTo(100);
        assertThat(today(101, LocalDate.of(2026, 10, 30))).isZero();
        assertThat(store.pendingRewards(NOON.plusSeconds(1), 10)).containsExactly(new JumpmapStore.RewardKey(run, 1));
        assertThat(store.settle(run, 1, NOON.plusSeconds(30)).orElseThrow().coinsGranted()).isEqualTo(2);
        assertThat(store.settle(run, 1, NOON.plusSeconds(31)).orElseThrow().coinsGranted()).isEqualTo(2);
        assertThat(balance(101)).isEqualTo(102);
        assertThat(store.pendingRewards(NOON.plusSeconds(60), 10)).isEmpty();
    }

    @Test
    void 개인_최고기록은_의심판과_동점을_제외하고_갱신한다() {
        record Finish(long ms, boolean suspicious, boolean newBest, Long best) {}
        var cases = List.of(new Finish(300_000, false, true, 300_000L), new Finish(320_000, false, false, 300_000L),
                new Finish(280_000, false, true, 280_000L), new Finish(280_000, false, false, 280_000L),
                new Finish(250_000, true, false, 280_000L));
        for (var finish : cases) {
            String run = startRun(101, NOON);
            var ended = store.end(run, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON, finish.ms(), finish.ms(), 7,
                    true, 46, List.of(), finish.suspicious(), finish.suspicious() ? List.of("TOO_FAST:7") : List.of()));
            assertThat(ended.newBest()).as("%s", finish).isEqualTo(finish.newBest());
            assertThat(ended.bestFinishMs()).as("%s", finish).isEqualTo(finish.best());
        }
        assertThat(store.status(101, NOON).bestFinishMs()).isEqualTo(280_000);
    }

    @Test
    void 첫도전과_말풍선과_재시작_정리() {
        assertThat(store.status(101, NOON).firstRun()).isTrue();
        String run = startRun(101, NOON);
        assertThat(jdbc.queryForObject("SELECT is_first_run FROM jump_runs WHERE id = ?", Boolean.class, run)).isTrue();
        assertThat(store.status(101, NOON).firstRun()).isFalse();
        assertThat(store.start("run-x", 101, "channel-1", NOON).firstRun()).isFalse();

        store.seeTips(101, Set.of("START_SPOT", "UNKNOWN"), NOON);
        store.seeTips(101, Set.of("FIRST_GATE", "START_SPOT"), NOON);
        assertThat(store.status(101, NOON).seenTips()).containsExactly("START_SPOT", "FIRST_GATE");

        assertThat(store.abandonOpenRuns(NOON.plusSeconds(90))).isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT end_reason FROM jump_runs", String.class)).containsOnly("DISCONNECT");
        assertThat(jdbc.queryForObject("SELECT elapsed_ms FROM jump_runs WHERE id = ?", Long.class, run)).isEqualTo(90_000);
    }

    @Test
    void 서비스가_판정신호를_저장하고_개인이벤트를_순서대로_보낸다() throws Exception {
        var sent = new CopyOnWriteArrayList<Map<String, Object>>();
        var types = new CopyOnWriteArrayList<String>();
        service.sink((user, type, payload) -> {
            if (user.equals("101")) {
                types.add(type);
                sent.add(Map.copyOf(new java.util.HashMap<>(payload) {{ values().removeIf(java.util.Objects::isNull); }}));
            }
        });
        var view = new JumpmapTracker.RunView("svc-run", 0, 0, false, .65, false, List.of(), List.of());
        service.accept(new JumpmapTracker.Started("101", "channel-1", "svc-run", 0), List.of("101"));
        service.accept(new JumpmapTracker.Step("101", "channel-1", 0), List.of("101", "202"));
        service.accept(new JumpmapTracker.Progress("101", "channel-1", "svc-run", new JumpRun.GatePassed(1, 9_600, 2), view), List.of("101"));
        service.accept(new JumpmapTracker.Progress("101", "channel-1", "svc-run",
                new JumpRun.Ended(JumpRun.EndReason.FALL, 12_000, null),
                new JumpmapTracker.RunView("svc-run", 12_000, 1, false, 27.456, false, List.of(), List.of(24, 1, 0, 0, 0, 0, 0))),
                List.of("101"));
        service.drain(java.time.Duration.ofSeconds(10));

        assertThat(types).containsExactly("JUMPMAP_STEP", "JUMPMAP_STARTED", "JUMPMAP_GATE", "JUMPMAP_ENDED");
        var revisions = sent.stream().filter(p -> p.containsKey("revision")).map(p -> ((Number) p.get("revision")).longValue()).toList();
        assertThat(revisions).isSorted().doesNotHaveDuplicates().hasSize(3);
        assertThat(sent.get(2)).containsEntry("gate", 1).containsEntry("coinsGranted", 2).containsEntry("pending", false)
                .containsEntry("runCoins", 2).containsEntry("dailyCap", 1000);
        assertThat(sent.get(3)).containsEntry("reason", "FALL").containsEntry("runCoins", 2).containsEntry("maxHeight", 27.46)
                .containsEntry("gatesPassed", 1).containsEntry("mapVersion", service.mapVersion());
        assertThat(jdbc.queryForObject("SELECT end_reason FROM jump_runs WHERE id = 'svc-run'", String.class)).isEqualTo("FALL");
        assertThat(balance(101)).isEqualTo(102);

        var status = service.status("101", java.util.Optional::empty);
        assertThat(status.enabled()).isTrue();
        assertThat(status.lastRun()).isNotNull().extracting(JumpmapService.LastRun::runId).isEqualTo("svc-run");
        // 상태 조회는 새 이벤트를 만들지 않고 조회 시작 시점 revision을 유지한다.
        assertThat(status.revision()).isEqualTo(revisions.getLast());
        assertThat(status.todayEarned()).isEqualTo(2);
    }

    @Test
    void 반복_패턴_기록은_판과_규칙마다_한번만_남고_회원별_적발_판_수로_조회한다() {
        try {
            String first = startRun(101, NOON), second = startRun(101, NOON.plusSeconds(10)), other = startRun(202, NOON);
            Map<String, Object> evidence = Map.of("matched", 3, "deviationMs", 18);
            store.recordDetection(new JumpmapStore.MacroDetection(first, 101, "REPLAY", 3, evidence, NOON.plusSeconds(60)));
            // 같은 (판, 규칙)을 다시 남겨도 늘지 않는다.
            store.recordDetection(new JumpmapStore.MacroDetection(first, 101, "REPLAY", 4, evidence, NOON.plusSeconds(61)));
            store.recordDetection(new JumpmapStore.MacroDetection(first, 101, "FIXED_START", 3, evidence, NOON.plusSeconds(60)));
            store.recordDetection(new JumpmapStore.MacroDetection(second, 101, "REPLAY", 5, evidence, NOON.plusSeconds(120)));
            store.recordDetection(new JumpmapStore.MacroDetection(other, 202, "FIXED_START", 3, evidence, NOON.plusSeconds(90)));

            var suspects = store.macroSuspects(10);

            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM jump_macro_detections", Integer.class)).isEqualTo(4);
            assertThat(suspects).extracting(JumpmapStore.MacroSuspect::userId).containsExactly("101", "202");
            assertThat(suspects.getFirst()).isEqualTo(new JumpmapStore.MacroSuspect("101", "jump101", false, 2, 2, 1, 2,
                    null, NOON.plusSeconds(60).toString(), NOON.plusSeconds(120).toString()));
            assertThat(suspects.getLast().flaggedRuns()).isEqualTo(1);
            assertThat(suspects.getLast().fixedStartRuns()).isEqualTo(1);
            assertThat(store.macroSuspects(1)).extracting(JumpmapStore.MacroSuspect::userId).containsExactly("101");
            // 운영자 기록은 판의 의심 표시와 랭킹 자격을 바꾸지 않는다.
            assertThat(jdbc.queryForObject("SELECT suspicious FROM jump_runs WHERE id=?", Boolean.class, first)).isFalse();
        } finally {
            // 다른 MySQL 테스트가 jump_runs·users를 지울 때 외래 키에 걸리지 않게 비운다.
            jdbc.update("DELETE FROM jump_macro_detections");
        }
    }
}
