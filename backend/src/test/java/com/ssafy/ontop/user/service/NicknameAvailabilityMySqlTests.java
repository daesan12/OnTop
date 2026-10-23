package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class NicknameAvailabilityMySqlTests {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @Autowired
    private OnboardingTokenStore onboarding;
    @Autowired
    private AuthExchangePersistenceService issuer;
    @Autowired
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("닉네임 검증은 격리된 loopback MySQL 테스트 DB만 사용합니다.");
        }
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @Test
    void 동일_컬럼_collation으로_본인만_제외하고_다른회원은_대소문자없이_중복이다() throws Exception {
        User owner = member(nickname());
        User other = member(nickname());
        String access = credentials(owner).accessToken();
        String variant = owner.getNickname().toLowerCase(Locale.ROOT);

        check(access, owner.getNickname(), true);
        check(access, variant, true);
        check(credentials(other).accessToken(), variant, false);
        check(onboarding(), variant, false);
        assertThat(users.existsByNickname(variant)).isTrue();
        assertThat(users.existsByNicknameAndIdNot(variant, owner.getId())).isFalse();
    }

    @Test
    void 탈퇴회원_닉네임도_계속_중복이며_탈퇴_계정_Access는_거절한다() throws Exception {
        User deleted = member(nickname());
        String deletedAccess = credentials(deleted).accessToken();
        User active = member(nickname());
        jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", deleted.getId());

        check(onboarding(), deleted.getNickname(), false);
        check(credentials(active).accessToken(), deleted.getNickname(), false);
        query(deletedAccess, nickname()).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_MEMBER_STATE_CHANGED"));
    }

    @Test
    void 조회는_회원과_Refresh를_변경하지_않고_온보딩_토큰을_소비하지_않는다() throws Exception {
        String token = onboarding();
        long beforeUsers = users.count();
        Long beforeRefresh = jdbc.queryForObject("SELECT COUNT(*) FROM refresh_tokens", Long.class);
        String available = nickname();

        check(token, available, true);
        check(token, available, true);
        assertThat(users.count()).isEqualTo(beforeUsers);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM refresh_tokens", Long.class)).isEqualTo(beforeRefresh);
        assertThat(onboarding.verify(token)).isNotNull();
    }

    @Test
    void 사전조회후_선점되면_최종_온보딩은_409이며_기존_재시도_정책을_유지한다() throws Exception {
        String token = onboarding();
        String available = nickname();
        check(token, available, true);
        member(available);
        long before = users.count();

        mvc.perform(post("/api/v1/users/onboarding").header("Authorization", "Bearer " + token)
                        .header("Origin", "http://localhost:8080").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"" + available + "\",\"characterGender\":\"MALE\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_NICKNAME_ALREADY_EXISTS"));
        assertThat(users.count()).isEqualTo(before);
        check(token, nickname(), true);
    }

    @Test
    void 실제_로그아웃한_로그인_계열은_닉네임_조회에도_사용할_수_없다() throws Exception {
        User user = member(nickname());
        var credentials = credentials(user);
        check(credentials.accessToken(), user.getNickname(), true);
        mvc.perform(post("/api/v1/auth/logout").header("Origin", "http://localhost:8080")
                        .cookie(new Cookie("ONTOP_REFRESH", credentials.refreshToken())))
                .andExpect(status().isNoContent());
        query(credentials.accessToken(), user.getNickname()).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_MEMBER_STATE_CHANGED"));
    }

    private void check(String token, String nickname, boolean available) throws Exception {
        query(token, nickname).andExpect(status().isOk()).andExpect(jsonPath("$.nickname").value(nickname))
                .andExpect(jsonPath("$.available").value(available));
    }

    private ResultActions query(String token, String nickname) throws Exception {
        return mvc.perform(get("/api/v1/users/nickname-availability").param("nickname", nickname)
                .header("Authorization", "Bearer " + token));
    }

    private String onboarding() {
        return onboarding.issue(new OAuthIdentity(OAuthProvider.SSAFY, "nick-fixture-" + UUID.randomUUID()));
    }

    private User member(String nickname) {
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "nick-fixture-" + UUID.randomUUID(),
                nickname, CharacterGender.MALE));
    }

    private String nickname() {
        return "N" + UUID.randomUUID().toString().replace("-", "").substring(0, 7);
    }

    private AuthExchangePersistenceService.Credentials credentials(User user) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null));
    }
}
