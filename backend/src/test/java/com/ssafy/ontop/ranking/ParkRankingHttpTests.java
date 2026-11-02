package com.ssafy.ontop.ranking;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.BalanceItem;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.BungeoppangItem;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.JumpmapItem;
import com.ssafy.ontop.ranking.exception.RankingException;
import com.ssafy.ontop.ranking.service.ParkRankingSnapshotService;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
class ParkRankingHttpTests {
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private ObjectMapper mapper;
    @MockitoBean private ActiveMemberLookup members;
    @MockitoBean private ParkRankingSnapshotService snapshots;

    @DynamicPropertySource
    static void configuration(DynamicPropertyRegistry registry) {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
        registry.add("ontop.auth.allowed-origins", () -> "https://dev.on-top.world");
    }

    @BeforeEach
    void fixture() {
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.of(
                new AuthenticatedUser(42, LoginProvider.SSAFY, TestLoginSessions.ID)));
    }

    @Test
    void 인증된_회원에게_세_랭킹과_집계시각을_한번에_반환한다() throws Exception {
        Instant updatedAt = Instant.parse("2026-11-02T01:00:00Z");
        when(snapshots.current()).thenReturn(new ParkRankingResponse(
                List.of(new BalanceItem(1, "11", "보유자", 100)),
                List.of(new BungeoppangItem(1, "12", "붕어빵왕", 20_000, 14,
                        updatedAt.minusSeconds(2))),
                List.of(new JumpmapItem(1, "13", "점프왕", 8_500,
                        updatedAt.minusSeconds(1))), updatedAt));

        HttpResponse<String> response = get(jwt.issue(42, TestLoginSessions.ID));

        assertThat(response.statusCode()).isEqualTo(200);
        var body = mapper.readTree(response.body());
        assertThat(body.at("/balance/0/userId").asText()).isEqualTo("11");
        assertThat(body.at("/bungeoppang/0/rank").asLong()).isEqualTo(1);
        assertThat(body.at("/bungeoppang/0/score").asLong()).isEqualTo(20_000);
        assertThat(body.at("/bungeoppang/0/maxCombo").asLong()).isEqualTo(14);
        assertThat(body.at("/jumpmap/0/rank").asLong()).isEqualTo(1);
        assertThat(body.at("/jumpmap/0/finishMs").asLong()).isEqualTo(8_500);
        assertThat(body.has("singleGameProfit")).isFalse();
        assertThat(body.has("wins")).isFalse();
        assertThat(body.path("updatedAt").asText()).isEqualTo(updatedAt.toString());
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
        verify(snapshots).current();
    }

    @Test
    void 게임기록이_없으면_두_미니게임_랭킹을_빈_목록으로_반환한다() throws Exception {
        Instant updatedAt = Instant.parse("2026-11-02T01:00:00Z");
        when(snapshots.current()).thenReturn(new ParkRankingResponse(List.of(), List.of(), List.of(), updatedAt));

        HttpResponse<String> response = get(jwt.issue(42, TestLoginSessions.ID));

        assertThat(response.statusCode()).isEqualTo(200);
        var body = mapper.readTree(response.body());
        assertThat(body.path("balance").isArray()).isTrue();
        assertThat(body.path("bungeoppang").isArray()).isTrue();
        assertThat(body.path("bungeoppang")).isEmpty();
        assertThat(body.path("jumpmap").isArray()).isTrue();
        assertThat(body.path("jumpmap")).isEmpty();
    }

    @Test
    void 미인증_요청은_스냅샷에_접근하기_전에_차단한다() throws Exception {
        HttpResponse<String> response = get(null);

        assertThat(response.statusCode()).isEqualTo(401);
        verify(snapshots, never()).current();
    }

    @Test
    void 최초_집계_전에는_민감정보_없이_503을_반환한다() throws Exception {
        when(snapshots.current()).thenThrow(new RankingException(RankingException.Error.STORAGE));

        HttpResponse<String> response = get(jwt.issue(42, TestLoginSessions.ID));

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo("RANKING_UNAVAILABLE");
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
    }

    private HttpResponse<String> get(String token) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(
                "http://127.0.0.1:" + port + "/api/v1/rankings/park")).GET();
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}
