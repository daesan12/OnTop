package com.ssafy.ontop.user.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.user.service.UserNicknamePersistenceService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1", "ontop.auth.allowed-origins=https://frontend.example"})
class UserNicknameUpdateHttpTests {

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
    @MockitoBean
    private UserNicknamePersistenceService persistence;
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
        now = Instant.parse("2026-10-22T00:00:00Z");
        when(clock.instant()).thenAnswer(call -> now);
        access = jwt.issue(42, TestLoginSessions.ID);
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.of(
                new AuthenticatedUser(42, LoginProvider.SSAFY, TestLoginSessions.ID)));
        User user = new User(LoginProvider.SSAFY, "synthetic-social", "미지", CharacterGender.FEMALE);
        ReflectionTestUtils.setField(user, "id", 42L);
        when(users.findById(42L)).thenReturn(Optional.of(user));
        when(persistence.update(eq(42L), anyString())).thenAnswer(call -> {
            user.changeNickname(call.getArgument(1));
            return new UserProfileResponse(42, user.getNickname(), user.getCharacterGender());
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"온탑고수", "가나", "가나다라마바사아", "ontop"})
    void 실제_HTTP_Principal로_수정하고_GET에서도_같은_응답을_조회한다(String nickname) throws Exception {
        var response = patch("Bearer " + access, mapper.writeValueAsString(Map.of("nickname", nickname)));
        assertThat(response.statusCode()).isEqualTo(200);
        var body = mapper.readTree(response.body());
        assertThat(body.size()).isEqualTo(3);
        assertThat(body.path("userId").asLong()).isEqualTo(42);
        assertThat(body.path("nickname").asText()).isEqualTo(nickname);
        assertThat(body.path("characterGender").asText()).isEqualTo("FEMALE");
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.body()).doesNotContain("synthetic-social", "sessionId", "accessToken", "refreshToken");
        var get = send(HttpRequest.newBuilder(url("/api/v1/users/me"))
                .header("Authorization", "Bearer " + access).GET().build());
        assertThat(get.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(get.body())).isEqualTo(body);
        verify(persistence).update(42, nickname);
    }

    @ParameterizedTest
    @ValueSource(strings = {"가", "123456789", "가 나", " OnTop", "OnTop ", "가!", "😀😀", "ㄱㄴ"})
    void 형식_오류는_공유_검증자의_400이다(String nickname) throws Exception {
        error(patch("Bearer " + access, mapper.writeValueAsString(Map.of("nickname", nickname))),
                400, "USER_INVALID_NICKNAME");
        verifyNoInteractions(persistence);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "{}", "[]", "null", "{bad", "{\"nickname\":null}", "{\"nickname\":1}",
            "{\"nickname\":\"가나\",\"userId\":999}", "{\"nickname\":\"가나\",\"characterGender\":\"MALE\"}"})
    void 요청은_nickname_문자열_한_필드만_허용한다(String body) throws Exception {
        error(patch("Bearer " + access, body), 400, "USER_INVALID_NICKNAME_UPDATE_REQUEST");
        verifyNoInteractions(persistence);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"Basic invalid", "Bearer forged"})
    void 인증_없음과_위조는_401이다(String authorization) throws Exception {
        assertThat(patch(authorization, "{\"nickname\":\"가나\"}").statusCode()).isEqualTo(401);
        verifyNoInteractions(persistence);
    }

    @Test
    void 만료된_Access와_온보딩_토큰은_사용할수_없다() throws Exception {
        String onboardingToken = onboarding.issue(new OAuthIdentity(OAuthProvider.SSAFY, "synthetic-identity"));
        error(patch("Bearer " + onboardingToken, "{\"nickname\":\"가나\"}"), 401, "AUTH_INVALID_ACCESS_TOKEN");
        now = now.plusSeconds(1800);
        error(patch("Bearer " + access, "{\"nickname\":\"가나\"}"), 401, "AUTH_INVALID_ACCESS_TOKEN");
        verifyNoInteractions(persistence);
    }

    @Test
    void 비활성_회원과_폐기된_로그인_계열은_401이다() throws Exception {
        when(members.findActive(42, TestLoginSessions.ID)).thenReturn(Optional.empty());
        error(patch("Bearer " + access, "{\"nickname\":\"가나\"}"), 401, "AUTH_MEMBER_STATE_CHANGED");
        verifyNoInteractions(persistence);
    }

    @Test
    void UNIQUE_경합은_409이고_DB와_커밋_장애는_503이다() throws Exception {
        when(persistence.update(42, "가나")).thenThrow(new DataIntegrityViolationException("private-sql"))
                .thenThrow(new DataAccessResourceFailureException("private-db"))
                .thenThrow(new TransactionSystemException("private-commit"));
        when(persistence.nicknameTaken(42, "가나")).thenReturn(true);
        error(patch("Bearer " + access, "{\"nickname\":\"가나\"}"), 409, "USER_NICKNAME_ALREADY_EXISTS");
        error(patch("Bearer " + access, "{\"nickname\":\"가나\"}"), 503, "USER_PROFILE_UPDATE_UNAVAILABLE");
        error(patch("Bearer " + access, "{\"nickname\":\"가나\"}"), 503, "USER_PROFILE_UPDATE_UNAVAILABLE");
    }

    @Test
    void 비허용_Origin은_수정전에_403이다() throws Exception {
        var request = HttpRequest.newBuilder(url("/api/v1/users/me"))
                .header("Authorization", "Bearer " + access).header("Origin", "https://untrusted.invalid")
                .header("Content-Type", "application/json")
                .method("PATCH", HttpRequest.BodyPublishers.ofString("{\"nickname\":\"가나\"}")).build();
        error(send(request), 403, "AUTH_ORIGIN_NOT_ALLOWED");
        verifyNoInteractions(persistence);
    }

    private void error(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        var body = mapper.readTree(response.body());
        assertThat(body.size()).isEqualTo(2);
        assertThat(body.path("code").asText()).isEqualTo(code);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.body()).doesNotContain("private-", "Exception", "SELECT");
    }

    private HttpResponse<String> patch(String authorization, String body) throws Exception {
        var builder = HttpRequest.newBuilder(url("/api/v1/users/me?userId=999"))
                .header("Content-Type", "application/json");
        if (authorization != null) {
            builder.header("Authorization", authorization);
        }
        return send(builder.method("PATCH", HttpRequest.BodyPublishers.ofString(body)).build());
    }

    private URI url(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private HttpResponse<String> send(HttpRequest request) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }
}
