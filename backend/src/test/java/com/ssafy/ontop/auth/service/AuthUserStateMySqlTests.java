package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
@ActiveProfiles("db")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class AuthUserStateMySqlTests {

    @Autowired
    private AuthUserStateService service;

    @Autowired
    private UserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("AUTH MySQL 테스트는 전용 loopback 검증 DB만 사용합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
    }

    @Test
    void 신규_소셜_사용자는_온보딩_대상이며_행을_생성하지_않는다() {
        long before = users.count();
        OAuthIdentity identity = new OAuthIdentity(OAuthProvider.NAVER, "auth61-new-" + UUID.randomUUID());

        LoginOutcome result = service.resolve(identity);

        assertThat(result.status()).isEqualTo(LoginOutcome.Status.NEW_MEMBER);
        assertThat(result.userId()).isNull();
        assertThat(result.providerUserId()).isEqualTo(identity.providerUserId());
        assertThat(users.count()).isEqualTo(before);
    }

    @Test
    void 활성_사용자는_기존_ID를_유지한다() {
        OAuthIdentity identity = insertUser(null);
        User original = find(identity);

        LoginOutcome result = service.resolve(identity);

        assertThat(result.status()).isEqualTo(LoginOutcome.Status.EXISTING_MEMBER);
        assertThat(result.userId()).isEqualTo(original.getId());
        assertThat(find(identity).getNickname()).isEqualTo(original.getNickname());
    }

    @Test
    void 탈퇴_6일_사용자는_같은_ID와_데이터로_복구한다() {
        OAuthIdentity identity = insertUser(Instant.now().minus(Duration.ofDays(6)));
        User original = find(identity);

        LoginOutcome result = service.resolve(identity);

        assertThat(result.status()).isEqualTo(LoginOutcome.Status.RESTORED_MEMBER);
        assertThat(result.userId()).isEqualTo(original.getId());
        User restored = find(identity);
        assertThat(restored.getDeletedAt()).isNull();
        assertThat(restored.getNickname()).isEqualTo(original.getNickname());
        assertThat(restored.getCreatedAt()).isEqualTo(original.getCreatedAt());
        assertThat(restored.getCharacterGender()).isEqualTo(original.getCharacterGender());
    }

    @Test
    void 탈퇴_8일_사용자는_기존_행을_보존하고_재가입을_보류한다() {
        OAuthIdentity identity = insertUser(Instant.now().minus(Duration.ofDays(8)));
        User original = find(identity);

        assertThatThrownBy(() -> service.resolve(identity)).isInstanceOfSatisfying(AuthCallbackException.class,
                exception -> assertThat(exception.error()).isEqualTo(AuthCallbackException.Error.REJOIN_PENDING));

        User unchanged = find(identity);
        assertThat(unchanged.getId()).isEqualTo(original.getId());
        assertThat(unchanged.getDeletedAt()).isEqualTo(original.getDeletedAt());
        assertThat(unchanged.getNickname()).isEqualTo(original.getNickname());
    }

    @Test
    void 동시_복구는_한_번만_수행하고_모든_요청은_같은_ID를_사용한다() throws Exception {
        OAuthIdentity identity = insertUser(Instant.now().minus(Duration.ofDays(6)));
        Long originalId = find(identity).getId();
        CountDownLatch start = new CountDownLatch(1);
        List<LoginOutcome> outcomes = new ArrayList<>();

        try (var executor = Executors.newFixedThreadPool(4)) {
            List<Future<LoginOutcome>> futures = new ArrayList<>();
            for (int index = 0; index < 4; index++) {
                futures.add(executor.submit(() -> {
                    start.await();
                    return service.resolve(identity);
                }));
            }
            start.countDown();
            for (Future<LoginOutcome> future : futures) {
                outcomes.add(future.get(15, TimeUnit.SECONDS));
            }
        }

        assertThat(outcomes).extracting(LoginOutcome::userId).containsOnly(originalId);
        assertThat(outcomes.stream().filter(value -> value.status() == LoginOutcome.Status.RESTORED_MEMBER).count())
                .isEqualTo(1);
        assertThat(outcomes.stream().filter(value -> value.status() == LoginOutcome.Status.EXISTING_MEMBER).count())
                .isEqualTo(3);
        assertThat(find(identity).getDeletedAt()).isNull();
    }

    private OAuthIdentity insertUser(Instant deletedAt) {
        String unique = UUID.randomUUID().toString().replace("-", "");
        String providerId = "auth61-" + unique;
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender,
                                   created_at, updated_at, deleted_at)
                VALUES ('SSAFY', ?, ?, 'MALE', '2026-01-01 00:00:00.123', '2026-01-01 00:00:00.123', ?)
                """, providerId, unique.substring(0, 8), deletedAt == null ? null : Timestamp.from(deletedAt));
        return new OAuthIdentity(OAuthProvider.SSAFY, providerId);
    }

    private User find(OAuthIdentity identity) {
        return users.findByLoginProviderAndProviderUserId(identity.provider().loginProvider(), identity.providerUserId())
                .orElseThrow();
    }
}
