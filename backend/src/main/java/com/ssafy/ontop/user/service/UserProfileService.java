package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.user.repository.UserRepository;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class UserProfileService {

    private final ObjectProvider<UserRepository> users;

    public UserProfileService(ObjectProvider<UserRepository> users) {
        // DB 없는 기본 프로필의 실행을 유지한다. 실제 조회 시 DB가 없으면 안전하게 실패한다.
        this.users = users;
    }

    public UserProfileResponse findProfile(long userId) {
        UserRepository repository = users.getIfAvailable();
        if (repository == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.STORAGE);
        }
        try {
            // 기본 findById의 읽기 전용 트랜잭션을 사용한다. 인증 이후 탈퇴/삭제된 회원도 재확인한다.
            var user = repository.findById(userId)
                    .filter(member -> member.getDeletedAt() == null)
                    .orElseThrow(() -> new RestAuthenticationException(
                            RestAuthenticationException.Error.MEMBER_CHANGED));
            return new UserProfileResponse(user.getId(), user.getNickname(), user.getCharacterGender());
        } catch (DataAccessException | TransactionException exception) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.STORAGE);
        }
    }
}
