package com.ssafy.ontop.minigame;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV4CompleteDtos;
import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.minigame.dto.MinigameStatusResponse;
import com.ssafy.ontop.minigame.service.BungeoppangV4Spec;
import com.ssafy.ontop.minigame.service.MinigameService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture.class)
class MinigameHttpTests {
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean MinigameService minigames;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void account() {
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(101,
                VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
    }

    @Test
    void 네API는미인증요청을거절한다() throws Exception {
        for (String path : new String[]{"", "/901", "/901/complete", "/901/abandon", "/901/deliveries"}) {
            assertThat(request(path, path.equals("/901") ? null : "{}", null, null).statusCode()).isEqualTo(401);
        }
        verifyNoInteractions(minigames);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"score\":3}", "{\"rewardAmount\":2}", "{\"userId\":202}", "[]", "null", "{"})
    void 완료와포기는점수와사용자위조필드를거절한다(String body) throws Exception {
        for (String suffix : new String[]{"complete", "abandon"}) {
            assertThat(request("/901/" + suffix, body, jwt.issue(101, TestLoginSessions.ID), null).statusCode())
                    .isEqualTo(400);
        }
        verifyNoInteractions(minigames);
    }

    @Test
    void 시작은종류와멱등키를검사한다() throws Exception {
        String token = jwt.issue(101, TestLoginSessions.ID);
        assertThat(request("", "{\"minigameType\":\"BUNGEOPPANG\"}", token, null).statusCode()).isEqualTo(400);
        assertThat(request("", "{\"minigameType\":\"OTHER\"}", token, "one").statusCode()).isEqualTo(400);
        assertThat(request("", "{\"minigameType\":\"BUNGEOPPANG\",\"userId\":202}", token, "one").statusCode())
                .isEqualTo(400);
        verifyNoInteractions(minigames);
    }

