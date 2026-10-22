package com.ssafy.ontop.user.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
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
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
class UserProfileHttpTests {

    @LocalServerPort
    private int port;
    @Autowired
    private AccessJwtService jwt;
    @Autowired
    private ObjectMapper mapper;
    @MockitoBean
    private ActiveMemberLookup members;
    @MockitoBean
    private UserRepository users;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @BeforeEach
    void activeMember() {
        when(members.findActive(42L, TestLoginSessions.ID)).thenReturn(Optional.of(
                new AuthenticatedUser(42, LoginProvider.SSAFY, TestLoginSessions.ID)));
        when(users.findById(42L)).thenReturn(Optional.of(member()));
    }

    @Test
    void 실제_HTTP와_Security_Principal로_본인만_조회하고_민감정보는_제외한다() throws Exception {
        var response = get("Bearer " + jwt.issue(42, TestLoginSessions.ID), "?userId=999");
        assertThat(response.statusCode()).isEqualTo(200);
        var body = mapper.readTree(response.body());
        assertThat(body.size()).isEqualTo(3);
        assertThat(body.path("userId").asLong()).isEqualTo(42);
        assertThat(body.path("nickname").asText()).isEqualTo("미지");
        assertThat(body.path("characterGender").asText()).isEqualTo("FEMALE");
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
        assertThat(response.body()).doesNotContain("private-social-fixture", TestLoginSessions.ID,
                "providerUserId", "loginProvider", "accessToken", "refreshToken");
        verify(users).findById(42L);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"Basic invalid", "Bearer forged", "Bearer obt_not-an-access-token"})
    void 인증_누락과_위조와_온보딩_문자열은_401이다(String authorization) throws Exception {
        var response = get(authorization, "");
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("WWW-Authenticate")).contains("Bearer");
        verifyNoInteractions(users);
    }

    @Test
    void 인증_단계의_회원_비활성화는_401이다() throws Exception {
        when(members.findActive(42L, TestLoginSessions.ID)).thenReturn(Optional.empty());
        assertError(get("Bearer " + jwt.issue(42, TestLoginSessions.ID), ""), 401, "AUTH_MEMBER_STATE_CHANGED");
        verifyNoInteractions(users);
    }

    @Test
    void 인증_단계_DB_장애는_503이다() throws Exception {
        when(members.findActive(42L, TestLoginSessions.ID))
                .thenThrow(new DataAccessResourceFailureException("private-db-detail"));
        assertError(get("Bearer " + jwt.issue(42, TestLoginSessions.ID), ""),
                503, "AUTH_MEMBER_LOOKUP_UNAVAILABLE");
        verifyNoInteractions(users);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void 인증_이후_삭제되거나_탈퇴한_프로필도_401이다(boolean deleted) throws Exception {
        User user = member();
        ReflectionTestUtils.setField(user, "deletedAt", Instant.now());
        when(users.findById(42L)).thenReturn(deleted ? Optional.empty() : Optional.of(user));
        assertError(get("Bearer " + jwt.issue(42, TestLoginSessions.ID), ""), 401, "AUTH_MEMBER_STATE_CHANGED");
    }

    @Test
    void 프로필_조회_DB_장애도_정보_노출_없이_503이다() throws Exception {
        when(users.findById(42L)).thenThrow(new DataAccessResourceFailureException("private-db-detail"));
        assertError(get("Bearer " + jwt.issue(42, TestLoginSessions.ID), ""),
                503, "AUTH_MEMBER_LOOKUP_UNAVAILABLE");
    }

    private void assertError(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        var body = mapper.readTree(response.body());
        assertThat(body.path("code").asText()).isEqualTo(code);
        assertThat(body.path("message").asText()).isNotBlank();
        assertThat(body.size()).isEqualTo(2);
        assertThat(response.body()).doesNotContain("private-", "Exception", "SELECT");
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
    }

    private User member() {
        User user = new User(LoginProvider.SSAFY, "private-social-fixture", "미지", CharacterGender.FEMALE);
        ReflectionTestUtils.setField(user, "id", 42L);
        return user;
    }

    private HttpResponse<String> get(String authorization, String query) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/users/me" + query));
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(request.GET().build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}
