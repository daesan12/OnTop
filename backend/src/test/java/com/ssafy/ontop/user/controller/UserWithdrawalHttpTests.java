package com.ssafy.ontop.user.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.service.UserWithdrawalPersistenceService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
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
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1", "ontop.auth.allowed-origins=https://frontend.example"})
class UserWithdrawalHttpTests {

    @LocalServerPort
    private int port;
    @Autowired
    private AccessJwtService jwt;
    @Autowired
    private OnboardingTokenStore onboarding;
    @Autowired
    private ObjectMapper mapper;
    @MockitoBean
    private ActiveMemberLookup members;
    @MockitoBean
    private UserWithdrawalPersistenceService persistence;
    @MockitoBean(name = "oauthClock")
    private Clock clock;
    private volatile Instant now;
    private String access;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @BeforeEach
    void fixture() {
        now = Instant.parse("2026-10-24T00:00:00Z");
        when(clock.instant()).thenAnswer(call -> now);
        access = jwt.issue(42, TestLoginSessions.ID);
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.of(
                new AuthenticatedUser(42, LoginProvider.SSAFY, TestLoginSessions.ID)));
    }

    @Test
    void 실제_HTTP_Principal의_회원만_탈퇴하고_본문없는_204를_반환한다() throws Exception {
        var response = delete("Bearer " + access);
        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.body()).isEmpty();
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.headers().firstValue("Referrer-Policy")).contains("no-referrer");
        verify(persistence).withdraw(42);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"Basic invalid", "Bearer forged"})
    void 인증_없음과_잘못된_토큰은_401이다(String authorization) throws Exception {
        assertThat(delete(authorization).statusCode()).isEqualTo(401);
        verifyNoInteractions(persistence);
    }

    @Test
    void 온보딩_토큰과_만료_Access는_401이다() throws Exception {
        String token = onboarding.issue(new OAuthIdentity(OAuthProvider.SSAFY, "synthetic-social"));
        error(delete("Bearer " + token), 401, "AUTH_INVALID_ACCESS_TOKEN");
        now = now.plusSeconds(1800);
        error(delete("Bearer " + access), 401, "AUTH_INVALID_ACCESS_TOKEN");
        verifyNoInteractions(persistence);
    }

    @Test
    void 존재하지_않는회원과_탈퇴회원과_폐기된_sid는_401이다() throws Exception {
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.empty());
        error(delete("Bearer " + access), 401, "AUTH_MEMBER_STATE_CHANGED");
        verifyNoInteractions(persistence);
    }

    @Test
    void 인증_DB와_쓰기_DB와_커밋_실패는_503이다() throws Exception {
        doThrow(new DataAccessResourceFailureException("private-db"),
                new TransactionSystemException("private-commit")).when(persistence).withdraw(42);
        error(delete("Bearer " + access), 503, "USER_WITHDRAWAL_UNAVAILABLE");
        error(delete("Bearer " + access), 503, "USER_WITHDRAWAL_UNAVAILABLE");
        when(members.findActive(42, TestLoginSessions.ID))
                .thenThrow(new DataAccessResourceFailureException("private-auth-db"));
        error(delete("Bearer " + access), 503, "AUTH_MEMBER_LOOKUP_UNAVAILABLE");
    }

    @Test
    void 허용되지_않은_Origin은_탈퇴_전에_403이다() throws Exception {
        var request = HttpRequest.newBuilder(url()).header("Authorization", "Bearer " + access)
                .header("Origin", "https://untrusted.invalid").DELETE().build();
        error(send(request), 403, "AUTH_ORIGIN_NOT_ALLOWED");
        verifyNoInteractions(persistence);
    }

    private HttpResponse<String> delete(String authorization) throws Exception {
        var request = HttpRequest.newBuilder(url());
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return send(request.DELETE().build());
    }

    private void error(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        var body = mapper.readTree(response.body());
        assertThat(body.size()).isEqualTo(2);
        assertThat(body.path("code").asText()).isEqualTo(code);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.body()).doesNotContain("private-", "Exception", "SELECT");
    }

    private URI url() {
        return URI.create("http://127.0.0.1:" + port + "/api/v1/users/me?userId=999");
    }

    private HttpResponse<String> send(HttpRequest request) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }
}
