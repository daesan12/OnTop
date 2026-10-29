package com.ssafy.ontop.auth.security;

import com.ssafy.ontop.user.domain.LoginProvider;
import java.security.Principal;
import java.util.Objects;
import java.util.UUID;

public record AuthenticatedUser(long userId, LoginProvider loginProvider, String sessionId) implements Principal {

    public AuthenticatedUser {
        if (userId <= 0) {
            throw new IllegalArgumentException("내부 사용자 ID는 양수여야 합니다.");
        }
        Objects.requireNonNull(loginProvider);
        if (sessionId == null || !UUID.fromString(sessionId).toString().equals(sessionId)) {
            throw new IllegalArgumentException("로그인 세션이 유효하지 않습니다.");
        }
    }

    @Override
    public String getName() {
        return Long.toString(userId);
    }

    @Override
    public String toString() {
        return "AuthenticatedUser[redacted]";
    }
}
