package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.exception.AuthLogoutException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class AuthLogoutService {

    private final ObjectProvider<AuthLogoutPersistenceService> persistence;
    private final RefreshCookieService cookies;
    private final AuthExchangeOriginPolicy origins;

    public AuthLogoutService(ObjectProvider<AuthLogoutPersistenceService> persistence, RefreshCookieService cookies,
            AuthExchangeOriginPolicy origins) {
        this.persistence = persistence;
        this.cookies = cookies;
        this.origins = origins;
    }

    public String logout(HttpServletRequest request) {
        // MVC가 인코딩/경로 파라미터를 해석해도 필터 경로 비교에만 의존하지 않는다.
        if (origins.allowedOrigin(request) == null) {
            throw new AuthExchangeException(AuthExchangeException.Error.ORIGIN_DENIED);
        }
        Cookie[] incoming = request.getCookies();
        List<Cookie> matches = incoming == null ? List.of() : Arrays.stream(incoming)
                .filter(cookie -> RefreshCookieService.NAME.equals(cookie.getName())).toList();
        if (matches.size() > 1) {
            throw new AuthLogoutException(AuthLogoutException.Error.INVALID_REQUEST);
        }
        // 서버 폐기 전에 삭제 쿠키 설정을 검증/준비한다. 오류 응답은 삭제 성공을 가장하지 않는다.
        String clearCookie = cookies.clear();
        if (matches.isEmpty() || matches.getFirst().getValue() == null
                || !matches.getFirst().getValue().matches("rt_[A-Za-z0-9_-]{43}")) {
            return clearCookie;
        }
        AuthLogoutPersistenceService issuer = persistence.getIfAvailable();
        if (issuer == null) {
            throw new AuthLogoutException(AuthLogoutException.Error.STORAGE);
        }
        try {
            issuer.logout(OpaqueTokens.digest(matches.getFirst().getValue()));
        } catch (DataAccessException | TransactionException exception) {
            throw new AuthLogoutException(AuthLogoutException.Error.STORAGE);
        }
        // REQUIRES_NEW의 커밋 완료 후에만 204용 삭제 헤더를 전달한다.
        return clearCookie;
    }
}
