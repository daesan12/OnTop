package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.repository.UserRepository;
import jakarta.persistence.TransactionRequiredException;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
@ActiveProfiles("db")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class AuthDatabaseDiagnosticsMySqlTests {

    @Autowired
    private AuthUserStateService service;

    @Autowired
    private UserRepository users;

    @Autowired
    private PlatformTransactionManager transactions;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("진단 테스트는 전용 loopback 검증 DB만 사용합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
    }

    @Test
    void 서비스_트랜잭션_프록시를_통한_신규_회원_조회는_행_생성_없이_성공한다() {
        long before = users.count();
        OAuthIdentity identity = new OAuthIdentity(OAuthProvider.SSAFY, "diagnostic-" + UUID.randomUUID());
        assertThat(AopUtils.isAopProxy(service)).isTrue();
        assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();

        LoginOutcome outcome = service.resolve(identity);

        assertThat(outcome.status()).isEqualTo(LoginOutcome.Status.NEW_MEMBER);
        assertThat(outcome.providerUserId()).isEqualTo(identity.providerUserId());
        assertThat(outcome.userId()).isNull();
        assertThat(users.count()).isEqualTo(before);
        assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
    }

    @Test
    void 트랜잭션_안의_비관적_잠금은_신규_사용자에_대해_empty를_반환한다() {
        String identifier = "diagnostic-" + UUID.randomUUID();
        long before = users.count();

        new TransactionTemplate(transactions).executeWithoutResult(transaction -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
            assertThat(users.findForLogin(LoginProvider.NAVER, identifier)).isEmpty();
        });

        assertThat(users.count()).isEqualTo(before);
    }

    @Test
    void 트랜잭션_밖에서_잠금_쿼리를_직접_호출하면_트랜잭션_필수_예외가_발생한다() {
        String identifier = "diagnostic-" + UUID.randomUUID();
        assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();

        assertThatThrownBy(() -> users.findForLogin(LoginProvider.SSAFY, identifier))
                .isInstanceOf(InvalidDataAccessApiUsageException.class)
                .hasRootCauseInstanceOf(TransactionRequiredException.class);
    }
}
