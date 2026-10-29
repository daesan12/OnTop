package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.dto.UserOnboardingRequest;
import com.ssafy.ontop.user.dto.UserOnboardingResponse;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.service.WalletInitializationService;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@Profile("db")
public class UserOnboardingPersistenceService {

    private final UserRepository users;
    private final AuthExchangePersistenceService credentials;
    private final WalletInitializationService wallets;
    private final BehaviorLog behaviorLog;

    public UserOnboardingPersistenceService(UserRepository users, AuthExchangePersistenceService credentials,
            WalletInitializationService wallets) {
        this(users, credentials, wallets, BehaviorLog.disabled());
    }

    @Autowired
    public UserOnboardingPersistenceService(UserRepository users, AuthExchangePersistenceService credentials,
            WalletInitializationService wallets, BehaviorLog behaviorLog) {
        this.users = users;
        this.credentials = credentials;
        this.wallets = wallets;
        this.behaviorLog = behaviorLog;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public CreatedMember create(OAuthIdentity identity, UserOnboardingRequest input, TransactionOutcome outcome) {
        // 호출자가 커밋/롤백의 실제 완료를 확인한 뒤에만 토큰 상태를 변경한다.
        TransactionSynchronizationManager.registerSynchronization(outcome);
        if (users.findByLoginProviderAndProviderUserId(identity.provider().loginProvider(),
                identity.providerUserId()).isPresent()) {
            throw new UserOnboardingException(UserOnboardingException.Error.ALREADY_REGISTERED);
        }
        if (users.existsByNickname(input.nickname())) {
            throw new UserOnboardingException(UserOnboardingException.Error.NICKNAME_TAKEN);
        }
        // 없는 행의 잠금에 의존하지 않는다. 경합의 최종 판정은 두 DB UNIQUE가 담당한다.
        User user = users.saveAndFlush(new User(identity.provider().loginProvider(), identity.providerUserId(),
                input.nickname(), input.characterGender()));
        if (wallets.initializeActiveMember(user.getId()) != WalletInitializationService.Result.CREATED) {
            throw new DataIntegrityViolationException("신규 회원 지갑 초기화를 확인할 수 없습니다.");
        }
        AuthExchangePersistenceService.Credentials issued = credentials.issueForNewUser(user);
        recordOnboardedAfterCommit(user, identity);
        return new CreatedMember(new UserOnboardingResponse(user.getId(), user.getNickname(),
                user.getCharacterGender(), issued.accessToken()), issued.refreshToken());
    }

    // 회원·지갑·Refresh가 함께 커밋된 가입만 기록한다. 로그 실패는 가입 응답에 영향을 주지 않는다.
    private void recordOnboardedAfterCommit(User user, OAuthIdentity identity) {
        long userId = user.getId();
        String gender = user.getCharacterGender().name();
        String provider = identity.provider().name();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                behaviorLog.record(() -> BehaviorEvent.builder(BehaviorEventType.USER_ONBOARDED, Instant.now())
                        .userId(userId)
                        .prop("gender", gender)
                        .prop("provider", provider)
                        .build());
            }
        });
    }

    // 실패한 트랜잭션이 롤백된 뒤 새 트랜잭션으로 중복 원인을 재확인한다. SQL 예외 원문을 해석하지 않는다.
    @Transactional(readOnly = true)
    public UserOnboardingException.Error conflict(OAuthIdentity identity, String nickname) {
        if (users.findByLoginProviderAndProviderUserId(identity.provider().loginProvider(),
                identity.providerUserId()).isPresent()) {
            return UserOnboardingException.Error.ALREADY_REGISTERED;
        }
        if (users.existsByNickname(nickname)) {
            return UserOnboardingException.Error.NICKNAME_TAKEN;
        }
        return UserOnboardingException.Error.STORAGE;
    }

    public record CreatedMember(UserOnboardingResponse body, String refreshToken) {
        @Override
        public String toString() {
            return "CreatedMember[redacted]";
        }
    }

    public static final class TransactionOutcome implements TransactionSynchronization {
        private volatile int status = STATUS_UNKNOWN;

        @Override
        public void afterCompletion(int status) {
            this.status = status;
        }

        public boolean committed() {
            return status == STATUS_COMMITTED;
        }

        public boolean rolledBack() {
            return status == STATUS_ROLLED_BACK;
        }
    }
}