    @Test
    void 상태조회는JWT본인ID를사용하고캐시하지않는다() throws Exception {
        when(minigames.loadSession(101, 901, false, false, null)).thenReturn(new MinigameStatusResponse("901", "PLAYING", null, 0,
                Instant.parse("2026-10-23T00:00:00Z"), null));
        var result = request("/901", null, jwt.issue(101, TestLoginSessions.ID), null);
        assertThat(result.statusCode()).isEqualTo(200);
        assertThat(result.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
        assertThat(result.body()).contains("\"score\":null", "\"endedAt\":null");
    }

    @Test
    void v4_시작은_명시한_버전으로_분기하고_서버시각_규칙_첫주문을_반환한다() throws Exception {
        Instant issued = Instant.parse("2026-10-27T00:00:00.123Z");
        var timing = BungeoppangV4Spec.timing(issued);
        var response = new BungeoppangV4Responses.StartResponse("901", "BUNGEOPPANG", "PLAYING",
                "WAITING_START", "v4", BungeoppangV4Spec.CONFIG_VERSION, issued, timing.playStartsAt(),
                timing, BungeoppangV4Spec.rules(), List.of(85, 100, 115), true,
                BungeoppangV4Spec.initialCheckpoint(901));
        when(minigames.startV4(101, "BUNGEOPPANG", "v4-key")).thenReturn(response);

        var result = request("", "{\"minigameType\":\"BUNGEOPPANG\",\"rulesVersion\":\"v4\"}",
                jwt.issue(101, TestLoginSessions.ID), "v4-key");

        assertThat(result.statusCode()).isEqualTo(201);
        assertThat(result.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
        assertThat(result.body()).contains(
                "\"rulesVersion\":\"v4\"",
                "\"phase\":\"WAITING_START\"",
                "\"configVersion\":\"" + BungeoppangV4Spec.CONFIG_VERSION + "\"",
                "\"countdownStartsAt\":\"2026-10-27T00:00:01.123Z\"",
                "\"playStartsAt\":\"2026-10-27T00:00:04.623Z\"",
                "\"bean\":2",
                "\"heats\":[85,100,115]");
        verify(minigames).startV4(101, "BUNGEOPPANG", "v4-key");
    }

    @Test
    void 규칙버전_누락과_v2는_기존_시작으로_보내고_알수없는버전은_거절한다() throws Exception {
        String token = jwt.issue(101, TestLoginSessions.ID);

        assertThat(request("", "{\"minigameType\":\"BUNGEOPPANG\"}", token, "old-1").statusCode())
                .isEqualTo(201);
        assertThat(request("", "{\"minigameType\":\"BUNGEOPPANG\",\"rulesVersion\":\"v2\"}",
                token, "old-2").statusCode()).isEqualTo(201);
        assertThat(request("", "{\"minigameType\":\"BUNGEOPPANG\",\"rulesVersion\":\"v3\"}",
                token, "future").statusCode()).isEqualTo(409);
        assertThat(request("", "{\"minigameType\":\"BUNGEOPPANG\",\"rulesVersion\":4}",
                token, "invalid").statusCode()).isEqualTo(400);

        verify(minigames).start(101, "BUNGEOPPANG", "old-1");
        verify(minigames).start(101, "BUNGEOPPANG", "old-2");
    }

    @Test
    void v4_로비와_세션원본조회는_명시적인_query만_허용한다() throws Exception {
        String token = jwt.issue(101, TestLoginSessions.ID);
        var lobby = new BungeoppangV4Responses.LobbyResponse("v4", Instant.parse("2026-10-27T00:00:00Z"),
                0, 100, true, List.of(), "901", List.of("v2", "v4"));
        when(minigames.statusV4(101)).thenReturn(lobby);
        when(minigames.loadSession(101, 901, true, false, null)).thenReturn(new MinigameStatusResponse("901", "PLAYING",
                null, 0, Instant.parse("2026-10-27T00:00:00Z"), null));

        var status = request("?rulesVersion=v4", null, token, null);
        var source = request("/901?includeSource=true", null, token, null);

        assertThat(status.statusCode()).isEqualTo(200);
        assertThat(status.body()).contains("\"rulesVersion\":\"v4\"", "\"activeSessionId\":\"901\"",
                "\"supportedRulesVersions\":[\"v2\",\"v4\"]");
        assertThat(source.statusCode()).isEqualTo(200);
        verify(minigames).statusV4(101);
        verify(minigames).loadSession(101, 901, true, false, null);
        assertThat(request("?rulesVersion=v4&extra=true", null, token, null).statusCode()).isEqualTo(400);
        assertThat(request("/901?includeSource=1", null, token, null).statusCode()).isEqualTo(400);
    }

    @Test
    void v4_납품은_엄격한_본문과_단일키를_서비스에_전달하고_복구query를_허용한다() throws Exception {
        String token = jwt.issue(101, TestLoginSessions.ID);
        var action = new BungeoppangV4DeliveryDtos.Action(1, "DELIVER", 1000,
                null, null, null, "1", "delivery-1");
        var delivery = new BungeoppangV4DeliveryDtos.Request("v4", 1, "0".repeat(64), List.of(action));
        var response = new BungeoppangV4DeliveryDtos.Response("901", "delivery-1", "1", true,
                Instant.parse("2026-10-27T00:00:10Z"), 1, "0".repeat(64), List.of(1L), 20, 0,
                BungeoppangV4Spec.firstOrder(), BungeoppangV4Spec.initialCheckpoint(901));
        when(minigames.deliver(101, 901, "delivery-1", delivery)).thenReturn(response);

        String body = "{\"rulesVersion\":\"v4\",\"throughSeq\":1,\"prefixHash\":\"" + "0".repeat(64)
                + "\",\"log\":[{\"seq\":1,\"action\":\"DELIVER\",\"t\":1000,"
                + "\"orderId\":\"1\",\"deliveryKey\":\"delivery-1\"}]}";
        var accepted = request("/901/deliveries", body, token, "delivery-1");

        assertThat(accepted.statusCode()).isEqualTo(200);
        assertThat(accepted.body()).contains("\"accepted\":true", "\"deliveryKey\":\"delivery-1\"");
        verify(minigames).deliver(101, 901, "delivery-1", delivery);
        assertThat(request("/901/deliveries", body.replace("}]}", ",\"score\":1}]}"), token,
                "delivery-2").statusCode()).isEqualTo(400);
        String duplicate = body.replaceFirst("\\{\\\"rulesVersion\\\":\\\"v4\\\"",
                "{\\\"rulesVersion\\\":\\\"v4\\\",\\\"rulesVersion\\\":\\\"v4\\\"");
        assertThat(request("/901/deliveries", duplicate, token, "delivery-2").statusCode()).isEqualTo(400);
        assertThat(request("/901/deliveries", " ".repeat(256 * 1024 + 1), token,
                "delivery-2").statusCode()).isEqualTo(413);

        when(minigames.loadSession(101, 901, false, true, "delivery-1"))
                .thenReturn(new MinigameStatusResponse("901", "PLAYING", null, 0,
                        Instant.parse("2026-10-27T00:00:00Z"), null));
        assertThat(request("/901?includeProgress=true&deliveryKey=delivery-1", null, token, null).statusCode())
                .isEqualTo(200);
        verify(minigames).loadSession(101, 901, false, true, "delivery-1");
    }

    @Test
    void v4_완료는_멱등키와_최종prefix를_전달하고_상세정산을_반환한다() throws Exception {
        String token = jwt.issue(101, TestLoginSessions.ID);
        var response = new BungeoppangV4CompleteDtos.Response("901", "COMPLETED", "v4",
                BungeoppangV4Spec.CONFIG_VERSION, 2, 1, 20, 2, 2, 0, 0, 2,
                1, 1, 1, 100, false, 2, 2, 1, 0, 0, 0, 0, 0, 0,
                LocalDate.of(2026, 10, 27), Instant.parse("2026-10-27T00:01:05Z"), 0, "0".repeat(64));
        when(minigames.complete(eq(101L), eq(901L), eq("complete-1"), any(JsonNode.class)))
                .thenReturn(response);
        String body = "{\"rulesVersion\":\"v4\",\"throughSeq\":0,\"prefixHash\":\""
                + "0".repeat(64) + "\",\"log\":[],\"seenTips\":[],\"clientScore\":999}";

        var result = request("/901/complete", body, token, "complete-1");

        assertThat(result.statusCode()).isEqualTo(200);
        assertThat(result.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
        assertThat(result.body()).contains("\"rulesVersion\":\"v4\"", "\"coinsGranted\":1",
                "\"rewardDate\":\"2026-10-27\"", "\"finalPrefixHash\":\"" + "0".repeat(64) + "\"");
        verify(minigames).complete(eq(101L), eq(901L), eq("complete-1"), any(JsonNode.class));
        assertThat(request("/901/complete", body.replaceFirst("\\{\\\"rulesVersion\\\":\\\"v4\\\"",
                "{\\\"rulesVersion\\\":\\\"v4\\\",\\\"rulesVersion\\\":\\\"v4\\\""),
                token, "complete-2").statusCode()).isEqualTo(400);
        assertThat(request("/901/complete", " ".repeat(256 * 1024 + 1), token,
                "complete-2").statusCode()).isEqualTo(413);
    }

    @Test
    void 시작멱등키프리플라이트는허용출처와헤더만받는다() throws Exception {
        var allowed = preflight("http://localhost:8080", "authorization,content-type,idempotency-key");
        assertThat(allowed.statusCode()).isEqualTo(204);
        assertThat(allowed.headers().firstValue("Access-Control-Allow-Headers").orElseThrow().toLowerCase())
                .contains("idempotency-key");
        assertThat(preflight("https://evil.example", "authorization").statusCode()).isEqualTo(403);
        assertThat(preflight("http://localhost:8080", "x-forged-header").statusCode()).isEqualTo(403);
        verifyNoInteractions(minigames);
    }

    private HttpResponse<String> preflight(String origin, String headers) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/minigames/sessions"))
                .header("Origin", origin).header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", headers).method("OPTIONS", HttpRequest.BodyPublishers.noBody());
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> request(String suffix, String body, String token, String key) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/minigames/sessions" + suffix));
        if (token != null) { builder.header("Authorization", "Bearer " + token); }
        if (key != null) { builder.header("Idempotency-Key", key); }
        if (body != null) { builder.header("Content-Type", "application/json"); }
        builder.method(body == null ? "GET" : "POST", body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body));
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
