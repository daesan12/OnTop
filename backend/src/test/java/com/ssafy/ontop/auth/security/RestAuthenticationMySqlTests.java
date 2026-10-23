package com.ssafy.ontop.auth.security;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@org.springframework.test.context.TestPropertySource(properties = "ontop.websocket.authenticated=false")
class RestAuthenticationMySqlTests {
    private static final String KEY = randomKey();
    @Autowired
    private MockMvc mvc;
    @Autowired
    private AccessJwtService jwt;
    @Autowired
    private AccessAuthenticationService authentication;
    @MockitoSpyBean
    private UserRepository users;
    @Autowired
    private AuthExchangePersistenceService issuer;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private Flyway flyway;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("REST 인증 MySQL 테스트는 전용 loopback 검증 DB만 사용합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> KEY);
    }

    @Test
    void 실제_DB_활성회원과_내부_ID를_인증하고_회원정보를_변경하지_않는다() throws Exception {
        User user = fixture();
        long before = users.count();
        String token = access(user);

        mvc.perform(get("/api/v1/channels").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/tables").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        AuthenticatedUser principal = authentication.authenticate(token);

        assertThat(principal.userId()).isEqualTo(user.getId());
        assertThat(principal.loginProvider()).isEqualTo(LoginProvider.SSAFY);
        assertThat(users.count()).isEqualTo(before);
        assertThat(users.findById(user.getId()).orElseThrow().getUpdatedAt()).isEqualTo(user.getUpdatedAt());
        assertThat(flyway.info().applied()).extracting(info -> info.getVersion().getVersion())
                .containsExactly("1", "2", "3", "4");
        assertThat(flyway.info().pending()).isEmpty();
    }

    @Test
    void 존재하지_않는_내부_ID와_탈퇴회원을_매_요청_DB에서_차단한다() throws Exception {
        mvc.perform(get("/api/v1/tables").header("Authorization", "Bearer " + jwt.issue(Long.MAX_VALUE, TestLoginSessions.ID)))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_MEMBER_STATE_CHANGED"));
        User user = fixture();
        String token = access(user);
        mvc.perform(get("/api/v1/tables").header("Authorization", "Bearer " + token)).andExpect(status().isOk());

        jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", user.getId());

        mvc.perform(get("/api/v1/tables").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_MEMBER_STATE_CHANGED"));
    }

    @Test
    void Repository_장애를_Security_응답_503으로_변환한다() throws Exception {
        User user = fixture();
        String access = access(user);
        doThrow(new DataAccessResourceFailureException("test-internal-db-detail")).when(users)
                .findActiveForLoginSession(eq(user.getId()),
                        anyString(), any());

        String body = mvc.perform(get("/api/v1/tables").header("Authorization", "Bearer " + access))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("AUTH_MEMBER_LOOKUP_UNAVAILABLE"))
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("test-internal-db-detail", "SELECT", "Exception");
    }

    @Test
    void 로그아웃은_Refresh와_같은_로그인계열의_Access를_즉시_차단한다() throws Exception {
        User user = fixture();
        var issued = issuer.issueExisting(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null));
        jakarta.servlet.http.Cookie cookie = new jakarta.servlet.http.Cookie("ONTOP_REFRESH", issued.refreshToken());

        mvc.perform(post("/api/v1/auth/logout").header("Origin", "http://localhost:8080").cookie(cookie))
                .andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/auth/refresh").header("Origin", "http://localhost:8080").cookie(cookie))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/tables").header("Authorization", "Bearer " + issued.accessToken()))
                .andExpect(status().isUnauthorized());
    }

    private String access(User user) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null)).accessToken();
    }

    private User fixture() {
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "auth99-test-" + UUID.randomUUID(),
                "R" + UUID.randomUUID().toString().replace("-", "").substring(0, 7), CharacterGender.FEMALE));
    }

    private static String randomKey() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        return Base64.getEncoder().encodeToString(key);
    }
}
