package com.ssafy.ontop.ranking;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.BalanceItem;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.JumpRopeItem;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.MoleItem;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse.SpeedMoleItem;
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
    void 인증된_회원에게_네_랭킹과_집계시각을_한번에_반환한다() throws Exception {
        Instant updatedAt = Instant.parse("2026-11-02T01:00:00Z");
        when(snapshots.current()).thenReturn(new ParkRankingResponse(
                List.of(new BalanceItem(1, "11", "보유자", 100)),
                List.of(new MoleItem(1, "12", "두더지왕", 2_000, 14,
                        updatedAt.minusSeconds(2))),
                List.of(new SpeedMoleItem(1, "13", "스피드왕", 85, 2,
                        updatedAt.minusSeconds(1))),
                List.of(new JumpRopeItem(1, "14", "줄넘기왕", 1_250, 1,
                        updatedAt.minusSeconds(3), false)), updatedAt));

        HttpResponse<String> response = get(jwt.issue(42, TestLoginSessions.ID));

        assertThat(response.statusCode()).isEqualTo(200);
        var body = mapper.readTree(response.body());
        assertThat(body.at("/balance/0/userId").asText()).isEqualTo("11");
        assertThat(body.at("/mole/0/rank").asLong()).isEqualTo(1);
        assertThat(body.at("/mole/0/score").asLong()).isEqualTo(2_000);
        assertThat(body.at("/mole/0/maxCombo").asLong()).isEqualTo(14);
        assertThat(body.at("/speedMole/0/rank").asLong()).isEqualTo(1);
        assertThat(body.at("/speedMole/0/score").asLong()).isEqualTo(85);
        assertThat(body.at("/speedMole/0/misses").asLong()).isEqualTo(2);
        assertThat(body.at("/jumpRope/0/userId").asText()).isEqualTo("14");
        assertThat(body.at("/jumpRope/0/score").asLong()).isEqualTo(1_250);
        assertThat(body.at("/jumpRope/0/misses").asLong()).isEqualTo(1);
        assertThat(body.at("/jumpRope/0/completedAt").asText()).isEqualTo("2026-11-02T00:59:57Z");
        assertThat(body.at("/jumpRope/0/gameMaster").asBoolean()).isFalse();
        assertThat(body.path("bungeoppang").isArray()).isTrue();
        assertThat(body.path("jumpmap").isArray()).isTrue();
        assertThat(body.path("skewer").isArray()).isTrue();
        assertThat(body.path("jumpRopeStartsAt").asText()).isEqualTo("2026-11-16T05:00:00Z");
        assertThat(body.path("jumpRopeEndsAtExclusive").asText()).isEqualTo("2026-11-18T15:00:00Z");
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
        assertThat(body.path("mole").isArray()).isTrue();
        assertThat(body.path("mole")).isEmpty();
        assertThat(body.path("speedMole").isArray()).isTrue();
        assertThat(body.path("speedMole")).isEmpty();
        assertThat(body.path("jumpRope").isArray()).isTrue();
        assertThat(body.path("jumpRope")).isEmpty();
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
