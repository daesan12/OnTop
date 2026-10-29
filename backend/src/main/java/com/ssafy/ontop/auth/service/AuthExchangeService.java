package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.dto.AuthExchangeResponse;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class AuthExchangeService {

    private final OAuthExchangeStore exchanges;
    private final ObjectProvider<AuthExchangePersistenceService> persistence;
    private final OnboardingTokenStore onboarding;
    private final RefreshCookieService cookies;

    public AuthExchangeService(OAuthExchangeStore exchanges, ObjectProvider<AuthExchangePersistenceService> persistence,
            OnboardingTokenStore onboarding, RefreshCookieService cookies) {
        this.exchanges = exchanges;
        this.persistence = persistence;
        this.onboarding = onboarding;
        this.cookies = cookies;
    }

    public Result exchange(HttpServletRequest request, String code) {
        LoginOutcome outcome = exchanges.consume(request, code)
                .orElseThrow(() -> new AuthExchangeException(AuthExchangeException.Error.INVALID_CODE));
        AuthExchangePersistenceService issuer = persistence.getIfAvailable();
        if (issuer == null) {
            throw new AuthExchangeException(AuthExchangeException.Error.STORAGE);
        }
        try {
            if (outcome.status() == LoginOutcome.Status.NEW_MEMBER) {
                issuer.verifyNew(outcome);
                rotateSession(request);
                String token = onboarding.issue(new OAuthIdentity(outcome.provider(), outcome.providerUserId()));
                return new Result(new AuthExchangeResponse.Onboarding(token), null);
            }
            cookies.validate();
            AuthExchangePersistenceService.Credentials issued = issuer.issueExisting(outcome);
            rotateSession(request);
            return new Result(new AuthExchangeResponse.Authenticated(issued.accessToken()),
                    cookies.issue(issued.refreshToken()));
        } catch (DataAccessException | TransactionException exception) {
            // DB 예외 원문에는 SQL·계정 정보가 있을 수 있어 원인을 반사하거나 로그로 출력하지 않는다.
            throw new AuthExchangeException(AuthExchangeException.Error.STORAGE);
        }
    }

    private void rotateSession(HttpServletRequest request) {
        try {
            request.changeSessionId();
        } catch (IllegalStateException exception) {
            throw new AuthExchangeException(AuthExchangeException.Error.INVALID_CODE);
        }
    }

    public record Result(AuthExchangeResponse body, String refreshCookie) {
        @Override
        public String toString() {
            return "ExchangeResult[redacted]";
        }
    }
}
