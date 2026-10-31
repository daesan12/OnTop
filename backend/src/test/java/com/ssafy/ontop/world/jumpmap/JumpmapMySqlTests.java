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
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=공원",
        "ontop.world.channels[0].capacity=20",
        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
        "ontop.world.map.json-path=../frontend/generated/park/server-map.json",
        "ontop.world.map.manifest-path=../frontend/generated/park/manifest.json"
})
class JumpmapMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired JumpmapStore store;
    @Autowired JumpmapService service;
    @Autowired JumpmapActivation activation;
    @Autowired Flyway flyway;
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
        assertThat(first.path("rulesVersion").asText()).isEqualTo("v2");
        assertThat(first.path("isFirstRun").asBoolean()).isTrue();
        assertThat(first.path("dailyCap").asInt()).isEqualTo(100);
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
        for (String table : List.of("jump_gate_rewards", "jump_daily_earnings", "jump_profiles", "jump_runs",
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
    private static final int[] REWARDS = {2, 4, 7, 11, 16, 24, 36};

    private String startRun(long user, Instant at) {
        String id = "run-" + user + "-" + (++runs);
        store.start(id, user, "channel-1", at);
        return id;
    }

    private void earned(long user, LocalDate date, int coins) {
        jdbc.update("INSERT INTO jump_daily_earnings(user_id, kst_date, coins_earned) VALUES (?, ?, ?)", user, Date.valueOf(date), coins);
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
        return jdbc.query("SELECT coins_earned FROM jump_daily_earnings WHERE user_id = ? AND kst_date = ?",
                rs -> rs.next() ? rs.getInt(1) : 0, user, Date.valueOf(date));
    }

    @Test
    void V131이_적용되고_생성맵에서_점프맵이_활성이다() {
        assertThat(flyway.info().applied()).extracting(info -> info.getVersion().getVersion()).contains("130", "131");
        assertThat(flyway.info().pending()).isEmpty();
        assertThat(activation.state()).isEqualTo(JumpmapActivation.State.ACTIVE);
        assertThat(service.active()).isTrue();
    }

    @Test
    void 엽전과_상한_표대로_지급하고_지갑과_원장이_일치한다() {
        LocalDate date = LocalDate.of(2026, 10, 30);
        // 오늘 0 → 한 판 완주 100냥
        assertThat(passAll(startRun(101, NOON), 101, 1, 7, NOON)).containsExactly(2, 4, 7, 11, 16, 24, 36);
        assertThat(today(101, date)).isEqualTo(100);
        // 같은 날 두 번째 완주는 0냥
        assertThat(passAll(startRun(101, NOON), 101, 1, 7, NOON)).containsOnly(0);
        assertThat(balance(101)).isEqualTo(200);
        assertThat(ledger(101)).isEqualTo(100);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Integer.class)).isEqualTo(7);

        // 95 → 문1 2냥(97) → 문2 3냥(100) → 문3 0냥
        earned(202, date, 95);
        String run = startRun(202, NOON);
        assertThat(passAll(run, 202, 1, 3, NOON)).containsExactly(2, 3, 0);
        assertThat(today(202, date)).isEqualTo(100);
        assertThat(jdbc.queryForObject("SELECT coins_granted FROM jump_runs WHERE id = ?", Integer.class, run)).isEqualTo(5);
        assertThat(balance(202) - 100).isEqualTo(ledger(202)).isEqualTo(5);
    }

    @Test
    void 이틀째판_6구간까지_64냥_뒤_완주는_12냥에서_멈춘다() {
        LocalDate date = LocalDate.of(2026, 10, 30);
        earned(101, date, 24);
        String run = startRun(101, NOON);
        assertThat(passAll(run, 101, 1, 6, NOON).stream().mapToInt(Integer::intValue).sum()).isEqualTo(64);
        assertThat(today(101, date)).isEqualTo(88);
        assertThat(pass(run, 101, 7, NOON)).isEqualTo(12);
        assertThat(today(101, date)).isEqualTo(100);
        var ended = store.end(run, new JumpmapStore.RunEnd(JumpRun.EndReason.FINISH, NOON, 251_800, 251_800L, 7, true,
                46.5, List.of(24, 10, 14, 13, 18, 19, 15), false, List.of()));
        assertThat(ended.runCoins()).isEqualTo(76);
        assertThat(ended.todayEarned()).isEqualTo(100);
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
        assertThat(today(101, LocalDate.of(2026, 10, 30))).isEqualTo(100);
        assertThat(balance(101)).isEqualTo(200);
        assertThat(ledger(101)).isEqualTo(100);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM jump_gate_rewards WHERE status = 'GRANTED'", Integer.class)).isEqualTo(14);
    }

    @Test
    void 문을_밟은_한국시각_날짜로_수입을_센다() {
        String run = startRun(101, kst("2026-10-30T23:59:30"));
        assertThat(store.passGate(run, 101, 1, 2, 9_600, kst("2026-10-30T23:59:59"))).isTrue();
        assertThat(store.passGate(run, 101, 2, 4, 30_000, kst("2026-10-31T00:00:10"))).isTrue();
        // 정산이 자정 뒤에 돼도 문을 밟은 날짜 수입이다.
        store.settle(run, 1, kst("2026-10-31T00:00:20"));
        var second = store.settle(run, 2, kst("2026-10-31T00:00:20")).orElseThrow();
        assertThat(today(101, LocalDate.of(2026, 10, 30))).isEqualTo(2);
        assertThat(today(101, LocalDate.of(2026, 10, 31))).isEqualTo(4);
        assertThat(second.todayEarned()).isEqualTo(4);
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
                .containsEntry("runCoins", 2).containsEntry("dailyCap", 100);
        assertThat(sent.get(3)).containsEntry("reason", "FALL").containsEntry("runCoins", 2).containsEntry("maxHeight", 27.46)
                .containsEntry("gatesPassed", 1).containsEntry("mapVersion", service.mapVersion());
        assertThat(jdbc.queryForObject("SELECT end_reason FROM jump_runs WHERE id = 'svc-run'", String.class)).isEqualTo("FALL");
        assertThat(balance(101)).isEqualTo(102);

        var status = service.status("101", java.util.Optional.empty());
        assertThat(status.enabled()).isTrue();
        assertThat(status.lastRun()).isNotNull().extracting(JumpmapService.LastRun::runId).isEqualTo("svc-run");
        assertThat(status.revision()).isGreaterThan(revisions.getLast());
        assertThat(status.todayEarned()).isEqualTo(2);
    }
}
