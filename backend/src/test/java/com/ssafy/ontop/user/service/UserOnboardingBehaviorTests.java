package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.dto.UserOnboardingRequest;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.service.WalletInitializationService;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserOnboardingBehaviorTests {

    private static final OAuthIdentity IDENTITY = new OAuthIdentity(OAuthProvider.NAVER, "fixture-private");
    private static final UserOnboardingRequest REQUEST = new UserOnboardingRequest("가입검증", CharacterGender.FEMALE);

    private final List<BehaviorEvent> events = new ArrayList<>();
    private UserOnboardingPersistenceService service;

    @BeforeEach
    void setUp() {
        UserRepository users = mock(UserRepository.class);
        when(users.saveAndFlush(any())).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            ReflectionTestUtils.setField(user, "id", 42L);
            return user;
        });
        AuthExchangePersistenceService credentials = mock(AuthExchangePersistenceService.class);
        when(credentials.issueForNewUser(any()))
                .thenReturn(new AuthExchangePersistenceService.Credentials("access", "rt_fixture_private"));
        WalletInitializationService wallets = mock(WalletInitializationService.class);
        when(wallets.initializeActiveMember(42)).thenReturn(WalletInitializationService.Result.CREATED);
        service = new UserOnboardingPersistenceService(users, credentials, wallets, new CapturingLog());
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void clearSynchronization() {
        TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    void 가입은_커밋된_뒤에만_캐릭터와_로그인_제공자와_함께_기록한다() {
        service.create(IDENTITY, REQUEST, new UserOnboardingPersistenceService.TransactionOutcome());
        assertThat(events).isEmpty();

        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);

        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.type()).isEqualTo(BehaviorEventType.USER_ONBOARDED);
            assertThat(event.userId()).isEqualTo(42L);
            assertThat(event.props()).containsEntry("gender", "FEMALE").containsEntry("provider", "NAVER");
        });
    }

    @Test
    void 롤백된_가입은_기록하지_않는다() {
        service.create(IDENTITY, REQUEST, new UserOnboardingPersistenceService.TransactionOutcome());

        TransactionSynchronizationManager.getSynchronizations()
                .forEach(sync -> sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

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
