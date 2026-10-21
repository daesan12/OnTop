package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
public class AuthExchangePersistenceService {

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final AccessJwtService jwt;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public AuthExchangePersistenceService(UserRepository users, RefreshTokenRepository refreshTokens,
            AccessJwtService jwt, @Qualifier("oauthClock") Clock clock) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.jwt = jwt;
        this.clock = clock;
    }

    @Transactional
    public void verifyNew(LoginOutcome outcome) {
        if (outcome.status() != LoginOutcome.Status.NEW_MEMBER
                || users.findForLogin(outcome.provider().loginProvider(), outcome.providerUserId()).isPresent()) {
            throw changed();
        }
    }

    @Transactional
    public Credentials issueExisting(LoginOutcome outcome) {
        if (outcome.status() == LoginOutcome.Status.NEW_MEMBER) {
            throw changed();
        }
        User user = users.findForAuthenticationById(outcome.userId()).orElseThrow(this::changed);
        if (user.getDeletedAt() != null || user.getLoginProvider() != outcome.provider().loginProvider()) {
            throw changed();
        }
        return issueCredentials(user, UUID.randomUUID().toString());
    }

    // USER-05의 회원 INSERT와 Refresh INSERT는 반드시 같은 호출자 트랜잭션에 참여한다.
    @Transactional(propagation = Propagation.MANDATORY)
    public Credentials issueForNewUser(User user) {
        if (user.getId() == null || user.getDeletedAt() != null) {
            throw changed();
        }
        return issueCredentials(user, UUID.randomUUID().toString());
    }

    // AUTH-04는 기존 세션 계열을 유지하고 폐기와 발급을 같은 트랜잭션에서 처리한다.
    @Transactional(propagation = Propagation.MANDATORY)
    public Credentials issueForSession(User user, String sessionId) {
        if (user.getId() == null || user.getDeletedAt() != null) {
            throw changed();
        }
        return issueCredentials(user, sessionId);
    }

    private Credentials issueCredentials(User user, String sessionId) {
        String access = jwt.issue(user.getId());
        String refresh = "rt_" + OpaqueTokens.generate(random);
        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        refreshTokens.saveAndFlush(new RefreshToken(user, sessionId, OpaqueTokens.digest(refresh),
                now, now.plusSeconds(RefreshCookieService.LIFETIME_SECONDS)));
        // HTTP 계층은 최상위 발급/가입 트랜잭션의 커밋 성공 후에만 이 값을 사용한다.
        return new Credentials(access, refresh);
    }

    private AuthExchangeException changed() {
        return new AuthExchangeException(AuthExchangeException.Error.MEMBER_CHANGED);
    }

    public record Credentials(String accessToken, String refreshToken) {
        @Override
        public String toString() {
            return "Credentials[redacted]";
        }
    }
}
