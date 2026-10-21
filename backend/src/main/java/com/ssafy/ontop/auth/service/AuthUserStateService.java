package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
public class AuthUserStateService {

    private final UserRepository users;
    private final Clock clock;

    public AuthUserStateService(UserRepository users, @Qualifier("oauthClock") Clock clock) {
        this.users = users;
        this.clock = clock;
    }

    @Transactional
    public LoginOutcome resolve(OAuthIdentity identity) {
        User user = users.findForLogin(identity.provider().loginProvider(), identity.providerUserId()).orElse(null);
        if (user == null) {
            return new LoginOutcome(identity.provider(), LoginOutcome.Status.NEW_MEMBER,
                    null, identity.providerUserId());
        }
        if (user.getDeletedAt() == null) {
            return new LoginOutcome(identity.provider(), LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null);
        }
        // 행 잠금을 획득한 뒤 시각과 현재 탈퇴 상태를 다시 판정한다.
        Instant now = clock.instant();
        if (user.getDeletedAt().isAfter(now)) {
            throw new AuthCallbackException(AuthCallbackException.Error.DATABASE_UNAVAILABLE);
        }
        if (!user.restoreWithinRecoveryPeriod(now)) {
            throw new AuthCallbackException(AuthCallbackException.Error.REJOIN_PENDING);
        }
        users.flush();
        return new LoginOutcome(identity.provider(), LoginOutcome.Status.RESTORED_MEMBER, user.getId(), null);
    }
}
