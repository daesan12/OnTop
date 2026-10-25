package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.exception.AuthRefreshException;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.user.domain.User;
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
public class AuthRefreshPersistenceService {

    public static final long REUSE_GRACE_SECONDS = 5;
    private final RefreshTokenRepository tokens;
    private final UserRepository users;
    private final AuthExchangePersistenceService credentials;
    private final Clock clock;
    private final AuthenticationRevocations revocations;

    public AuthRefreshPersistenceService(RefreshTokenRepository tokens, UserRepository users,
            AuthExchangePersistenceService credentials, @Qualifier("oauthClock") Clock clock,
            AuthenticationRevocations revocations) {
        this.tokens = tokens;
        this.users = users;
        this.credentials = credentials;
        this.clock = clock;
        this.revocations = revocations;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Rotation rotate(String hash, Instant receivedAt) {
        RefreshTokenRepository.TokenReference reference = tokens.findReferenceByTokenHash(hash).orElse(null);
        if (reference == null) {
            return Rotation.denied(AuthRefreshException.Error.INVALID_TOKEN);
        }
        Long userId = reference.getUserId();
        // 기존 로그인 발급과 같은 잠금 순서다. 같은 계열의 회전/전체 폐기를 직렬화한다.
        User user = users.findForAuthenticationById(userId).orElse(null);
        RefreshToken previous = tokens.findForUpdateByHash(hash).orElse(null);
        if (user == null || previous == null || !userId.equals(previous.getUserId())) {
            return Rotation.denied(AuthRefreshException.Error.INVALID_TOKEN);
        }
        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        if (user.getDeletedAt() != null) {
            tokens.revokeSession(userId, previous.getSessionId(), now);
            revocations.sessionRevoked(userId, previous.getSessionId());
            return Rotation.denied(AuthRefreshException.Error.MEMBER_CHANGED);
        }
        if (previous.getRotatedAt() != null) {
            if (reference.getRotatedAt() == null
                    || !receivedAt.isAfter(previous.getRotatedAt().plusSeconds(REUSE_GRACE_SECONDS))) {
                // 이전 토큰을 받아들이지 않는다. 지연된 병렬 요청/짧은 네트워크 재시도만 폐기 탐지에서 제외한다.
                return Rotation.denied(AuthRefreshException.Error.ALREADY_ROTATED);
            }
            tokens.revokeSession(userId, previous.getSessionId(), now);
            revocations.sessionRevoked(userId, previous.getSessionId(),
                    AuthenticationRevocations.Reason.REFRESH_REUSE_DETECTED);
            // 여기서 예외를 던지면 폐기도 롤백된다. 거절 결과를 커밋한 후 HTTP 계층이 401로 변환한다.
            return Rotation.denied(AuthRefreshException.Error.REUSE_DETECTED);
        }
        if (!previous.isUsableAt(now)) {
            return Rotation.denied(AuthRefreshException.Error.INVALID_TOKEN);
        }
        previous.rotate(now);
        AuthExchangePersistenceService.Credentials issued =
                credentials.issueForSession(user, previous.getSessionId());
        return new Rotation(issued.accessToken(), issued.refreshToken(), null);
    }

    public record Rotation(String accessToken, String refreshToken, AuthRefreshException.Error rejection) {
        public static Rotation denied(AuthRefreshException.Error error) {
            return new Rotation(null, null, error);
        }

        @Override
        public String toString() {
            return "RefreshRotation[redacted]";
        }
    }
}
