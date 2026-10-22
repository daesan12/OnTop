package com.ssafy.ontop.auth.security;

import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
public class JpaActiveMemberLookup implements ActiveMemberLookup {

    private final UserRepository users;
    private final Clock clock;

    public JpaActiveMemberLookup(UserRepository users, @Qualifier("oauthClock") Clock clock) {
        this.users = users;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public Optional<AuthenticatedUser> findActive(long userId, String sessionId) {
        // 한 SQL 스냅샷에서 회원과 회전 계열의 현재 유효 토큰을 함께 확인한다. 인증 결과는 캐시하지 않는다.
        return users.findActiveForLoginSession(userId, sessionId, clock.instant())
                .filter(user -> user.getDeletedAt() == null)
                .map(user -> new AuthenticatedUser(user.getId(), user.getLoginProvider(), sessionId));
    }
}
