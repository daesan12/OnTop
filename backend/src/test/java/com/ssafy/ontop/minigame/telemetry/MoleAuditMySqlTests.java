package com.ssafy.ontop.minigame.telemetry;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.minigame.service.MoleTargets;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.when;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.minigames.enabled=true", "ontop.behavior-log.enabled=true",
        "ontop.admin.read-ids=201", "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class MoleAuditMySqlTests {
    @LocalServerPort private int port;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper mapper;
    @Autowired private AccessJwtService jwt;
    @Autowired private MoleAuditStore store;
    @Autowired private MoleTimingAudit timingAudit;
    @MockitoBean private ActiveMemberLookup members;
    private final HttpClient http = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_MOLE_AUDIT_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_mole_audit_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_mole_audit_test_ 전용 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_MOLE_AUDIT_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_MOLE_AUDIT_DB_PASSWORD"));
    }

    @Test
    void 두_게임의_타격과_동일_조건_비교는_관리자만_조회할_수_있다() throws Exception {
        for (long user : List.of(101L, 102L, 103L, 201L)) {
            member(user);
        }
        Instant now = Instant.now();
        String date = now.minusSeconds(5).atZone(MinigameRewardBudget.KST).toLocalDate().toString();
        for (var game : MoleAuditGame.values()) {
            round(game, 456, 101, now);
            round(game, 457, 101, now);
            round(game, 458, 102, now);
            round(game, 459, 103, now);
            var hidden = new MoleTargets(game.path, 456, 1).hiddenIds(game.holes).iterator().next();
            String lookup = "/api/v1/admin/macro-analysis/mole?game=" + game.path
                    + "&userId=101&roundId=456&date=" + date;
            assertThat(send(lookup, 0, null).statusCode()).isEqualTo(401);
            assertThat(send(lookup, 101, null).statusCode()).isEqualTo(403);
            assertThat(send(endpoint(game, 456), 102, batch("KEYBOARD", 99, hidden)).statusCode()).isEqualTo(204);

            assertThat(send(endpoint(game, 456), 101, batch("KEYBOARD", 180, hidden)).statusCode()).isEqualTo(204);
            assertThat(send(endpoint(game, 457), 101, batch("KEYBOARD", 200, null)).statusCode()).isEqualTo(204);
            assertThat(send(endpoint(game, 458), 102, batch("KEYBOARD", 240, null)).statusCode()).isEqualTo(204);
            assertThat(send(endpoint(game, 459), 103, batch("POINTER", 300, null)).statusCode()).isEqualTo(204);
            await().atMost(Duration.ofSeconds(8)).until(() -> jdbc.queryForObject(
                    "SELECT COUNT(*) FROM behavior_events WHERE event_type = 'MOLE_TAP_BATCH' AND game_id LIKE ?",
                    Integer.class, game.path + ":%") >= 4);

            var found = send(lookup, 201, null);
            assertThat(found.statusCode()).isEqualTo(200);
            assertThat(found.headers().firstValue("Cache-Control")).hasValue("no-store");
            assertThat(mapper.readTree(found.body()).get(0).path("honeypotTaps").asInt()).isEqualTo(1);
            String byNickname = "/api/v1/admin/macro-analysis/mole?game=" + game.path + "&nickname=audit101";
            assertThat(send(byNickname, 101, null).statusCode()).isEqualTo(403);
            var named = mapper.readTree(send(byNickname, 201, null).body());
            assertThat(named.size()).isEqualTo(2);
            assertThat(named.get(0).path("nickname").asText()).isEqualTo("audit101");
            assertThat(named.get(0).path("score").asInt(-1)).isZero();
            assertThat(mapper.readTree(send(byNickname + "&userId=102", 201, null).body()).size()).isZero();
            assertThat(mapper.readTree(send(byNickname.replace("audit101", "audit10"), 201, null).body()).size())
                    .isZero();
            var detail = send("/api/v1/admin/macro-analysis/mole/456?game=" + game.path + "&input=KEYBOARD", 201, null);
            assertThat(detail.statusCode()).isEqualTo(200);
            var value = mapper.readTree(detail.body());
            assertThat(value.path("selected").path("userId").asText()).isEqualTo("101");
            assertThat(value.path("nickname").asText()).isEqualTo("audit101");
            assertThat(value.path("withdrawn").booleanValue()).isFalse();
            assertThat(value.path("recent").size()).isEqualTo(2);
            assertThat(value.path("timeline").size()).isEqualTo(2);
            assertThat(value.path("timeline").get(0).path("outcome").asText()).isEqualTo("HONEYPOT");
            assertThat(value.path("timeline").get(0).path("receivedAt").asText()).isNotBlank();
            assertThat(value.path("member").path("rounds").asInt()).isEqualTo(2);
            assertThat(value.path("reference").path("rounds").asInt()).isEqualTo(1);
            assertThat(value.path("reference").path("first").path("median").asInt()).isEqualTo(240);
            assertThat(jdbc.queryForObject("SELECT score FROM " + game.table + " WHERE id=456", Integer.class))
                    .isEqualTo(0);

            String detections = "/api/v1/admin/macro-analysis/mole/detections?game=" + game.path;
            assertThat(send(detections, 0, null).statusCode()).isEqualTo(401);
            assertThat(send(detections, 101, null).statusCode()).isEqualTo(403);
            Instant beforeCompletion = Instant.now();
            var before = store.detections(game, beforeCompletion.minus(Duration.ofDays(30)), beforeCompletion, 100);
            assertThat(before).singleElement().satisfies(member -> {
                assertThat(member.latestRoundId()).isEqualTo("456");
                assertThat(member.liveRounds()).isEqualTo(1);
            });

            Instant completionAt = Instant.now();
            completionSignal(game, 456, 101, completionAt.minusMillis(1), "SERVER");
            completionSignal(game, 456, 101, completionAt.minusMillis(1), "SERVER");
            completionSignal(game, 457, 101, completionAt, "SERVER");
            completionSignal(game, 458, 102, completionAt, "SERVER");
            completionSignal(game, 459, 103, completionAt, "CLIENT");
            completionSignal(game, 459, 101, completionAt, "SERVER");
            round(game, 460, 103, now.minus(Duration.ofDays(31)));
            completionSignal(game, 460, 103, now.minus(Duration.ofDays(31)), "SERVER");
            var detected = send(detections, 201, null);
            assertThat(detected.statusCode()).isEqualTo(200);
            assertThat(detected.headers().firstValue("Cache-Control")).hasValue("no-store");
            var items = mapper.readTree(detected.body()).path("items");
            assertThat(items.size()).isEqualTo(2);
            var first = items.get(0);
            assertThat(first.path("userId").asText()).isEqualTo("101");
            assertThat(first.path("nickname").asText()).isEqualTo("audit101");
            assertThat(first.path("flaggedRounds").asInt()).isEqualTo(2);
            assertThat(first.path("liveRounds").asInt()).isEqualTo(1);
            assertThat(first.path("completionRounds").asInt()).isEqualTo(2);
            assertThat(first.path("latestRoundId").asText()).isEqualTo("457");
            assertThat(items.get(1).path("userId").asText()).isEqualTo("102");
        }
    }

    @Test
    void 타이밍_신호는_판_확정_뒤_저장되고_관리자만_게임별로_조회한다() throws Exception {
        member(301);
        member(302);
        activeMember(201);
        Instant now = Instant.now();
        var steady = new MoleTimingSignals.Signals(60, 210, List.of(new MoleTimingSignals.Segment(30, 210, 1),
                new MoleTimingSignals.Segment(30, 211, 2), new MoleTimingSignals.Segment(0, null, null)), false, true);
        var fast = new MoleTimingSignals.Signals(25, 120, List.of(new MoleTimingSignals.Segment(25, 120, 30),
                new MoleTimingSignals.Segment(0, null, null), new MoleTimingSignals.Segment(0, null, null)), true, false);
        var normal = new MoleTimingSignals.Signals(40, 320, List.of(new MoleTimingSignals.Segment(40, 320, 60),
                new MoleTimingSignals.Segment(0, null, null), new MoleTimingSignals.Segment(0, null, null)), false, false);
        var paceSegment = new MoleTimingSignals.Segment(159, 124, 27,
                MoleTimingSignals.Pace.measured(160, 156, 158));
        var paceSegments = List.of(paceSegment, paceSegment, paceSegment);
        var paceOnly = new MoleTimingSignals.Signals(465, 400, paceSegments, false, false);
        var paceAndFast = new MoleTimingSignals.Signals(465, 125, paceSegments, true, false);
        var earlySegment = new MoleTimingSignals.Segment(20, 215, 65, null,
                new MoleTimingSignals.EarlyReaction(20, 10, true));
        var earlyOnly = new MoleTimingSignals.Signals(40, 215,
                List.of(earlySegment, earlySegment, new MoleTimingSignals.Segment(0, null, null)), false, false);
        round(MoleAuditGame.SPEED, 601, 301, now);
        round(MoleAuditGame.SPEED, 602, 301, now);
        round(MoleAuditGame.SPEED, 603, 302, now);
        round(MoleAuditGame.MOLE, 604, 302, now);
        round(MoleAuditGame.SPEED, 606, 302, now);
        round(MoleAuditGame.SPEED, 607, 301, now);
        round(MoleAuditGame.MOLE, 608, 302, now);
        round(MoleAuditGame.SPEED, 609, 302, now);
        timingAudit.settled("speed-mole", 301, 601, 1, () -> steady, now.minusSeconds(2));
        timingAudit.settled("speed-mole", 301, 602, 1, () -> fast, now.minusSeconds(1));
        timingAudit.settled("speed-mole", 301, 602, 1, () -> normal, now);
        timingAudit.settled("speed-mole", 302, 603, 1, () -> normal, now);
        timingAudit.settled("whack-a-mole", 302, 604, 3, () -> steady, now);
        timingAudit.settled("speed-mole", 302, 606, 1, () -> paceOnly, now);
        timingAudit.settled("speed-mole", 301, 607, 1, () -> paceAndFast, now);
        timingAudit.settled("whack-a-mole", 302, 608, 3, () -> earlyOnly, now);
        timingAudit.settled("speed-mole", 302, 609, 1, () -> earlyOnly, now);
        await().atMost(Duration.ofSeconds(8)).until(() -> jdbc.queryForObject(
                "SELECT COUNT(*) FROM mole_timing_audits WHERE round_id BETWEEN 601 AND 609", Integer.class) == 8);

        String path = "/api/v1/admin/macro-analysis/mole/timing?game=speed-mole";
        assertThat(send(path, 0, null).statusCode()).isEqualTo(401);
        assertThat(send(path, 301, null).statusCode()).isEqualTo(403);
        var response = send(path, 201, null);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).hasValue("no-store");
        var items = mapper.readTree(response.body()).path("items");
        assertThat(items.size()).isEqualTo(2);
        var member = items.get(0);
        assertThat(member.path("userId").asText()).isEqualTo("301");
        assertThat(member.path("nickname").asText()).isEqualTo("audit301");
        assertThat(member.path("flaggedRounds").asInt()).isEqualTo(3);
        assertThat(member.path("fastRounds").asInt()).isEqualTo(2);
        assertThat(member.path("steadyRounds").asInt()).isEqualTo(1);
        assertThat(member.path("sustainedPaceRounds").asInt()).isEqualTo(1);
        assertThat(member.path("auditedRounds").asInt()).isEqualTo(3);
        assertThat(member.path("lowestMedianReactionMs").asInt()).isEqualTo(120);
        assertThat(member.path("latestRoundId").asText()).isEqualTo("607");
        var paceMember = items.get(1);
        assertThat(paceMember.path("userId").asText()).isEqualTo("302");
        assertThat(paceMember.path("flaggedRounds").asInt()).isEqualTo(2);
        assertThat(paceMember.path("sustainedPaceRounds").asInt()).isEqualTo(1);
        assertThat(paceMember.path("repeatedEarlyReactionRounds").asInt()).isEqualTo(1);
        assertThat(paceMember.path("fastRounds").asInt()).isZero();
        assertThat(paceMember.path("steadyRounds").asInt()).isZero();

        var detail = mapper.readTree(send("/api/v1/admin/macro-analysis/mole/601?game=speed-mole&input=KEYBOARD",
                201, null).body()).path("timing");
        assertThat(detail.path("steady").booleanValue()).isTrue();
        assertThat(detail.path("sustainedPace").isNull()).isTrue();
        assertThat(detail.path("repeatedEarlyReaction").isNull()).isTrue();
        assertThat(detail.path("medianReactionMs").asInt()).isEqualTo(210);
        assertThat(detail.path("segments").size()).isEqualTo(3);
        assertThat(detail.path("segments").get(1).path("spreadMs").asInt()).isEqualTo(2);
        assertThat(detail.path("segments").get(2).path("medianMs").isNull()).isTrue();
        var paceDetail = mapper.readTree(send("/api/v1/admin/macro-analysis/mole/606?game=speed-mole&input=KEYBOARD",
                201, null).body()).path("timing");
        assertThat(paceDetail.path("sustainedPace").booleanValue()).isTrue();
        assertThat(paceDetail.path("segments").get(0).path("pace").path("hits").asInt()).isEqualTo(156);
        var moleItems = mapper.readTree(send("/api/v1/admin/macro-analysis/mole/timing?game=whack-a-mole",
                201, null).body()).path("items");
        assertThat(moleItems.get(0).path("repeatedEarlyReactionRounds").asInt()).isEqualTo(1);
        round(MoleAuditGame.SPEED, 605, 302, now);
        var withoutTiming = send("/api/v1/admin/macro-analysis/mole/605?game=speed-mole&input=KEYBOARD", 201, null);
        assertThat(withoutTiming.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(withoutTiming.body()).path("timing").isNull()).isTrue();
    }

    private void completionSignal(MoleAuditGame game, long id, long user, Instant time, String source) {
        jdbc.update("""
                INSERT INTO behavior_events (event_id,event_type,schema_version,source,occurred_at,user_id,game_id,props)
                VALUES (UUID_TO_BIN(UUID()),'MOLE_ROUND_HONEYPOT',1,?,?,?,?,JSON_OBJECT('hits', 1))
                """, source, LocalDateTime.ofInstant(time, ZoneOffset.UTC), user, game.key(id));
    }

    private static String batch(String input, int at, String targetId) {
        return """
                {"taps":[{"sequence":1,"clientAtMs":%d,"hole":1,"input":"%s","outcome":"HIT",
                "spawnId":1,"appearedAtMs":0,"targetId":%s},
                {"sequence":2,"clientAtMs":400,"hole":2,"input":"%s","outcome":"MISS"}]}
                """.formatted(at, input, targetId == null ? "null" : "\"" + targetId + "\"", input);
    }

    private static String endpoint(MoleAuditGame game, long id) {
        return "/api/v1/minigames/" + game.path + "/rounds/" + id + "/observations";
    }

    private HttpResponse<String> send(String path, long user, String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (user > 0) {
            request.header("Authorization", "Bearer " + jwt.issue(user, TestLoginSessions.ID));
        }
        if (body != null) {
            request.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private void round(MoleAuditGame game, long id, long user, Instant now) {
        var start = LocalDateTime.ofInstant(now.minusSeconds(5), ZoneOffset.UTC);
        var end = LocalDateTime.ofInstant(now, ZoneOffset.UTC);
        if (game == MoleAuditGame.MOLE) {
            jdbc.update("""
                    INSERT INTO mole_rounds (id,user_id,request_key,seed,rules_version,status,started_at,
                        settled_at,score,max_combo,caught,calculated_reward,reward)
                    VALUES (?,?,?,1,3,'SETTLED',?,?,0,0,0,0,0)
                    """, id, user, "audit-" + id, start, end);
        } else {
            jdbc.update("""
                    INSERT INTO speed_mole_rounds (id,user_id,request_key,seed,rules_version,status,started_at,
                        completed_at,score,hits,misses) VALUES (?,?,?,1,1,'SETTLED',?,?,0,0,0)
                    """, id, user, "audit-" + id, start, end);
        }
    }

    private void activeMember(long user) {
        when(members.findActive(user, TestLoginSessions.ID)).thenReturn(Optional.of(new AuthenticatedUser(
                user, LoginProvider.NAVER, TestLoginSessions.ID)));
    }

    private void member(long user) {
        activeMember(user);
        jdbc.update("""
                INSERT INTO users (id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)
                VALUES (?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))
                """, user, UUID.randomUUID().toString(), "audit" + user);
    }
}
