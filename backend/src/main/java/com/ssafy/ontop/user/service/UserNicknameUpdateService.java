package com.ssafy.ontop.user.service;

import com.ssafy.ontop.user.dto.UserNicknameUpdateRequest;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.user.exception.UserNicknameUpdateException;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class UserNicknameUpdateService {

    private final ObjectProvider<UserNicknamePersistenceService> persistence;

    public UserNicknameUpdateService(ObjectProvider<UserNicknamePersistenceService> persistence) {
        this.persistence = persistence;
    }

    public UserProfileResponse update(long userId, UserNicknameUpdateRequest input) {
        UserNicknamePersistenceService updater = persistence.getIfAvailable();
        if (updater == null) {
            throw unavailable();
        }
        try {
            // 별도 Bean의 REQUIRES_NEW 프록시가 커밋까지 완료한 이후에만 성공 응답을 만든다.
            return updater.update(userId, input.nickname());
        } catch (DataIntegrityViolationException exception) {
            boolean taken;
            try {
                taken = updater.nicknameTaken(userId, input.nickname());
            } catch (DataAccessException | TransactionException lookupFailure) {
                throw unavailable();
            }
            if (taken) {
                throw new UserOnboardingException(UserOnboardingException.Error.NICKNAME_TAKEN);
            }
            throw unavailable();
        } catch (DataAccessException | TransactionException exception) {
            throw unavailable();
        }
    }

    private UserNicknameUpdateException unavailable() {
        return new UserNicknameUpdateException(UserNicknameUpdateException.Error.STORAGE);
    }
}
