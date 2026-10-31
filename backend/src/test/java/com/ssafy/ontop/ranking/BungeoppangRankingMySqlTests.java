package com.ssafy.ontop.ranking;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.ranking.repository.BungeoppangRankingRepository;
import com.ssafy.ontop.ranking.service.BungeoppangRankingService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "server.address=127.0.0.1", "ontop.minigames.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop,classpath:db/minigame",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(BungeoppangRankingMySqlTests.ControlledTime.class)
class BungeoppangRankingMySqlTests {
    @LocalServerPort private int port;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserRepository users;
    @Autowired private WalletRepository wallets;
    @Autowired private AuthExchangePersistenceService issuer;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ControlledTime time;
    private final List<Member> fixtures = new ArrayList<>();
    private record Member(long id, String token) { }

    @DynamicPropertySource static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_BUNGEO_RANKING_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_bungeo_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("붕어빵 랭킹은 전용 loopback 검증 DB에서만 확인합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_GAME_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_GAME_DB_PASSWORD"));
    }

    @Test void 실제완료직후조회_최고기록_동점_버전분리_스냅샷_만료를_확인한다() throws Exception {
        try {
            Member zero = member();
            assertThat(ranking(zero, "v5", 20, null).path("items")).isEmpty();
            JsonNode started = start(zero, "v4");
            String session = started.path("minigameSessionId").asText();
            time.clock.time = Instant.parse(started.at("/timing/playEndsAt").asText()).plusMillis(1);
            var completeBody = Map.of("rulesVersion", "v4", "throughSeq", 0,
                    "prefixHash", started.at("/checkpoint/prefixHash").asText(), "log", List.of(), "seenTips", List.of());
            String completeKey = UUID.randomUUID().toString();
            var completed = send(zero, "POST", "/api/v1/minigames/sessions/" + session + "/complete", completeBody, completeKey);
            assertThat(completed.statusCode()).as(completed.body()).isEqualTo(200);
            JsonNode complete = mapper.readTree(completed.body());
            assertThat(complete.path("status").asText()).isEqualTo("COMPLETED");
            assertThat(complete.path("rewardAmount").asLong()).isZero();
            JsonNode immediate = ranking(zero, "v4", 20, null);
            assertThat(immediate.path("me").path("made").asLong()).isZero();
            assertThat(immediate.path("totalParticipants").asLong()).isEqualTo(1);
            assertThat(send(zero, "POST", "/api/v1/minigames/sessions/" + session + "/complete", completeBody, completeKey).body())
                    .isEqualTo(completed.body());
            assertThat(ranking(zero, "v4", 20, null).path("me")).isEqualTo(immediate.path("me"));

            JsonNode v5Started = start(zero, "v5");
            String v5Session = v5Started.path("minigameSessionId").asText();
            String sessionPath = "/api/v1/minigames/sessions/" + v5Session;
            var v5Body = Map.of("rulesVersion", "v5", "throughSeq", 0,
                    "prefixHash", v5Started.at("/checkpoint/prefixHash").asText(), "log", List.of(), "seenTips", List.of());
            var foreignPause = send(member(), "POST", sessionPath + "/manual-pause",
                    Map.of("paused", true, "expectedPauseRevision", 0), null);
            assertThat(foreignPause.statusCode()).as(foreignPause.body()).isEqualTo(404);
            var malformedPause = send(zero, "POST", sessionPath + "/manual-pause",
                    Map.of("paused", "true", "expectedPauseRevision", 0), null);
            assertThat(malformedPause.statusCode()).as(malformedPause.body()).isEqualTo(400);
            time.clock.time = Instant.parse(v5Started.at("/timing/playStartsAt").asText()).plusSeconds(10);
            var paused = send(zero, "POST", sessionPath + "/manual-pause",
                    Map.of("paused", true, "expectedPauseRevision", 0), null);
            assertThat(paused.statusCode()).as(paused.body()).isEqualTo(200);
            var duplicatePause = send(zero, "POST", sessionPath + "/manual-pause",
                    Map.of("paused", true, "expectedPauseRevision", 0), null);
            assertThat(duplicatePause.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(duplicatePause.body()).at("/timing/pauseRevision").asLong()).isEqualTo(1);
            var pausedComplete = send(zero, "POST", sessionPath + "/complete", v5Body, UUID.randomUUID().toString());
            assertThat(pausedComplete.statusCode()).as(pausedComplete.body()).isEqualTo(409);
            assertThat(mapper.readTree(pausedComplete.body()).path("code").asText()).isEqualTo("MINIGAME_PAUSED");
            var staleResume = send(zero, "POST", sessionPath + "/manual-pause",
                    Map.of("paused", false, "expectedPauseRevision", 0), null);
            assertThat(staleResume.statusCode()).as(staleResume.body()).isEqualTo(409);
            assertThat(mapper.readTree(staleResume.body()).path("code").asText()).isEqualTo("MANUAL_PAUSE_CHANGED");
            time.clock.time = time.clock.instant().plusSeconds(300);
            var stillPaused = send(zero, "GET", sessionPath, null, null);
            JsonNode pausedState = mapper.readTree(stillPaused.body());
            assertThat(pausedState.path("status").asText()).isEqualTo("PLAYING");
            assertThat(pausedState.at("/timing/paused").asBoolean()).isTrue();
            assertThat(pausedState.at("/timing/pauseRevision").asLong()).isEqualTo(1);
            var resumed = send(zero, "POST", sessionPath + "/manual-pause",
                    Map.of("paused", false, "expectedPauseRevision", 1), null);
            assertThat(resumed.statusCode()).as(resumed.body()).isEqualTo(200);
            time.clock.time = Instant.parse(mapper.readTree(resumed.body()).at("/timing/playEndsAt").asText())
                    .plusMillis(1);
            String v5Key = UUID.randomUUID().toString();
            var v5Completed = send(zero, "POST", "/api/v1/minigames/sessions/" + v5Session + "/complete", v5Body, v5Key);
            assertThat(v5Completed.statusCode()).as(v5Completed.body()).isEqualTo(200);
            JsonNode v5Immediate = ranking(zero, "v5", 20, null);
            assertThat(v5Immediate.at("/me/made").asInt()).isZero();
            assertThat(v5Immediate.path("totalParticipants").asInt()).isEqualTo(1);
            assertThat(send(zero, "POST", "/api/v1/minigames/sessions/" + v5Session + "/complete", v5Body, v5Key).body())
                    .isEqualTo(v5Completed.body());
            jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", zero.id);

            Member a = member(), b = member(), c = member(), d = member(), invalid = member();
            Instant base = time.clock.instant();
            seed(a, "v5", 12, 1, base.plusSeconds(10), "COMPLETED", true);
            seed(a, "v5", 12, 1, base.plusSeconds(40), "COMPLETED", true);
            seed(b, "v5", 12, 1, base.plusSeconds(20), "COMPLETED", true);
            seed(c, "v5", 12, 2, base.plusSeconds(30), "COMPLETED", true);
            seed(d, "v5", 10, 0, base.plusSeconds(40), "COMPLETED", true);
            seed(a, "v4", 99, 0, base.plusSeconds(50), "COMPLETED", true);
            seed(invalid, "v5", 999, 0, base.plusSeconds(5), "ABANDONED", false);
            seed(invalid, "v5", 999, 0, base.plusSeconds(5), "INVALID", false);
            long missingSettlement = seed(invalid, "v5", 999, 0, base.plusSeconds(5), "COMPLETED", false);
            assertThat(jdbc.queryForObject("SELECT settled_at FROM bungeoppang_v4_rounds WHERE minigame_session_id=?",
                    Timestamp.class, missingSettlement)).isNull();
            time.clock.time = base.plusSeconds(60);
            JsonNode first = ranking(c, "v5", 1, null);
            assertThat(first.path("totalParticipants").asLong()).isEqualTo(4);
            assertThat(first.at("/items/0/userId").asText()).isEqualTo(Long.toString(a.id));
            assertThat(first.at("/items/0/completedAt").asText()).isEqualTo(base.plusSeconds(10).toString());
            assertThat(first.at("/me/rank").asInt()).isEqualTo(3);

            seed(b, "v5", 15, 0, time.clock.instant().plusSeconds(1), "COMPLETED", true);
            JsonNode second = ranking(c, "v5", 1, first.path("nextCursor").asText());
            JsonNode third = ranking(c, "v5", 1, second.path("nextCursor").asText());
            JsonNode fourth = ranking(c, "v5", 1, third.path("nextCursor").asText());
            assertThat(second.path("snapshotId")).isEqualTo(first.path("snapshotId"));
            assertThat(second.at("/items/0/userId").asText()).isEqualTo(Long.toString(b.id));
            assertThat(second.at("/items/0/rank").asInt()).isEqualTo(1);
            assertThat(third.at("/items/0/rank").asInt()).isEqualTo(3);
            assertThat(fourth.path("nextCursor").isNull()).isTrue();
            JsonNode fresh = ranking(c, "v5", 20, null);
            assertThat(fresh.at("/items/0/userId").asText()).isEqualTo(Long.toString(b.id));
            assertThat(fresh.at("/items/1/rank").asInt()).isEqualTo(2);
            assertThat(ranking(a, "v4", 20, null).at("/me/made").asInt()).isEqualTo(99);
            time.clock.time = time.clock.time.plusSeconds(121);
            var expired = send(c, "GET", path("v5", 1, first.path("nextCursor").asText()), null, null);
            assertThat(expired.statusCode()).isEqualTo(409);
            assertThat(mapper.readTree(expired.body()).path("code").asText()).isEqualTo("RANKING_SNAPSHOT_EXPIRED");
            Files.createDirectories(Path.of("build/reports"));
            Files.writeString(Path.of("build/reports/bungeoppang-ranking-wire.json"), mapper.writerWithDefaultPrettyPrinter()
                    .writeValueAsString(Map.ofEntries(Map.entry("ownUserId", Long.toString(c.id)), Map.entry("first", first),
                            Map.entry("second", second), Map.entry("third", third), Map.entry("fourth", fourth),
                            Map.entry("fresh", fresh), Map.entry("zeroComplete", complete), Map.entry("zeroRanking", immediate),
                            Map.entry("zeroUserId", Long.toString(zero.id)), Map.entry("zeroCompleteV5", mapper.readTree(v5Completed.body())),
                            Map.entry("zeroRankingV5", v5Immediate),
                            Map.entry("runId", System.getenv().getOrDefault("ONTOP_GAME_ADDITIONS_RUN_ID", "standalone")))));
        } finally {
            // 이 실행에서 생성한 전용 테스트 회원만 비활성화한다. 공용/기존 회원과 데이터는 건드리지 않는다.
            for (Member member : fixtures) { jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", member.id); }
        }
    }

    /**
     * v5 boards by the stored play window: 3-minute records stay out of the default 2-minute board and remain
     * readable with durationMs=180000; a different config version with the same window shares the board.
     */
    @Test void v5는_판에_저장된_플레이시간별로_분리하고_같은시간의_다른_configVersion은_함께_집계한다() throws Exception {
        try {
            Member a = member(), b = member(), c = member();
            Instant base = time.clock.instant();
            seed(a, "v5", 10, 1, base.plusSeconds(1), "COMPLETED", true);
            threeMinutes(seed(a, "v5", 30, 0, base.plusSeconds(2), "COMPLETED", true));
            seed(b, "v5", 8, 0, base.plusSeconds(3), "COMPLETED", true);
            long sameLength = seed(b, "v5", 12, 0, base.plusSeconds(4), "COMPLETED", true);
            jdbc.update("UPDATE bungeoppang_v4_rounds SET config_version='v5-20991231.1' WHERE minigame_session_id=?",
                    sameLength);
            threeMinutes(seed(c, "v5", 30, 0, base.plusSeconds(5), "COMPLETED", true));
            seed(a, "v4", 5, 0, base.plusSeconds(6), "COMPLETED", true);
            time.clock.time = base.plusSeconds(60);

            JsonNode two = ranking(a, "v5", null, 20, null);
            assertThat(two.path("durationMs").asInt()).isEqualTo(120000);
            assertThat(two.path("totalParticipants").asInt()).isEqualTo(2);
            assertThat(two.path("items")).extracting(item -> item.path("userId").asLong()).containsExactly(b.id, a.id);
            assertThat(two.at("/items/0/made").asInt()).isEqualTo(12);
            assertThat(two.at("/me/made").asInt()).isEqualTo(10);
            assertThat(two.at("/me/rank").asInt()).isEqualTo(2);
            assertThat(ranking(a, "v5", "120000", 20, null).path("items")).isEqualTo(two.path("items"));

            JsonNode three = ranking(a, "v5", "180000", 20, null);
            assertThat(three.path("durationMs").asInt()).isEqualTo(180000);
            assertThat(three.path("totalParticipants").asInt()).isEqualTo(2);
            assertThat(three.path("items")).extracting(item -> item.path("userId").asLong()).containsExactly(a.id, c.id);
            assertThat(three.path("items")).extracting(item -> item.path("rank").asInt()).containsExactly(1, 1);
            assertThat(three.at("/me/made").asInt()).isEqualTo(30);

            JsonNode v4 = ranking(a, "v4", null, 20, null);
            assertThat(v4.path("durationMs").isNull()).isTrue();
            assertThat(v4.at("/me/made").asInt()).isEqualTo(5);
            for (String path : List.of(path("v5", "60000", 20, null), path("v4", "120000", 20, null))) {
                var invalid = send(a, "GET", path, null, null);
                assertThat(invalid.statusCode()).as(path).isEqualTo(400);
                assertThat(mapper.readTree(invalid.body()).path("code").asText()).isEqualTo("RANKING_INVALID_DURATION");
            }
            String threeMinuteCursor = ranking(a, "v5", "180000", 1, null).path("nextCursor").asText();
            var crossed = send(a, "GET", path("v5", null, 1, threeMinuteCursor), null, null);
            assertThat(crossed.statusCode()).isEqualTo(409);
            assertThat(mapper.readTree(crossed.body()).path("code").asText()).isEqualTo("RANKING_SNAPSHOT_EXPIRED");
            assertThat(ranking(a, "v5", "180000", 1, threeMinuteCursor).at("/items/0/userId").asLong()).isEqualTo(c.id);
        } finally {
            for (Member member : fixtures) { jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", member.id); }
        }
    }

    @Test
    void 최고점수와_같은판의_최대콤보로_공동순위를_계산하고_누락기록을_제외한다() throws Exception {
        try {
            Member a = member(), b = member(), c = member(), zero = member(), missing = member();
            Instant base = time.clock.instant();
            score(a, 1000, 30, 99, 0, base.plusSeconds(1));
            score(a, 1200, 8, 2, 9, base.plusSeconds(2));
            score(a, 1200, 12, 3, 5, base.plusSeconds(4));
            score(b, 1200, 12, 1, 10, base.plusSeconds(3));
            score(c, 1200, 8, 50, 0, base.plusSeconds(5));
            score(zero, 0, 0, 0, 0, base.plusSeconds(6));
            long invalid = score(missing, 9000, 50, 99, 0, base.plusSeconds(7));
            jdbc.update("UPDATE bungeoppang_records SET result_json=JSON_REMOVE(result_json,'$.maxCombo')"
                    + " WHERE minigame_session_id=?", invalid);
            time.clock.time = base.plusSeconds(10);

            JsonNode page = ranking(a, "v5", 20, null);

            assertThat(page.path("totalParticipants").asInt()).isEqualTo(4);
            assertThat(page.path("items")).extracting(row -> row.path("userId").asLong())
                    .containsExactly(b.id, a.id, c.id, zero.id);
            assertThat(page.path("items")).extracting(row -> row.path("rank").asInt())
                    .containsExactly(1, 1, 3, 4);
            assertThat(page.at("/me/score").asInt()).isEqualTo(1200);
            assertThat(page.at("/me/maxCombo").asInt()).isEqualTo(12);
            assertThat(page.at("/me/completedAt").asText()).isEqualTo(base.plusSeconds(4).toString());
        } finally {
            for (Member member : fixtures) {
                jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", member.id);
            }
        }
    }

    @Test
    void V131_기존판을_보존하면서_V132를_순차_적용한다() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        String schema = "ontop_ranking_test_bungeo_upgrade_" + suffix;
        String current = jdbc.queryForObject("SELECT DATABASE()", String.class);
        assertThat(current).matches("ontop_ranking_test_bungeo_[A-Za-z0-9_]+");
        jdbc.execute("CREATE DATABASE " + schema);
        String url = System.getenv("TEST_BUNGEO_RANKING_DB_URL")
                .replaceFirst("/ontop_ranking_test_bungeo_[A-Za-z0-9_]+", "/" + schema);
        var configuration = Flyway.configure().dataSource(url, System.getenv("TEST_GAME_DB_USERNAME"),
                System.getenv("TEST_GAME_DB_PASSWORD"))
                .locations("classpath:db/migration", "classpath:db/minigame", "classpath:db/shop");
        configuration.target("131").load().migrate();
        Member owner = member();
        long sessionId = start(owner, "v5").path("minigameSessionId").asLong();
        for (String table : List.of("users", "minigame_sessions")) {
            long id = table.equals("users") ? owner.id : sessionId;
            jdbc.update("INSERT INTO " + schema + "." + table + " SELECT * FROM " + current + "." + table
                    + " WHERE id=?", id);
        }
        List<String> columns = jdbc.queryForList("SELECT COLUMN_NAME FROM information_schema.columns"
                + " WHERE TABLE_SCHEMA=? AND TABLE_NAME='bungeoppang_v4_rounds' ORDER BY ORDINAL_POSITION",
                String.class, schema);
        String names = String.join(",", columns);
        jdbc.update("INSERT INTO " + schema + ".bungeoppang_v4_rounds (" + names + ") SELECT " + names
                + " FROM " + current + ".bungeoppang_v4_rounds WHERE minigame_session_id=?", sessionId);

        configuration.target("132").load().migrate();

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + schema + ".bungeoppang_v4_rounds"
                + " WHERE minigame_session_id=? AND manual_paused_at IS NULL AND manual_paused_ms=0"
                + " AND manual_pause_revision=0", Long.class, sessionId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + schema + ".flyway_schema_history"
                + " WHERE version='132' AND success=1", Long.class)).isEqualTo(1);
        jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", owner.id);
    }

    private long score(Member member, long score, long combo, int made, int failed, Instant at) throws Exception {
        long sessionId = seed(member, "v5", made, failed, at, "COMPLETED", true);
        jdbc.update("UPDATE minigame_sessions SET score=? WHERE id=?", score, sessionId);
        jdbc.update("UPDATE bungeoppang_records SET result_json=JSON_SET(result_json,'$.maxCombo',?)"
                + " WHERE minigame_session_id=?", combo, sessionId);
        return sessionId;
    }

    /** The row a three-minute round got before 2026-10-29: legacy config version and a 180 s play window. */
    private void threeMinutes(long sessionId) {
        jdbc.update("UPDATE bungeoppang_v4_rounds SET config_version='v5-20261027.1',"
                + " play_ends_at=TIMESTAMPADD(MICROSECOND,180000000,play_starts_at),"
                + " submit_deadline=TIMESTAMPADD(MICROSECOND,195000000,play_starts_at),"
                + " expires_at=TIMESTAMPADD(MICROSECOND,205000000,play_starts_at) WHERE minigame_session_id=?", sessionId);
    }

    private Member member() {
        var user = users.saveAndFlush(new User(LoginProvider.NAVER, "bungeo-ranking-" + UUID.randomUUID(),
                "R" + UUID.randomUUID().toString().replace("-", "").substring(0, 7), CharacterGender.MALE));
        wallets.saveAndFlush(Wallet.forSignup(user.getId(), Instant.now()));
        var member = new Member(user.getId(), issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null)).accessToken());
        fixtures.add(member); return member;
    }
    private JsonNode start(Member member, String version) throws Exception {
        var response = send(member, "POST", "/api/v1/minigames/sessions",
                Map.of("minigameType", "BUNGEOPPANG", "rulesVersion", version), UUID.randomUUID().toString());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        return mapper.readTree(response.body());
    }
    private long seed(Member member, String version, int made, int failed, Instant at, String status, boolean settled) throws Exception {
        long id = start(member, version).path("minigameSessionId").asLong();
        jdbc.update("UPDATE minigame_sessions SET status=?, score=?, ended_at=? WHERE id=?", status, made, Timestamp.from(at), id);
        jdbc.update("UPDATE bungeoppang_records SET result_json=? WHERE minigame_session_id=?",
                mapper.writeValueAsString(Map.of("status", status, "rulesVersion", version,
                        "made", made, "failed", failed, "maxCombo", 10 - failed)), id);
        if (settled) {
            jdbc.update("""
                    UPDATE bungeoppang_v4_rounds
                    SET terminal_reason='VERIFIED', settled_at=?, reward_date=DATE(?),
                        final_request_hash=REPEAT('a',64), final_through_seq=0, final_prefix_hash=approved_prefix_hash
                    WHERE minigame_session_id=?
                    """, Timestamp.from(at), Timestamp.from(at), id);
        }
        return id;
    }
    private JsonNode ranking(Member member, String version, int limit, String cursor) throws Exception {
        return ranking(member, version, null, limit, cursor);
    }
    private JsonNode ranking(Member member, String version, String duration, int limit, String cursor) throws Exception {
        var response = send(member, "GET", path(version, duration, limit, cursor), null, null);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        return mapper.readTree(response.body());
    }
    private String path(String version, int limit, String cursor) {
        return path(version, null, limit, cursor);
    }
    private String path(String version, String duration, int limit, String cursor) {
        return "/api/v1/minigames/bungeoppang/rankings?period=ALL_TIME&rulesVersion=" + version + "&limit=" + limit
                + (duration == null ? "" : "&durationMs=" + duration)
                + (cursor == null ? "" : "&cursor=" + URLEncoder.encode(cursor, StandardCharsets.UTF_8));
    }
    private HttpResponse<String> send(Member member, String method, String path, Object body, String key) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .header("Authorization", "Bearer " + member.token);
            if (key != null) { request.header("Idempotency-Key", key); }
            if (body != null) { request.header("Content-Type", "application/json"); }
            return client.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build(), HttpResponse.BodyHandlers.ofString());
        }
    }
    @TestConfiguration(proxyBeanMethods = false)
    static class ControlledTime {
        final BungeoppangRankingServiceTests.TestClock clock = new BungeoppangRankingServiceTests.TestClock();
        ControlledTime() { clock.time = Instant.now(); }
        @Bean @Primary MinigameService rankingMinigame(MinigameRepository repository, PlatformTransactionManager manager) {
            return new MinigameService(repository, manager, clock, 100, true);
        }
        @Bean @Primary BungeoppangRankingService rankingSnapshot(ObjectProvider<BungeoppangRankingRepository> repositories) {
            return new BungeoppangRankingService(repositories, clock, Duration.ofMinutes(2));
        }
    }
}
