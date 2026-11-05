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
import com.ssafy.ontop.user.repository.UserRepository;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1", "ontop.auth.allowed-origins=https://frontend.example"})
class NicknameAvailabilityHttpTests {

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
    private UserRepository users;
    @MockitoBean(name = "oauthClock")
    private Clock clock;
    private volatile Instant now;
    private String token;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @BeforeEach
    void fixture() {
        now = Instant.parse("2026-10-22T00:00:00Z");
        when(clock.instant()).thenAnswer(call -> now);
        token = onboarding.issue(new OAuthIdentity(OAuthProvider.SSAFY, "synthetic-identity"));
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.of(
                new AuthenticatedUser(42, LoginProvider.SSAFY, TestLoginSessions.ID)));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void 온보딩_토큰은_쿠키없이_사용하며_조회후에도_유효하다(boolean taken) throws Exception {
        when(users.existsByNickname("온탑고수")).thenReturn(taken);
        var response = get("Bearer " + token, "온탑고수");
        assertThat(response.statusCode()).isEqualTo(200);
        var body = mapper.readTree(response.body());
        assertThat(body.size()).isEqualTo(2);
        assertThat(body.path("nickname").asText()).isEqualTo("온탑고수");
        assertThat(body.path("available").asBoolean()).isEqualTo(!taken);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
        assertThat(response.body()).doesNotContain("userId", "provider", "Token", "session");
        assertThat(onboarding.verify(token)).isNotNull();
        assertThat(get("Bearer " + token, "온탑고수").statusCode()).isEqualTo(200);
        verifyNoInteractions(members);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void Access는_활성_회원과_세션을_확인하고_본인_ID만_제외한다(boolean taken) throws Exception {
        when(users.existsByNicknameAndIdNot("OnTop", 42L)).thenReturn(taken);
        var response = get("Bearer " + jwt.issue(42, TestLoginSessions.ID), "OnTop");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(response.body()).path("available").asBoolean()).isEqualTo(!taken);
        verify(members).findActive(42, TestLoginSessions.ID);
        verify(users).existsByNicknameAndIdNot("OnTop", 42L);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"가", "123456789", "가 나", "가!", "😀😀", "ㄱㄴ", " OnTop", "OnTop "})
    void 잘못된_형식과_누락값은_기존_닉네임_오류이다(String nickname) throws Exception {
        error(get("Bearer " + token, nickname), 400, "USER_INVALID_NICKNAME");
        verifyNoInteractions(users);
    }

    @ParameterizedTest
    @ValueSource(strings = {"GM", "gm123", "Gm관리자", "gM사칭"})
    void GM_접두어는_중복_조회_전에_예약_닉네임_오류이다(String nickname) throws Exception {
        error(get("Bearer " + token, nickname), 400, "USER_RESERVED_NICKNAME");
        verifyNoInteractions(users);
    }

    @ParameterizedTest
    @ValueSource(strings = {"시발", "씨1발", "나는병신", "FUCK"})
    void 욕설_비속어는_중복_조회_전에_부적절_닉네임_오류이다(String nickname) throws Exception {
        error(get("Bearer " + token, nickname), 400, "USER_INAPPROPRIATE_NICKNAME");
        verifyNoInteractions(users);
    }

    @ParameterizedTest
    @ValueSource(strings = {"가나", "가나다라마바사아", "Ab12", "게임GM", "온탑GM", "시발점", "class"})
    void 경계값과_허용_문자는_200이다(String nickname) throws Exception {
        assertThat(get("Bearer " + token, nickname).statusCode()).isEqualTo(200);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"Basic invalid", "Bearer forged", "Bearer ob_forged", "Bearer wst_wrong", "Bearer rt_wrong"})
    void 인증_누락과_위조와_다른_용도는_401이다(String authorization) throws Exception {
        var response = get(authorization, "온탑고수");
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("WWW-Authenticate")).contains("Bearer");
        verifyNoInteractions(users);
    }

    @Test
    void 온보딩과_Access의_만료를_각각_거절한다() throws Exception {
        String access = jwt.issue(42, TestLoginSessions.ID);
        now = now.plusSeconds(600);
        error(get("Bearer " + token, "온탑고수"), 401, "AUTH_INVALID_ONBOARDING_TOKEN");
        now = now.plusSeconds(1200);
        error(get("Bearer " + access, "온탑고수"), 401, "AUTH_INVALID_ACCESS_TOKEN");
        verifyNoInteractions(users);
    }

    @Test
    void 소비된_온보딩_토큰과_중복_Authorization을_거절한다() throws Exception {
        onboarding.consume(token);
        error(get("Bearer " + token, "온탑고수"), 401, "AUTH_INVALID_ONBOARDING_TOKEN");
        error(send(builder("온탑고수").header("Authorization", "Bearer " + token)
                .header("Authorization", "Bearer forged").GET().build()), 401, "AUTH_INVALID_ACCESS_TOKEN");
        verifyNoInteractions(users);
    }

    @Test
    void 온보딩_토큰으로_일반_회원_API에_접근할수_없다() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/users/me"))
                .header("Authorization", "Bearer " + token).GET().build();
        error(send(request), 401, "AUTH_INVALID_ACCESS_TOKEN");
        verifyNoInteractions(users);
    }

    @Test
    void 탈퇴_또는_폐기된_로그인_세션은_401이다() throws Exception {
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.empty());
        error(get("Bearer " + jwt.issue(42, TestLoginSessions.ID), "온탑고수"), 401, "AUTH_MEMBER_STATE_CHANGED");
        verifyNoInteractions(users);
    }

    @Test
    void 인증_DB와_중복조회_DB_장애는_503이며_원문을_노출하지_않는다() throws Exception {
        when(users.existsByNickname("온탑고수")).thenThrow(new DataAccessResourceFailureException("private-db"));
        error(get("Bearer " + token, "온탑고수"), 503, "AUTH_MEMBER_LOOKUP_UNAVAILABLE");
        when(members.findActive(42, TestLoginSessions.ID))
                .thenThrow(new DataAccessResourceFailureException("private-db"));
        error(get("Bearer " + jwt.issue(42, TestLoginSessions.ID), "온탑고수"),
                503, "AUTH_MEMBER_LOOKUP_UNAVAILABLE");
    }

    @Test
    void CORS는_기존_허용목록과_Bearer_preflight를_유지한다() throws Exception {
        var preflight = builder("온탑고수").header("Origin", "https://frontend.example")
                .header("Access-Control-Request-Method", "GET")
                .header("Access-Control-Request-Headers", "Authorization")
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build();
        var allowed = send(preflight);
        assertThat(allowed.statusCode()).isEqualTo(200);
        assertThat(allowed.headers().firstValue("Access-Control-Allow-Origin")).contains("https://frontend.example");
        assertThat(allowed.headers().firstValue("Access-Control-Allow-Credentials")).isEmpty();
        error(send(builder("온탑고수").header("Origin", "https://untrusted.invalid").GET().build()),
                403, "AUTH_ORIGIN_NOT_ALLOWED");
        verifyNoInteractions(users);
    }

    private void error(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo(code);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.body()).doesNotContain("private-", "Exception", "SELECT", "synthetic-identity");
    }

    private HttpResponse<String> get(String authorization, String nickname) throws Exception {
        var request = builder(nickname);
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return send(request.GET().build());
    }

    private HttpRequest.Builder builder(String nickname) {
        String query = nickname == null ? "" : "?nickname=" + URLEncoder.encode(nickname, StandardCharsets.UTF_8);
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                + "/api/v1/users/nickname-availability" + query));
    }

    private HttpResponse<String> send(HttpRequest request) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }
}
