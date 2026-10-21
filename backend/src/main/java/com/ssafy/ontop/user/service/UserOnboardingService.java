package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.auth.service.RefreshCookieService;
import com.ssafy.ontop.user.dto.UserOnboardingRequest;
import com.ssafy.ontop.user.dto.UserOnboardingResponse;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class UserOnboardingService {

    private final OnboardingTokenStore tokens;
    private final ObjectProvider<UserOnboardingPersistenceService> persistence;
    private final RefreshCookieService cookies;

    public UserOnboardingService(OnboardingTokenStore tokens,
            ObjectProvider<UserOnboardingPersistenceService> persistence, RefreshCookieService cookies) {
        this.tokens = tokens;
        this.persistence = persistence;
        this.cookies = cookies;
    }

    public Result onboard(HttpServletRequest request, UserOnboardingRequest input) {
        List<String> headers = Collections.list(request.getHeaders(HttpHeaders.AUTHORIZATION));
        if (headers.size() != 1 || !headers.getFirst().regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new AuthExchangeException(AuthExchangeException.Error.INVALID_ONBOARDING);
        }
        OnboardingTokenStore.Claim claim = tokens.claim(headers.getFirst().substring(7));
        boolean retryable = false;
        UserOnboardingPersistenceService.TransactionOutcome outcome =
                new UserOnboardingPersistenceService.TransactionOutcome();
        try {
            Result result = create(claim.identity(), input, outcome);
            tokens.complete(claim);
            return result;
        } catch (UserOnboardingException exception) {
            if (exception.error() == UserOnboardingException.Error.NICKNAME_TAKEN) {
                if (!outcome.rolledBack()) {
                    throw new UserOnboardingException(UserOnboardingException.Error.STORAGE);
                }
                tokens.releaseNicknameConflict(claim);
                retryable = true;
            }
            throw exception;
        } finally {
            if (!retryable) {
                tokens.invalidate(claim);
            }
        }
    }

    private Result create(OAuthIdentity identity, UserOnboardingRequest input,
            UserOnboardingPersistenceService.TransactionOutcome outcome) {
        UserOnboardingPersistenceService creator = persistence.getIfAvailable();
        if (creator == null) {
            throw new UserOnboardingException(UserOnboardingException.Error.STORAGE);
        }
        cookies.validate();
        UserOnboardingPersistenceService.CreatedMember created;
        try {
            created = creator.create(identity, input, outcome);
        } catch (DataIntegrityViolationException exception) {
            // 커밋 단계의 무결성 예외도 가능하다. 롤백 완료가 확인되지 않으면 재시도하지 않는다.
            if (!outcome.rolledBack()) {
                throw new UserOnboardingException(UserOnboardingException.Error.STORAGE);
            }
            UserOnboardingException.Error error;
            try {
                error = creator.conflict(identity, input.nickname());
            } catch (DataAccessException | TransactionException unavailable) {
                throw new UserOnboardingException(UserOnboardingException.Error.STORAGE);
            }
            throw new UserOnboardingException(error);
        } catch (DataAccessException | TransactionException exception) {
            throw new UserOnboardingException(UserOnboardingException.Error.STORAGE);
        }
        if (!outcome.committed()) {
            throw new UserOnboardingException(UserOnboardingException.Error.STORAGE);
        }
        // DB 커밋 후에만 응답 자격 정보를 공개한다. 전송 실패가 DB 가입을 되돌리지는 않는다.
        return new Result(created.body(), cookies.issue(created.refreshToken()));
    }

    public record Result(UserOnboardingResponse body, String refreshCookie) {
        @Override
        public String toString() {
            return "OnboardingResult[redacted]";
        }
    }
}
