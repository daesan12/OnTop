package com.ssafy.ontop.ranking;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.ranking.dto.BungeoppangRankingPage.Item;
import com.ssafy.ontop.ranking.repository.BungeoppangRankingRepository;
import com.ssafy.ontop.ranking.service.BungeoppangRankingService;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 실제 HTTP 응답을 수정 없는 FE 파서에 연결한다. 회원/DB 조회와 시계만 fixture다. */
@EnabledIfEnvironmentVariable(named = "TEST_RANKING_FRONTEND", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1", "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(BungeoppangRankingPaginationFlowTests.Timing.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BungeoppangRankingPaginationFlowTests {
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private ObjectMapper mapper;
    @Autowired private RankingClock clock;
    @MockitoBean private ActiveMemberLookup members;
    @MockitoBean private BungeoppangRankingRepository rankings;
    @TempDir Path temporary;

    @Test
    void 기본20명_페이지경계동점_갱신_타인커서_만료복구를_실제FE로_검증한다() throws Exception {
        assertThat(Path.of("../frontend/node_modules/vite/package.json")).exists();
        for (long user : new long[] {42, 43}) {
            when(members.findActive(user, TestLoginSessions.ID)).thenReturn(Optional.of(
                    new AuthenticatedUser(user, LoginProvider.SSAFY, TestLoginSessions.ID)));
        }
        var original = new ArrayList<Item>();
        for (int user = 1; user <= 19; user++) {
            original.add(item(user, user, 100 - user));
        }
        original.add(item(20, 20, 50));
        original.add(item(20, 21, 50));
        original.add(item(22, 42, 49));
        when(rankings.personalBests("v5", 120000)).thenReturn(List.copyOf(original));
        when(rankings.personalBests("v4", null)).thenReturn(List.of());

        JsonNode first = get(42, "", 200);
        assertThat(first.path("items")).hasSize(20);
        assertThat(first.at("/me/rank").asInt()).isEqualTo(22);
        String cursor = first.path("nextCursor").asText();
        String encoded = URLEncoder.encode(cursor, StandardCharsets.UTF_8);
        JsonNode otherUser = get(43, "&cursor=" + encoded, 409);
        JsonNode otherVersion = get(42, "&rulesVersion=v4&cursor=" + encoded, 409);
        JsonNode otherLimit = get(42, "&limit=19&cursor=" + encoded, 409);
        JsonNode otherDuration = get(42, "&durationMs=180000&cursor=" + encoded, 409);
        String tampered = cursor.substring(0, cursor.indexOf('.') + 1) + "AAAA";
        JsonNode invalid = get(42, "&cursor=" + tampered, 400);

        when(rankings.personalBests("v5", 120000)).thenReturn(List.of(item(1, 42, 200)));
        JsonNode second = get(42, "&cursor=" + encoded, 200);
        assertThat(second.path("items")).hasSize(2);
        assertThat(second.at("/items/0/rank").asInt()).isEqualTo(20);
        assertThat(second.path("me")).isEqualTo(first.path("me"));
        assertThat(second.path("snapshotId")).isEqualTo(first.path("snapshotId"));
        assertThat(second.path("nextCursor").isNull()).isTrue();
        verify(rankings, times(1)).personalBests("v5", 120000);

        clock.time = clock.time.plus(Duration.ofMinutes(2));
        JsonNode expired = get(42, "&cursor=" + encoded, 409);
        JsonNode fresh = get(42, "", 200);
        assertThat(fresh.path("snapshotId")).isNotEqualTo(first.path("snapshotId"));
        assertThat(fresh.at("/me/rank").asInt()).isEqualTo(1);
        JsonNode empty = get(42, "&rulesVersion=v4", 200);
        verify(rankings, times(2)).personalBests("v5", 120000);
        verify(rankings, times(1)).personalBests("v4", null);

        Path wire = temporary.resolve("ranking-wire.json");
        Files.writeString(wire, mapper.writeValueAsString(Map.of(
                "first", first, "second", second, "fresh", fresh, "empty", empty,
                "expired", expired, "otherUser", otherUser, "otherVersion", otherVersion,
                "otherLimit", otherLimit, "otherDuration", otherDuration, "invalid", invalid)));
        Path output = temporary.resolve("frontend-output.txt");
        Process node = new ProcessBuilder("node", "tools/check-bungeoppang-ranking-pagination.mjs", wire.toString())
                .redirectErrorStream(true).redirectOutput(output.toFile()).start();
        try {
            assertThat(node.waitFor(45, TimeUnit.SECONDS)).as("FE 파서 검증 제한시간").isTrue();
            String report = Files.readString(output);
            System.out.println(report);
            assertThat(node.exitValue()).as("실제 FE 파서: %s", report).isZero();
        } finally {
            if (node.isAlive()) {
                node.destroyForcibly();
                node.waitFor(5, TimeUnit.SECONDS);
            }
        }
    }

    private Item item(long rank, long user, long made) {
        return new Item(rank, Long.toString(user), "회원" + user, made, 1,
                Instant.parse("2026-10-28T00:00:00Z").plusSeconds(user), made, 9);
    }

    private JsonNode get(long user, String query, int status) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/minigames/bungeoppang/rankings?period=ALL_TIME" + query))
                    .timeout(Duration.ofSeconds(10)).header("Origin", "https://dev.on-top.world")
                    .header("Authorization", "Bearer " + jwt.issue(user, TestLoginSessions.ID)).GET().build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).as(query).isEqualTo(status);
            assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
            assertThat(response.headers().firstValue("Access-Control-Allow-Origin").orElse(""))
                    .isEqualTo("https://dev.on-top.world");
            return mapper.readTree(response.body());
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Timing {
        @Bean RankingClock rankingClock() { return new RankingClock(); }
        @Bean @Primary
        BungeoppangRankingService paginationService(ObjectProvider<BungeoppangRankingRepository> repositories,
                RankingClock clock) {
            return new BungeoppangRankingService(repositories, clock, Duration.ofMinutes(2));
        }
    }

    static class RankingClock extends Clock {
        volatile Instant time = Instant.parse("2026-10-29T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return time; }
    }
}
