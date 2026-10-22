package com.ssafy.ontop.auth.security;

import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AccessJwtService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class AccessAuthenticationService {

    private final AccessJwtService jwt;
    private final ObjectProvider<ActiveMemberLookup> members;

    public AccessAuthenticationService(AccessJwtService jwt, ObjectProvider<ActiveMemberLookup> members) {
        this.jwt = jwt;
        this.members = members;
    }

    // 후속 WebSocket 인증도 전달 방식 합의 후 이 경계로 토큰과 현재 회원 상태를 함께 검증한다.
    public AuthenticatedUser authenticate(String token) {
        return requireActive(verifyUserId(token));
    }

    long verifyUserId(String token) {
        try {
            return jwt.verify(token);
        } catch (AuthExchangeException exception) {
            throw new RestAuthenticationException(exception.error() == AuthExchangeException.Error.CONFIGURATION
                    ? RestAuthenticationException.Error.CONFIGURATION : RestAuthenticationException.Error.INVALID);
        }
    }

    public AuthenticatedUser requireActive(long userId) {
        ActiveMemberLookup lookup = members.getIfAvailable();
        if (lookup == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.STORAGE);
        }
        try {
            return lookup.findActive(userId)
                    .orElseThrow(() -> new RestAuthenticationException(
                            RestAuthenticationException.Error.MEMBER_CHANGED));
        } catch (DataAccessException | TransactionException exception) {
            // SQL/연결 예외 원문에 포함될 수 있는 내부 정보와 자격 정보를 노출하지 않는다.
            throw new RestAuthenticationException(RestAuthenticationException.Error.STORAGE);
        }
    }
}
