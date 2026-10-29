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
            time.clock.time = Instant.parse(v5Started.at("/timing/playEndsAt").asText()).plusMillis(1);
            var v5Body = Map.of("rulesVersion", "v5", "throughSeq", 0,
                    "prefixHash", v5Started.at("/checkpoint/prefixHash").asText(), "log", List.of(), "seenTips", List.of());
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
                mapper.writeValueAsString(Map.of("status", status, "rulesVersion", version, "made", made, "failed", failed)), id);
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
        var response = send(member, "GET", path(version, limit, cursor), null, null);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        return mapper.readTree(response.body());
    }
    private String path(String version, int limit, String cursor) {
        return "/api/v1/minigames/bungeoppang/rankings?period=ALL_TIME&rulesVersion=" + version + "&limit=" + limit
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
