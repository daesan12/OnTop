package com.ssafy.ontop.auth.security;

import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AccessJwtService;
import java.time.Instant;
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

    public AuthenticatedUser authenticate(String token) {
        return authenticateAccess(token).user();
    }

    // 접속권이 Access의 남은 수명을 넘지 않도록 이미 검증한 만료 메타데이터도 함께 반환한다.
    public AuthenticatedAccess authenticateAccess(String token) {
        AccessJwtService.VerifiedAccess access = verifyAccess(token);
        return new AuthenticatedAccess(requireActive(access.userId()), access.expiresAt());
    }

    long verifyUserId(String token) {
        return verifyAccess(token).userId();
    }

    private AccessJwtService.VerifiedAccess verifyAccess(String token) {
        try {
            return jwt.verifyAccess(token);
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

    public record AuthenticatedAccess(AuthenticatedUser user, Instant expiresAt) {
        @Override
        public String toString() {
            return "AuthenticatedAccess[redacted]";
        }
    }
}
