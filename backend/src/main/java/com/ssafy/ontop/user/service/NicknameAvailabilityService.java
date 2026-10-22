package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.StrictBearerTokenResolver;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.user.dto.NicknameAvailabilityResponse;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.user.validation.NicknameValidator;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class NicknameAvailabilityService {

    private final OnboardingTokenStore onboarding;
    private final AccessAuthenticationService access;
    private final ObjectProvider<UserRepository> users;
    private final StrictBearerTokenResolver bearer = new StrictBearerTokenResolver();

    public NicknameAvailabilityService(OnboardingTokenStore onboarding, AccessAuthenticationService access,
            ObjectProvider<UserRepository> users) {
        this.onboarding = onboarding;
        this.access = access;
        this.users = users;
    }

    public NicknameAvailabilityResponse check(HttpServletRequest request, String nickname) {
        Long userId = authenticate(request);
        NicknameValidator.validate(nickname);
        UserRepository repository = users.getIfAvailable();
        if (repository == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.STORAGE);
        }
        try {
            // DB 컬럼 collation/UNIQUE와 같은 비교를 사용하며 탈퇴 회원도 중복에 포함한다.
            boolean taken = userId == null ? repository.existsByNickname(nickname)
                    : repository.existsByNicknameAndIdNot(nickname, userId);
            return new NicknameAvailabilityResponse(nickname, !taken);
        } catch (DataAccessException | TransactionException exception) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.STORAGE);
        }
    }

    private Long authenticate(HttpServletRequest request) {
        String token;
        try {
            token = bearer.resolve(request);
        } catch (OAuth2AuthenticationException exception) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.INVALID);
        }
        if (token == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        if (token.startsWith("ob_")) {
            // 조회는 선점/소비/만료 연장을 하지 않는다. 일반 회원 Authentication도 만들지 않는다.
            onboarding.verify(token);
            return null;
        }
        // 형식만으로 인증하지 않는다. 기존 서명·용도·만료·활성 회원/로그인 세션 검증을 모두 수행한다.
        return access.authenticate(token).userId();
    }
}
