package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import com.ssafy.ontop.user.repository.UserRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
public class UserNicknamePersistenceService {

    private final UserRepository users;

    public UserNicknamePersistenceService(UserRepository users) {
        this.users = users;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public UserProfileResponse update(long userId, String nickname) {
        // 기존 로그아웃/Rotation과 같은 회원 행 잠금 순서를 유지한다. Refresh 행은 변경하지 않는다.
        var user = users.findForAuthenticationById(userId)
                .filter(member -> member.getDeletedAt() == null)
                .orElseThrow(() -> new RestAuthenticationException(RestAuthenticationException.Error.MEMBER_CHANGED));
        if (users.existsByNicknameAndIdNot(nickname, userId)) {
            throw new UserOnboardingException(UserOnboardingException.Error.NICKNAME_TAKEN);
        }
        if (!user.getNickname().equals(nickname)) {
            user.changeNickname(nickname);
            // 사전 확인과 실제 쓰기 사이의 UNIQUE 경합을 이 요청의 트랜잭션에서 감지한다.
            users.flush();
        }
        return new UserProfileResponse(user.getId(), user.getNickname(), user.getCharacterGender());
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public boolean nicknameTaken(long userId, String nickname) {
        // 실패한 쓰기 트랜잭션 밖에서 확인한다. DB 예외 원문/제약 이름을 파싱하지 않는다.
        return users.existsByNicknameAndIdNot(nickname, userId);
    }
}
