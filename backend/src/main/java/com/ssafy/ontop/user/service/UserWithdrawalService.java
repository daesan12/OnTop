package com.ssafy.ontop.user.service;

import com.ssafy.ontop.user.exception.UserWithdrawalException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class UserWithdrawalService {

    private final ObjectProvider<UserWithdrawalPersistenceService> persistence;

    public UserWithdrawalService(ObjectProvider<UserWithdrawalPersistenceService> persistence) {
        this.persistence = persistence;
    }

    public void withdraw(long userId) {
        UserWithdrawalPersistenceService remover = persistence.getIfAvailable();
        if (remover == null) {
            throw new UserWithdrawalException();
        }
        try {
            // 프록시의 DB 커밋이 완료된 뒤에만 HTTP 204를 반환할 수 있다.
            remover.withdraw(userId);
        } catch (DataAccessException | TransactionException exception) {
            throw new UserWithdrawalException();
        }
    }
}
