package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.dto.AuthRefreshResponse;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.exception.AuthRefreshException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class AuthRefreshService {

    private final ObjectProvider<AuthRefreshPersistenceService> persistence;
    private final RefreshCookieService cookies;
    private final Clock clock;
    private final AuthExchangeOriginPolicy origins;

    public AuthRefreshService(ObjectProvider<AuthRefreshPersistenceService> persistence, RefreshCookieService cookies,
            @Qualifier("oauthClock") Clock clock, AuthExchangeOriginPolicy origins) {
        this.persistence = persistence;
        this.cookies = cookies;
        this.clock = clock;
        this.origins = origins;
    }

    public Result refresh(HttpServletRequest request) {
        // 인코딩/경로 파라미터 등 MVC 경로 해석 차이에도 인증 경계에서 출처 검증을 강제한다.
        if (origins.allowedOrigin(request) == null) {
            throw new AuthExchangeException(AuthExchangeException.Error.ORIGIN_DENIED);
        }
        // DB 잠금 대기 전에 기록하여 먼저 도착한 병렬 요청을 늦은 재사용으로 오인하지 않는다.
        Instant receivedAt = clock.instant();
        Cookie[] incoming = request.getCookies();
        List<Cookie> matches = incoming == null ? List.of() : Arrays.stream(incoming)
                .filter(cookie -> RefreshCookieService.NAME.equals(cookie.getName())).toList();
        if (matches.size() != 1 || matches.getFirst().getValue() == null
                || !matches.getFirst().getValue().matches("rt_[A-Za-z0-9_-]{43}")) {
            throw new AuthRefreshException(AuthRefreshException.Error.INVALID_TOKEN);
        }
        cookies.validate();
        AuthRefreshPersistenceService issuer = persistence.getIfAvailable();
        if (issuer == null) {
            throw new AuthRefreshException(AuthRefreshException.Error.STORAGE);
        }
        AuthRefreshPersistenceService.Rotation rotation;
        try {
            rotation = issuer.rotate(OpaqueTokens.digest(matches.getFirst().getValue()), receivedAt);
        } catch (DataAccessException | TransactionException exception) {
            throw new AuthRefreshException(AuthRefreshException.Error.STORAGE);
        }
        if (rotation.rejection() != null) {
            throw new AuthRefreshException(rotation.rejection());
        }
        // 독립 트랜잭션의 커밋 성공 후에만 자격 정보를 공개한다.
        return new Result(new AuthRefreshResponse(rotation.accessToken()), cookies.issue(rotation.refreshToken()));
    }

    public record Result(AuthRefreshResponse body, String refreshCookie) {
        @Override
        public String toString() {
            return "RefreshResult[redacted]";
        }
    }
}
