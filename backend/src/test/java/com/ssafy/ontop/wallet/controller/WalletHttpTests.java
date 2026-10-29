package com.ssafy.ontop.wallet.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.config.AuthTokenProperties;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
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
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
class WalletHttpTests {

    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private AuthTokenProperties properties;
    @Autowired private OnboardingTokenStore onboarding;
    @Autowired private ObjectMapper mapper;
    @MockitoBean private ActiveMemberLookup members;
    @MockitoBean private WalletRepository wallets;

    @DynamicPropertySource
    static void tokenConfiguration(DynamicPropertyRegistry registry) {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @BeforeEach
    void fixture() {
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.of(
                new AuthenticatedUser(42, LoginProvider.SSAFY, TestLoginSessions.ID)));
        Wallet wallet = Wallet.forSignup(42, Instant.now());
        ReflectionTestUtils.setField(wallet, "reserved", 30L);
        when(wallets.findByUserId(42)).thenReturn(Optional.of(wallet));
    }

    @Test
    void 실제_HTTP와_검증된Principal로만_본인지갑을_조회한다() throws Exception {
        var response = get("Bearer " + jwt.issue(42, TestLoginSessions.ID), "?userId=999&walletId=999");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(response.body())).isEqualTo(mapper.readTree(
                "{\"balance\":100,\"reservedBalance\":30,\"availableBalance\":70}"));
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.headers().firstValue("Referrer-Policy")).contains("no-referrer");
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
        assertThat(response.body()).doesNotContain(TestLoginSessions.ID, "userId", "walletId", "Token");
        verify(wallets).findByUserId(42);
        verifyNoMoreInteractions(wallets);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"Basic invalid", "Bearer forged", "Bearer rt_forged"})
    void 인증누락과_위조와_다른용도는_조회전_401이다(String authorization) throws Exception {
        assertThat(get(authorization, "").statusCode()).isEqualTo(401);
        verifyNoInteractions(wallets, members);
    }

    @Test
    void 유효한_온보딩토큰도_일반지갑을_조회하지_못한다() throws Exception {
        var identity = new OAuthIdentity(OAuthProvider.SSAFY, "wallet-http-fixture");
        String token = onboarding.issue(identity);
        error(get("Bearer " + token, ""), 401, "AUTH_INVALID_ACCESS_TOKEN");
        assertThat(onboarding.verify(token)).isEqualTo(identity);
        verifyNoInteractions(wallets, members);
    }

    @Test
    void 만료된_Access_JWT는_401이다() throws Exception {
        String expired = new AccessJwtService(properties,
                Clock.fixed(Instant.now().minusSeconds(1801), ZoneOffset.UTC)).issue(42, TestLoginSessions.ID);
        error(get("Bearer " + expired, ""), 401, "AUTH_INVALID_ACCESS_TOKEN");
        verifyNoInteractions(wallets, members);
    }

    @Test
    void 폐기된_sid나_탈퇴회원은_기존인증정책으로_거절한다() throws Exception {
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.empty());
        error(get("Bearer " + jwt.issue(42, TestLoginSessions.ID), ""), 401, "AUTH_MEMBER_STATE_CHANGED");
        verifyNoInteractions(wallets);
    }

    @Test
    void 지갑미생성은_409이며_조회로_초기화하지_않는다() throws Exception {
        when(wallets.findByUserId(42)).thenReturn(Optional.empty());
        error(get("Bearer " + jwt.issue(42, TestLoginSessions.ID), ""), 409, "WALLET_NOT_READY");
        verify(wallets).findByUserId(42);
        verifyNoMoreInteractions(wallets);
    }

    @Test
    void 지갑_DB장애는_안전한_503이다() throws Exception {
        when(wallets.findByUserId(42)).thenThrow(new DataAccessResourceFailureException("private-wallet-db"));
        error(get("Bearer " + jwt.issue(42, TestLoginSessions.ID), ""), 503, "WALLET_UNAVAILABLE");
    }

    @Test
    void 인증_DB장애는_기존503이며_지갑을_조회하지_않는다() throws Exception {
        when(members.findActive(42, TestLoginSessions.ID))
                .thenThrow(new DataAccessResourceFailureException("private-member-db"));
        error(get("Bearer " + jwt.issue(42, TestLoginSessions.ID), ""), 503, "AUTH_MEMBER_LOOKUP_UNAVAILABLE");
        verifyNoInteractions(wallets);
    }

    @Test
    void 허용되지않은_Origin은_기존403이다() throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            var response = client.send(HttpRequest.newBuilder(uri(""))
                    .header("Authorization", "Bearer " + jwt.issue(42, TestLoginSessions.ID))
                    .header("Origin", "https://untrusted.invalid").GET().build(), HttpResponse.BodyHandlers.ofString());
            error(response, 403, "AUTH_ORIGIN_NOT_ALLOWED");
        }
        verifyNoInteractions(wallets, members);
    }

    private void error(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        var body = mapper.readTree(response.body());
        assertThat(body.size()).isEqualTo(2);
        assertThat(body.path("code").asText()).isEqualTo(code);
        assertThat(body.path("message").asText()).isNotBlank();
        assertThat(response.body()).doesNotContain("private-", "Exception", "SELECT", "jdbc:");
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
    }

    private HttpResponse<String> get(String authorization, String query) throws Exception {
        var request = HttpRequest.newBuilder(uri(query));
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(request.GET().build(), HttpResponse.BodyHandlers.ofString());
        }
    }

    private URI uri(String query) {
        return URI.create("http://127.0.0.1:" + port + "/api/v1/wallets/me" + query);
    }
}
