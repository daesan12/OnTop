package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.dto.UserOnboardingRequest;
import com.ssafy.ontop.user.dto.UserOnboardingResponse;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import com.ssafy.ontop.user.repository.UserRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
public class UserOnboardingPersistenceService {

    private final UserRepository users;
    private final AuthExchangePersistenceService credentials;

    public UserOnboardingPersistenceService(UserRepository users, AuthExchangePersistenceService credentials) {
        this.users = users;
        this.credentials = credentials;
    }

    @Transactional
    public CreatedMember create(OAuthIdentity identity, UserOnboardingRequest input) {
        if (users.findByLoginProviderAndProviderUserId(identity.provider().loginProvider(),
                identity.providerUserId()).isPresent()) {
            throw new UserOnboardingException(UserOnboardingException.Error.ALREADY_REGISTERED);
        }
        if (users.existsByNickname(input.nickname())) {
            throw new UserOnboardingException(UserOnboardingException.Error.NICKNAME_TAKEN);
        }
        // 없는 행의 잠금에 의존하지 않는다. 경합의 최종 판정은 두 DB UNIQUE가 담당한다.
        User user = users.saveAndFlush(new User(identity.provider().loginProvider(), identity.providerUserId(),
                input.nickname(), input.characterGender()));
        AuthExchangePersistenceService.Credentials issued = credentials.issueForNewUser(user);
        return new CreatedMember(new UserOnboardingResponse(user.getId(), user.getNickname(),
                user.getCharacterGender(), issued.accessToken()), issued.refreshToken());
    }

    // 실패한 트랜잭션이 롤백된 뒤 새 트랜잭션으로 중복 원인을 재확인한다. SQL 예외 원문을 해석하지 않는다.
    @Transactional(readOnly = true)
    public UserOnboardingException.Error conflict(OAuthIdentity identity, String nickname) {
        if (users.findByLoginProviderAndProviderUserId(identity.provider().loginProvider(),
                identity.providerUserId()).isPresent()) {
            return UserOnboardingException.Error.ALREADY_REGISTERED;
        }
        if (users.existsByNickname(nickname)) {
            return UserOnboardingException.Error.NICKNAME_TAKEN;
        }
        return UserOnboardingException.Error.STORAGE;
    }

    public record CreatedMember(UserOnboardingResponse body, String refreshToken) {
        @Override
        public String toString() {
            return "CreatedMember[redacted]";
        }
    }
}
