package com.ssafy.ontop.user.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.dto.UserNicknameUpdateRequest;
import com.ssafy.ontop.user.exception.UserNicknameUpdateException;
import com.ssafy.ontop.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class UserNicknameUpdateMySqlTests {

    @Autowired
    private MockMvc mvc;
    @Autowired
    private ObjectMapper mapper;
    @Autowired
    private AuthExchangePersistenceService issuer;
    @Autowired
    private OnboardingTokenStore onboarding;
    @Autowired
    private UserNicknameUpdateService service;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private EntityManager entities;
    @MockitoSpyBean
    private UserRepository users;
    @MockitoSpyBean
    private PlatformTransactionManager transactions;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("닉네임 수정은 격리 loopback 테스트 DB에서만 검증합니다.");
        }
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @Test
    void 수정후_USER01과_USER04가_같은_DB상태를_반영하고_다른필드를_보존한다() throws Exception {
        User user = member();
        String previous = user.getNickname();
        var credentials = credentials(user);
        String target = nickname();
        Long refreshBefore = jdbc.queryForObject("SELECT COUNT(*) FROM refresh_tokens", Long.class);

        update(credentials.accessToken(), target).andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(user.getId()))
                .andExpect(jsonPath("$.nickname").value(target))
                .andExpect(jsonPath("$.characterGender").value("FEMALE"));
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + credentials.accessToken()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.nickname").value(target));
        available(credentials.accessToken(), target, true);
        String pending = onboarding.issue(new OAuthIdentity(OAuthProvider.NAVER, "pending-" + UUID.randomUUID()));
        available(pending, target, false);
        available(pending, previous, true);

        User stored = users.findById(user.getId()).orElseThrow();
        assertThat(stored.getLoginProvider()).isEqualTo(user.getLoginProvider());
        assertThat(stored.getProviderUserId()).isEqualTo(user.getProviderUserId());
        assertThat(stored.getCharacterGender()).isEqualTo(user.getCharacterGender());
        assertThat(stored.getCreatedAt()).isEqualTo(user.getCreatedAt());
        assertThat(stored.getDeletedAt()).isNull();
        assertThat(stored.getUpdatedAt()).isAfterOrEqualTo(user.getUpdatedAt());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM refresh_tokens", Long.class)).isEqualTo(refreshBefore);
    }

    @Test
    void 동일_닉네임은_갱신없이_성공하고_대소문자만_바꾸면_요청한_표기를_저장한다() throws Exception {
        User user = member();
        String access = credentials(user).accessToken();
        update(access, user.getNickname()).andExpect(status().isOk());
        assertThat(users.findById(user.getId()).orElseThrow().getUpdatedAt()).isEqualTo(user.getUpdatedAt());
        String lower = user.getNickname().toLowerCase(Locale.ROOT);
        update(access, lower).andExpect(status().isOk()).andExpect(jsonPath("$.nickname").value(lower));
        assertThat(users.findById(user.getId()).orElseThrow().getNickname()).isEqualTo(lower);
        available(access, user.getNickname(), true);
    }

    @Test
    void 다른회원과_탈퇴회원의_닉네임은_대소문자없이_409다() throws Exception {
        User user = member();
        String access = credentials(user).accessToken();
        User other = member();
        update(access, other.getNickname().toLowerCase(Locale.ROOT)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_NICKNAME_ALREADY_EXISTS"));
        jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", other.getId());
        update(access, other.getNickname()).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_NICKNAME_ALREADY_EXISTS"));
        assertThat(users.findById(user.getId()).orElseThrow().getNickname()).isEqualTo(user.getNickname());
    }

    @Test
    void 로그아웃과_탈퇴한_회원의_기존_JWT는_수정할수_없다() throws Exception {
        User loggedOut = member();
        var credentials = credentials(loggedOut);
        mvc.perform(post("/api/v1/auth/logout").header("Origin", "http://localhost:8080")
                        .cookie(new Cookie("ONTOP_REFRESH", credentials.refreshToken())))
                .andExpect(status().isNoContent());
        update(credentials.accessToken(), nickname()).andExpect(status().isUnauthorized());

        User deleted = member();
        String access = credentials(deleted).accessToken();
        jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=?", deleted.getId());
        update(access, nickname()).andExpect(status().isUnauthorized());
        assertThat(users.findById(deleted.getId()).orElseThrow().getNickname()).isEqualTo(deleted.getNickname());
    }

    @Test
    void 서로다른_회원이_사전검증을_동시에_통과해도_UNIQUE로_하나만_변경한다() throws Exception {
        User first = member();
        User second = member();
        String firstAccess = credentials(first).accessToken();
        String secondAccess = credentials(second).accessToken();
        String target = nickname();
        CountDownLatch checked = new CountDownLatch(2);
        AtomicInteger calls = new AtomicInteger();
        doAnswer(call -> {
            String candidate = call.getArgument(0);
            Long owner = call.getArgument(1);
            // Spring Data 추상 메서드 대신 같은 트랜잭션의 실제 SQL로 읽고 경합 지점만 동기화한다.
            boolean result = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE nickname=? AND id<>?",
                    Long.class, candidate, owner) > 0;
            if (candidate.equalsIgnoreCase(target) && calls.incrementAndGet() <= 2) {
                assertThat(result).isFalse();
                checked.countDown();
                assertThat(checked.await(10, TimeUnit.SECONDS)).isTrue();
            }
            return result;
        }).when(users).existsByNicknameAndIdNot(anyString(), anyLong());

        try (var workers = Executors.newFixedThreadPool(2)) {
            var one = workers.submit(() -> update(firstAccess, target).andReturn().getResponse());
            var two = workers.submit(() -> update(secondAccess, target.toLowerCase(Locale.ROOT))
                    .andReturn().getResponse());
            var firstResponse = one.get(20, TimeUnit.SECONDS);
            var secondResponse = two.get(20, TimeUnit.SECONDS);
            assertThat(List.of(firstResponse.getStatus(), secondResponse.getStatus()))
                    .containsExactlyInAnyOrder(200, 409);
            var rejected = firstResponse.getStatus() == 409 ? firstResponse : secondResponse;
            assertThat(mapper.readTree(rejected.getContentAsString()).path("code").asText())
                    .isEqualTo("USER_NICKNAME_ALREADY_EXISTS");
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE nickname=?", Long.class, target))
                .isEqualTo(1L);
        String firstNickname = users.findById(first.getId()).orElseThrow().getNickname();
        String secondNickname = users.findById(second.getId()).orElseThrow().getNickname();
        assertThat(firstNickname.equals(first.getNickname()) ^ secondNickname.equals(second.getNickname())).isTrue();
    }

    @Test
    void SQL_flush후_장애가_발생하면_변경은_롤백된다() {
        User user = member();
        doAnswer(call -> {
            entities.flush();
            throw new DataAccessResourceFailureException("private-post-flush");
        }).when(users).flush();
        assertUnavailable(user);
        assertThat(users.findById(user.getId()).orElseThrow().getNickname()).isEqualTo(user.getNickname());
    }

    @Test
    void 커밋_실패는_성공으로_응답하지_않고_변경을_롤백한다() {
        User user = member();
        AtomicBoolean failed = new AtomicBoolean();
        doAnswer(call -> {
            TransactionStatus status = call.getArgument(0);
            if (status.isNewTransaction() && failed.compareAndSet(false, true)) {
                transactions.rollback(status);
                throw new TransactionSystemException("private-commit");
            }
            return call.callRealMethod();
        }).when(transactions).commit(any());
        assertUnavailable(user);
        assertThat(users.findById(user.getId()).orElseThrow().getNickname()).isEqualTo(user.getNickname());
    }

    private void assertUnavailable(User user) {
        assertThatThrownBy(() -> service.update(user.getId(), new UserNicknameUpdateRequest(nickname())))
                .isInstanceOfSatisfying(UserNicknameUpdateException.class,
                        error -> assertThat(error.error()).isEqualTo(UserNicknameUpdateException.Error.STORAGE));
    }

    private ResultActions update(String access, String nickname) throws Exception {
        return mvc.perform(patch("/api/v1/users/me").header("Authorization", "Bearer " + access)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("nickname", nickname))));
    }

    private void available(String access, String nickname, boolean expected) throws Exception {
        mvc.perform(get("/api/v1/users/nickname-availability").header("Authorization", "Bearer " + access)
                        .param("nickname", nickname))
                .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(expected));
    }

    private User member() {
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "rename-fixture-" + UUID.randomUUID(),
                nickname(), CharacterGender.FEMALE));
    }

    private String nickname() {
        return "U" + UUID.randomUUID().toString().replace("-", "").substring(0, 7);
    }

    private AuthExchangePersistenceService.Credentials credentials(User user) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null));
    }
}
