package com.ssafy.ontop.ranking;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.ranking.repository.RankingRepository;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
class RankingHttpTests {
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private AuthTokenProperties tokens;
    @Autowired private ObjectMapper mapper;
    @MockitoBean private ActiveMemberLookup members;
    @MockitoBean private RankingRepository rankings;

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
    void 기본20명과_상위밖_본인순위를_인증된ID로_조회한다() throws Exception {
        when(rankings.findStandings(42, 20)).thenReturn(List.of(
                new RankingRepository.Standing(1, 1, 1, "선두", 900),
                new RankingRepository.Standing(21, 21, 42, "본인", 100)));

        var response = get(jwt.issue(42, TestLoginSessions.ID), "?userId=999");

        assertThat(response.statusCode()).isEqualTo(200);
        var body = mapper.readTree(response.body());
        assertThat(body.path("items").size()).isEqualTo(1);
        assertThat(body.at("/items/0/userId").asText()).isEqualTo("1");
        assertThat(body.at("/myRank/rank").asLong()).isEqualTo(21);
        assertThat(body.at("/myRank/coinBalance").asLong()).isEqualTo(100);
        assertThat(Instant.parse(body.path("updatedAt").asText())).isBeforeOrEqualTo(Instant.now());
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
        assertThat(response.body()).doesNotContain("reserved", "providerUserId", TestLoginSessions.ID);
        verify(rankings).findStandings(42, 20);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "0", "101", "-1", "1.5", "abc", "999999999999", "1&limit=2"})
    void 잘못된_limit는_DB조회전_400이다(String limit) throws Exception {
        var response = get(jwt.issue(42, TestLoginSessions.ID), "?limit=" + limit);

        assertError(response, 400, "INVALID_LIMIT");
        verifyNoInteractions(rankings);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 100})
    void 경계_limit와_빈목록을_허용한다(int limit) throws Exception {
        when(rankings.findStandings(42, limit)).thenReturn(List.of());

        var response = get(jwt.issue(42, TestLoginSessions.ID), "?limit=" + limit);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(response.body()).path("items").isEmpty()).isTrue();
        assertThat(mapper.readTree(response.body()).path("myRank").isNull()).isTrue();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"forged", "rt_forged"})
    void 인증누락과_위조는_조회전에_차단한다(String token) throws Exception {
        assertThat(get(token, "").statusCode()).isEqualTo(401);
        verifyNoInteractions(rankings);
    }

    @Test
    void 만료JWT와_폐기된_sid는_조회전에_차단한다() throws Exception {
        String expired = new AccessJwtService(tokens,
                Clock.fixed(Instant.now().minusSeconds(1801), ZoneOffset.UTC)).issue(42, TestLoginSessions.ID);
        assertError(get(expired, ""), 401, "AUTH_INVALID_ACCESS_TOKEN");
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.empty());
        assertError(get(jwt.issue(42, TestLoginSessions.ID), ""), 401, "AUTH_MEMBER_STATE_CHANGED");
        verifyNoInteractions(rankings);
    }

    @Test
    void DB오류는_접속정보를_숨긴503이다() throws Exception {
        when(rankings.findStandings(42, 20)).thenThrow(new DataAccessResourceFailureException("secret-jdbc"));

        var response = get(jwt.issue(42, TestLoginSessions.ID), "");

        assertError(response, 503, "RANKING_UNAVAILABLE");
        assertThat(response.body()).doesNotContain("secret", "jdbc", "Exception");
    }

    @Test
    void 개발프론트의_인증헤더_preflight는_기존CORS로_허용한다() throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var response = client.send(HttpRequest.newBuilder(uri(""))
                    .header("Origin", "https://dev.on-top.world")
                    .header("Access-Control-Request-Method", "GET")
                    .header("Access-Control-Request-Headers", "Authorization")
                    .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.headers().firstValue("Access-Control-Allow-Origin"))
                    .contains("https://dev.on-top.world");
        }
        verifyNoInteractions(rankings);
    }

    private void assertError(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo(code);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
    }

    private HttpResponse<String> get(String token, String query) throws Exception {
        var request = HttpRequest.newBuilder(uri(query)).GET();
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        try (var client = HttpClient.newHttpClient()) {
            return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        }
    }

    private URI uri(String query) {
        return URI.create("http://127.0.0.1:" + port + "/api/v1/rankings" + query);
    }
}
