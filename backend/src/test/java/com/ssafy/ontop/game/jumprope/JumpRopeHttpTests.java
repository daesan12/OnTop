package com.ssafy.ontop.game.jumprope;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {"spring.profiles.active=local",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=", "ontop.auth.allowed-origins=http://localhost:5173"})
@Import(MemberAuthenticationFixture.class)
class JumpRopeHttpTests {
    private static final String BASE = "/api/v1/minigames/jump-rope";
    private static final Instant NOW = Instant.parse("2026-11-12T00:00:00Z");
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @Autowired ObjectMapper mapper;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean JumpRopeService service;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach void authenticate() {
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(
                new VerifiedWebSocketUser(101, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
    }

    @Test void all_three_routes_require_bearer_authentication() throws Exception {
        assertStatus(send(request(BASE + "/rounds", false).header("Idempotency-Key", "start")
                .POST(HttpRequest.BodyPublishers.noBody())), 401);
        assertStatus(send(jsonRequest(BASE + "/rounds/1/complete", false, "{\"jumpOffsetsUs\":[]}")), 401);
        assertStatus(send(request(BASE + "/rankings", false).GET()), 401);
        verifyNoInteractions(service);
    }

    @Test void starts_with_one_header_and_returns_the_server_window() throws Exception {
        when(service.start(101, "start")).thenReturn(new JumpRopeDtos.Round("1", 123, 1, NOW,
                NOW.plusSeconds(3), NOW.plusSeconds(98), 60_000));
        var response = send(request(BASE + "/rounds", true).header("Idempotency-Key", "start")
                .POST(HttpRequest.BodyPublishers.noBody()));
        assertStatus(response, 201);
        var body = mapper.readTree(response.body());
        assertThat(body.path("id").asText()).isEqualTo("1");
        assertThat(body.path("startedAt").asText()).isEqualTo("2026-11-12T00:00:03Z");
        assertThat(body.path("expiresAt").asText()).isEqualTo("2026-11-12T00:01:38Z");
        assertStatus(send(request(BASE + "/rounds", true).POST(HttpRequest.BodyPublishers.noBody())), 400);
        assertStatus(send(request(BASE + "/rounds", true).header("Idempotency-Key", "one").header("Idempotency-Key", "two")
                .POST(HttpRequest.BodyPublishers.noBody())), 400);
        verify(service, times(1)).start(anyLong(), anyString());
    }

    @Test void completes_using_only_integer_offsets_and_returns_the_verified_result() throws Exception {
        when(service.complete(101, 1, List.of(728335, 1723348))).thenReturn(new JumpRopeDtos.Result("1", 1, 45,
                new JumpRopeDtos.Counts(2, 0, 3), "missLimit", NOW.plusSeconds(11)));
        var response = send(jsonRequest(BASE + "/rounds/1/complete", true, "{\"jumpOffsetsUs\":[728335,1723348]}"));
        assertStatus(response, 200);
        var body = mapper.readTree(response.body());
        assertThat(body.path("score").asInt()).isEqualTo(45);
        assertThat(body.at("/counts/perfect").asInt()).isEqualTo(2);
        assertThat(body.path("endReason").asText()).isEqualTo("missLimit");

        for (String invalid : List.of("null", "{}", "{\"jumpOffsetsUs\":[1.0]}", "{\"jumpOffsetsUs\":[\"1\"]}",
                "{\"jumpOffsetsUs\":[null]}", "{\"jumpOffsetsUs\":[2147483648]}", "{\"jumpOffsetsUs\":[],\"score\":45}",
                "{\"jumpOffsetsUs\":[],\"jumpOffsetsUs\":[]}")) {
            assertStatus(send(jsonRequest(BASE + "/rounds/1/complete", true, invalid)), 400);
        }
        verify(service, times(1)).complete(anyLong(), anyLong(), anyList());
    }

    @Test void keeps_rankings_page_defaults_and_serializes_no_personal_record_as_null() throws Exception {
        when(service.rankings(101, 10, 0)).thenReturn(new JumpRopeDtos.Rankings(1, "ALL_TIME", NOW,
                0, 0, 10, List.of(), null, false));
        var response = send(request(BASE + "/rankings", true).GET());
        assertStatus(response, 200);
        var body = mapper.readTree(response.body());
        assertThat(body.path("period").asText()).isEqualTo("ALL_TIME");
        assertThat(body.path("me").isNull()).isTrue();
        assertThat(body.path("items").isEmpty()).isTrue();
        assertStatus(send(request(BASE + "/rankings?limit=a", true).GET()), 400);
    }

    @Test void approved_origins_can_preflight_all_three_routes() throws Exception {
        for (var path : List.of("/rounds", "/rounds/1/complete", "/rankings")) {
            for (String origin : List.of("http://localhost:5173", "https://untrusted.invalid")) {
                var response = send(request(BASE + path, false).header("Origin", origin)
                        .header("Access-Control-Request-Method", path.equals("/rankings") ? "GET" : "POST")
                        .header("Access-Control-Request-Headers", "Authorization,Content-Type,Idempotency-Key")
                        .method("OPTIONS", HttpRequest.BodyPublishers.noBody()));
                assertStatus(response, origin.contains("localhost") ? 204 : 403);
            }
        }
        verifyNoInteractions(service);
    }

    @Test void openapi_exposes_jwt_start_key_and_integer_replay_schema() throws Exception {
        var response = send(request("/v3/api-docs", false).GET());
        assertThat(response.statusCode()).isEqualTo(200);
        var api = mapper.readTree(response.body());
        var start = api.path("paths").path(BASE + "/rounds").path("post");
        var complete = api.path("paths").path(BASE + "/rounds/{roundId}/complete").path("post");
        var rankings = api.path("paths").path(BASE + "/rankings").path("get");
        assertThat(start.path("security").toString()).contains("AccessJwt");
        assertThat(start.path("parameters").toString()).contains("Idempotency-Key");
        assertThat(start.at("/responses/201/content/application~1json/schema/$ref").asText()).endsWith("/JumpRopeRound");
        assertThat(complete.at("/requestBody/content/application~1json/schema/$ref").asText()).endsWith("/JumpRopeComplete");
        assertThat(complete.at("/responses/404").isObject()).isTrue();
        assertThat(rankings.at("/responses/200/content/application~1json/schema/$ref").asText()).endsWith("/JumpRopeRankings");
        assertThat(api.at("/components/schemas/JumpRopeComplete/properties/jumpOffsetsUs/items/type").asText()).isEqualTo("integer");
        assertThat(api.at("/components/schemas/JumpRopeRankings/properties/me/$ref").asText()).endsWith("/JumpRopePersonalBest");
        assertThat(api.at("/components/schemas/JumpRopePersonalBest/nullable").asBoolean()).isTrue();
        assertThat(api.at("/components/schemas/JumpRopeRankingItem/nullable").asBoolean()).isFalse();
    }

    private HttpRequest.Builder request(String path, boolean authenticated) {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (authenticated) request.header("Authorization", "Bearer " + jwt.issue(101, TestLoginSessions.ID));
        return request;
    }

    private HttpRequest.Builder jsonRequest(String path, boolean authenticated, String body) {
        return request(path, authenticated).header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
    }

    private HttpResponse<String> send(HttpRequest.Builder request) throws Exception {
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static void assertStatus(HttpResponse<String> response, int status) {
        assertThat(response.statusCode()).as(response.body()).isEqualTo(status);
        assertThat(response.headers().firstValue("Cache-Control")).hasValueSatisfying(value -> assertThat(value).contains("no-store"));
    }
}
