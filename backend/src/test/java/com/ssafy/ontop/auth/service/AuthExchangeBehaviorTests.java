package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthExchangeBehaviorTests {

    private static final Instant NOW = Instant.parse("2026-10-23T03:00:00Z");
    private static final LoginOutcome OUTCOME =
            new LoginOutcome(OAuthProvider.SSAFY, LoginOutcome.Status.EXISTING_MEMBER, 42L, null);

    private final List<BehaviorEvent> events = new ArrayList<>();
    private AuthExchangePersistenceService service;

    @BeforeEach
    void setUp() {
        UserRepository users = mock(UserRepository.class);
        User user = new User(LoginProvider.SSAFY, "fixture-private", "로그인검증", CharacterGender.MALE);
        ReflectionTestUtils.setField(user, "id", 42L);
        when(users.findForAuthenticationById(42L)).thenReturn(Optional.of(user));
        AccessJwtService jwt = mock(AccessJwtService.class);
        when(jwt.issue(anyLong(), anyString())).thenReturn("access");
        service = new AuthExchangePersistenceService(users, mock(RefreshTokenRepository.class), jwt,
                Clock.fixed(NOW, ZoneOffset.UTC), new CapturingLog());
    }

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void 로그인은_커밋된_뒤에만_기록한다() {
        TransactionSynchronizationManager.initSynchronization();

        service.issueExisting(OUTCOME);
        assertThat(events).isEmpty();
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);

        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.type()).isEqualTo(BehaviorEventType.AUTH_LOGIN);
            assertThat(event.userId()).isEqualTo(42L);
            assertThat(event.occurredAt()).isEqualTo(NOW);
            assertThat(event.loginSessionId()).hasSize(32);
            assertThat(event.props()).containsEntry("provider", "SSAFY");
        });
    }

    @Test
    void 롤백되면_기록하지_않는다() {
        TransactionSynchronizationManager.initSynchronization();

        service.issueExisting(OUTCOME);
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(sync -> sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

        assertThat(events).isEmpty();
    }

    @Test
    void 트랜잭션_동기화가_없으면_기록_없이_발급만_한다() {
        assertThatCode(() -> service.issueExisting(OUTCOME)).doesNotThrowAnyException();

        assertThat(events).isEmpty();
    }

    private final class CapturingLog implements BehaviorLog {
        @Override
        public void record(Supplier<BehaviorEvent> event) {
            events.add(event.get());
        }

        @Override
        public void recordPosition(Supplier<PositionSample> sample) {
        }
    }
}
