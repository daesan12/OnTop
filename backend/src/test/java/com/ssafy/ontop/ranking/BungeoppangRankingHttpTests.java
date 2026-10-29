package com.ssafy.ontop.ranking;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.ranking.dto.BungeoppangRankingPage.Item;
import com.ssafy.ontop.ranking.repository.BungeoppangRankingRepository;
import com.ssafy.ontop.user.domain.LoginProvider;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1", "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class BungeoppangRankingHttpTests {
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private ObjectMapper mapper;
    @MockitoBean private ActiveMemberLookup members;
    @MockitoBean private BungeoppangRankingRepository rankings;
    @BeforeEach void member() {
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.of(new AuthenticatedUser(42,
                LoginProvider.SSAFY, TestLoginSessions.ID)));
        when(rankings.personalBests("v5", 120000)).thenReturn(List.of(new Item(1, "42", "본인", 8, 1, Instant.parse("2026-10-28T00:00:00Z"))));
    }
    @Test void 인증된본인순위와_CORS_noStore_입력을확인한다() throws Exception {
        var response = send("GET", "?userId=99", true);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin").orElse(""))
                .isEqualTo("https://dev.on-top.world");
        assertThat(mapper.readTree(response.body()).at("/me/userId").asText()).isEqualTo("42");
        assertThat(send("GET", "?period=WEEK", true).statusCode()).isEqualTo(400);
        assertThat(send("GET", "?rulesVersion=v2", true).statusCode()).isEqualTo(400);
        assertThat(send("GET", "?limit=21", true).statusCode()).isEqualTo(400);
        assertThat(mapper.readTree(response.body()).path("durationMs").asInt()).isEqualTo(120000);
        for (String query : List.of("?durationMs=90000", "?durationMs=", "?rulesVersion=v4&durationMs=120000")) {
            var invalid = send("GET", query, true);
            assertThat(invalid.statusCode()).as(query).isEqualTo(400);
            assertThat(mapper.readTree(invalid.body()).path("code").asText()).isEqualTo("RANKING_INVALID_DURATION");
        }
        verify(rankings, never()).personalBests(eq("v5"), eq(90000));
        verify(rankings, never()).personalBests(eq("v4"), any());
        var options = send("OPTIONS", "", false);
        assertThat(options.statusCode()).isBetween(200, 204);
        assertThat(options.headers().firstValue("Access-Control-Allow-Origin").orElse(""))
                .isEqualTo("https://dev.on-top.world");
    }
    @Test void 미인증은_저장소조회전에차단한다() throws Exception {
        assertThat(send("GET", "", false).statusCode()).isEqualTo(401);
        verifyNoInteractions(rankings);
    }
    private HttpResponse<String> send(String method, String query, boolean authenticated) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/minigames/bungeoppang/rankings" + query)).header("Origin", "https://dev.on-top.world");
            if (authenticated) { request.header("Authorization", "Bearer " + jwt.issue(42, TestLoginSessions.ID)); }
            if (method.equals("OPTIONS")) {
                request.header("Access-Control-Request-Method", "GET").header("Access-Control-Request-Headers", "authorization");
            }
            return client.send(request.method(method, HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}
