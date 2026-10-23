package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.world.config.WorldProximityProperties;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db,frontend-test",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s"
})
class FrontendIntegrationMySqlTests {

    private static final String ORIGIN = "http://localhost:5173";

    @LocalServerPort
    private int port;
    @Autowired
    private UserRepository users;
    @Autowired
    private AuthExchangePersistenceService issuer;
    @Autowired
    private WorldProximityProperties proximity;
    @Autowired
    private ObjectMapper mapper;

    private final HttpClient http = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("격리된 loopback 회원 테스트 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
    }

    @Test
    void 두_회원이_프론트_Origin으로_입장_이동_채팅_착석_준비_단절_재입장한다() throws Exception {
        Account first = account(LoginProvider.NAVER);
        Account second = account(LoginProvider.SSAFY);
        String tableId = tableId("channel-1", 1);

        var channels = get("/api/v1/channels", first.accessToken());
        assertThat(channels.statusCode()).isEqualTo(200);
        assertThat(channels.headers().firstValue("Access-Control-Allow-Origin")).contains(ORIGIN);
        assertThat(mapper.readTree(channels.body()).path("items").findValuesAsText("channelId"))
                .containsExactly("channel-1", "channel-2");
        assertThat(tables(first).findValuesAsText("tableId"))
                .containsExactlyInAnyOrder(tableId, tableId("channel-1", 2));

        try (var one = connect(first); var two = connect(second)) {
            join(one);
            join(two);
            one.await(message -> hasAvatar(message, Long.toString(second.userId())));

            assertThat(one.request("WORLD_MOVE", Map.of("seq", 1, "dx", 0, "dz", -1,
                    "run", false, "jump", false)).path("type").asText()).isEqualTo("WORLD_STATE");
            one.request("WORLD_CHAT_SEND", Map.of("text", "두 계정 연동 확인"));
            assertThat(two.await(message -> message.path("type").asText().equals("WORLD_CHAT_MESSAGE"))
                    .path("payload").path("text").asText()).isEqualTo("두 계정 연동 확인");
            assertThat(one.request("TABLE_WATCH", Map.of("tableId", tableId)).path("type").asText())
                    .isEqualTo("TABLE_WATCH_STATE");
            one.request("TABLE_UNWATCH", Map.of());

            one.request("TABLE_JOIN", Map.of("tableId", tableId));
            two.request("TABLE_JOIN", Map.of("tableId", tableId));
            one.request("GAME_SELECT", Map.of("gameCode", "OMOK"));
            one.request("READY_SET", Map.of("ready", true));
            assertThat(two.request("READY_SET", Map.of("ready", true))
                    .path("payload").path("allReady").asBoolean()).isTrue();

            one.stopPong();
            assertThat(one.awaitClose()).isEqualTo(1001);
            two.await(message -> message.path("type").asText().equals("TABLE_STATE")
                    && message.path("payload").path("seats").findValuesAsText("userId").stream()
                            .noneMatch(Long.toString(first.userId())::equals));

            try (var restored = connect(first)) {
                join(restored);
                assertThat(restored.request("READY_SET", Map.of("ready", true))
                        .path("payload").path("code").asText()).isEqualTo("NOT_SEATED");
                restored.request("TABLE_JOIN", Map.of("tableId", tableId));
                JsonNode table = null;
                for (JsonNode candidate : tables(first)) {
                    if (candidate.path("tableId").asText().equals(tableId)) {
                        table = candidate;
                        break;
                    }
                }
                assertThat(table).isNotNull();
                assertThat(table.path("occupiedSeats").asInt()).isEqualTo(2);
                assertThat(table.path("readyCount").asInt()).isZero();
                restored.request("TABLE_LEAVE", Map.of());
            }
            two.request("TABLE_LEAVE", Map.of());
        }
    }

    @Test
    void 프로필의_모든_테이블_ID와_좌표가_실제_공원_자료와_일치하고_비인증은_차단한다() throws Exception {
        JsonNode park;
        try (var stream = new ClassPathResource("world/park.json").getInputStream()) {
            park = mapper.readTree(stream);
        }

        assertThat(proximity.chatRadius()).isEqualTo(20);
        assertThat(proximity.watchRadius()).isEqualTo(20);
        assertThat(proximity.tables()).hasSize(4);
        for (String channel : new String[]{"channel-1", "channel-2"}) {
            for (int number = 1; number <= 2; number++) {
                JsonNode position = park.path("tables").get(number - 1).path("position");
                var configured = proximity.tables().get(tableId(channel, number));
                assertThat(configured.x()).isEqualTo(position.get(0).asDouble());
                assertThat(configured.z()).isEqualTo(position.get(2).asDouble());
            }
        }
        assertThat(http.send(HttpRequest.newBuilder(uri("/api/v1/channels")).GET().build(),
                HttpResponse.BodyHandlers.discarding()).statusCode()).isEqualTo(401);
    }

    private Account account(LoginProvider provider) {
        String suffix = UUID.randomUUID().toString().replace("-", "");
        User user = users.saveAndFlush(new User(provider, "frontend-fixture-" + suffix,
                "f" + suffix.substring(0, 7), CharacterGender.MALE));
        String token = issuer.issueExisting(new LoginOutcome(OAuthProvider.valueOf(provider.name()),
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null)).accessToken();
        return new Account(user.getId(), token);
    }

    private ScenarioClient connect(Account account) throws Exception {
        var response = http.send(HttpRequest.newBuilder(uri("/api/v1/auth/websocket-ticket"))
                .header("Authorization", "Bearer " + account.accessToken()).header("Origin", ORIGIN)
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        var client = new ScenarioClient(port, Long.toString(account.userId()),
                mapper.readTree(response.body()).path("ticket").asText(), ORIGIN, "localhost:" + port);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        return client;
    }

    private void join(ScenarioClient client) throws Exception {
        assertThat(client.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"))
                .path("type").asText()).isEqualTo("CHANNEL_STATE");
        client.await(message -> message.path("type").asText().equals("WORLD_STATE"));
    }

    private boolean hasAvatar(JsonNode message, String userId) {
        return message.path("type").asText().equals("WORLD_STATE")
                && message.path("payload").path("avatars").findValuesAsText("userId").contains(userId);
    }

    private JsonNode tables(Account account) throws Exception {
        var response = get("/api/v1/tables?channelId=channel-1", account.accessToken());
        assertThat(response.statusCode()).isEqualTo(200);
        return mapper.readTree(response.body()).path("tables");
    }

    private HttpResponse<String> get(String path, String accessToken) throws Exception {
        return http.send(HttpRequest.newBuilder(uri(path)).header("Authorization", "Bearer " + accessToken)
                .header("Origin", ORIGIN).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    private String tableId(String channel, int number) {
        return "table-" + UUID.nameUUIDFromBytes((channel + "\0table-" + number)
                .getBytes(StandardCharsets.UTF_8));
    }

    private record Account(long userId, String accessToken) {
        @Override
        public String toString() {
            return "FrontendTestAccount[redacted]";
        }
    }
}
