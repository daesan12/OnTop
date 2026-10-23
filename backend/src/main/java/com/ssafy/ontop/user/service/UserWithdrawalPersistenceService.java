package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.service.MemberConnectionTermination;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
public class UserWithdrawalPersistenceService {

    private final UserRepository users;
    private final RefreshTokenRepository tokens;
    private final MemberConnectionTermination termination;
    private final Clock clock;

    public UserWithdrawalPersistenceService(UserRepository users, RefreshTokenRepository tokens,
            MemberConnectionTermination termination, @Qualifier("oauthClock") Clock clock) {
        this.users = users;
        this.tokens = tokens;
        this.termination = termination;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void withdraw(long userId) {
        // Refresh Rotation/Logout과 동일하게 회원을 먼저 잠근다.
        var user = users.findForAuthenticationById(userId)
                .filter(member -> member.getDeletedAt() == null)
                .orElseThrow(() -> new RestAuthenticationException(RestAuthenticationException.Error.MEMBER_CHANGED));
        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        user.deactivate(now);
        // 자동 flush로 deleted_at을 반영한 뒤 전 계열을 폐기한다. 같은 트랜잭션이므로 함께 롤백된다.
        tokens.revokeAllForUser(userId, now);
        // 기존 AFTER_COMMIT 리스너만 연결을 종료한다. 여기서는 소켓 I/O를 수행하지 않는다.
        termination.memberDeactivated(userId);
    }
}
