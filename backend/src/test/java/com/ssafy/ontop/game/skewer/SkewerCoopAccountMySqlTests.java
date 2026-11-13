package com.ssafy.ontop.game.skewer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.game.result.GameLifecycle;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopSettlementService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** OAuth 신원만 테스트 입력이며 이후 온보딩·회원/JWT·지갑·결과 REST는 실제 DB 경로다. */
@Tag("mysql")
@ActiveProfiles({"local", "db", "skewer-coop"})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"server.address=127.0.0.1",
                // V165가 db/shop의 items를 참조한다.
                "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop"})
@DirtiesContext
class SkewerCoopAccountMySqlTests {
    @LocalServerPort private int port;
    @Autowired private ObjectMapper mapper;
    @Autowired private OnboardingTokenStore onboarding;
    @Autowired private SkewerCoopSettlementService settlements;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) throws Exception {
        String url = System.getenv("TEST_SKEWER_COOP_AUTH_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_skewer_coop_auth_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("회원 연결 검증은 loopback의 전용 auth DB에서만 실행합니다.");
        }
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        Path journal = Files.createTempDirectory("skewer-account-journal-");
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_SKEWER_COOP_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_SKEWER_COOP_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
        registry.add("ontop.games.skewer-coop.journal-path", journal::toString);
    }

    @Test
    void 정상_온보딩으로_생긴_두_지갑에_지급하고_인증된_본인만_결과와_잔액을_조회한다() throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            JsonNode chef = member(client), server = member(client), outsider = member(client);
            String chefToken = chef.path("accessToken").asText(), serverToken = server.path("accessToken").asText();
            assertThat(mapper.readTree(get(client, "/api/v1/wallets/me", chefToken).body())
                    .path("balance").asLong()).isEqualTo(100);
            long chefId = chef.path("userId").asLong(), serverId = server.path("userId").asLong();
            String id = "skewer-coop-" + UUID.randomUUID();
            var result = new SkewerCoopFinished(new GameLifecycle().finished(id, "vr:" + id, "SKEWER_COOP", 10,
                    List.of(chefId, serverId), List.of(chefId, serverId), "SKEWER_TIME_UP", Instant.now()),
                    247, 1, chefId, serverId, false, 240_000, 240_000);
            settlements.finished(result);
            settlements.retry();
            String path = "/api/v1/minigames/skewer/coop/result?gameId=" + id;
            for (String token : List.of(chefToken, serverToken)) {
                var response = get(client, path, token);
                assertThat(response.statusCode()).isEqualTo(200);
                JsonNode body = mapper.readTree(response.body());
                assertThat(body.path("status").asText()).isEqualTo("SETTLED");
                assertThat(body.path("coinsGranted").asInt()).isEqualTo(12);
                assertThat(body.path("rankingStatus").asText()).isEqualTo("EXCLUDED");
                assertThat(mapper.readTree(get(client, "/api/v1/wallets/me", token).body())
                        .path("balance").asLong()).isEqualTo(112);
            }
            assertThat(get(client, path, outsider.path("accessToken").asText()).statusCode()).isEqualTo(403);
            assertThat(get(client, path, "invalid").statusCode()).isEqualTo(401);
            assertThat(get(client, "/api/v1/minigames/skewer/coop/rankings", chefToken).statusCode()).isEqualTo(200);
            assertThat(get(client, "/dev/alkkagi-park/session", chefToken).statusCode()).isEqualTo(404);
        }
    }

    private JsonNode member(HttpClient client) throws Exception {
        String token = onboarding.issue(new OAuthIdentity(OAuthProvider.SSAFY, "skewer-http-" + UUID.randomUUID()));
        String nickname = "검수" + UUID.randomUUID().toString().replace("-", "").substring(0, 6);
        var response = client.send(HttpRequest.newBuilder(uri("/api/v1/users/onboarding"))
                .header("Authorization", "Bearer " + token).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(
                        Map.of("nickname", nickname, "characterGender", "MALE")))).build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(201);
        return mapper.readTree(response.body());
    }

    private HttpResponse<String> get(HttpClient client, String path, String token) throws Exception {
        return client.send(HttpRequest.newBuilder(uri(path)).header("Authorization", "Bearer " + token).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }
}
