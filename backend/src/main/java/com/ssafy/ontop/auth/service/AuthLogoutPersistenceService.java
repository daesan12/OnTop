package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.exception.AuthLogoutException;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
public class AuthLogoutPersistenceService {

    private final RefreshTokenRepository tokens;
    private final UserRepository users;
    private final Clock clock;

    public AuthLogoutPersistenceService(RefreshTokenRepository tokens, UserRepository users,
            @Qualifier("oauthClock") Clock clock) {
        this.tokens = tokens;
        this.users = users;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logout(String hash) {
        RefreshTokenRepository.TokenReference reference = tokens.findReferenceByTokenHash(hash).orElse(null);
        if (reference == null) {
            return;
        }
        Long userId = reference.getUserId();
        // AUTH-04와 같은 순서로 잠근다. 소프트 탈퇴한 회원도 현재 계열을 로그아웃할 수 있다.
        users.findForAuthenticationById(userId)
                .orElseThrow(() -> new AuthLogoutException(AuthLogoutException.Error.STORAGE));
        RefreshToken token = tokens.findForUpdateByHash(hash).orElse(null);
        if (token == null) {
            return;
        }
        if (!userId.equals(token.getUserId())) {
            throw new AuthLogoutException(AuthLogoutException.Error.STORAGE);
        }
        // Rotation이 먼저 끝났어도 이전 해시로 같은 계열의 후속 토큰까지 폐기한다.
        // 만료/폐기 이력은 계열 식별에만 사용하며 다른 계열 제재나 재사용 탐지는 수행하지 않는다.
        tokens.revokeSession(userId, token.getSessionId(), clock.instant().truncatedTo(ChronoUnit.MILLIS));
    }
}
