package com.ssafy.ontop.auth.security;

import com.ssafy.ontop.user.domain.LoginProvider;
import java.security.Principal;
import java.util.Objects;

public record AuthenticatedUser(long userId, LoginProvider loginProvider) implements Principal {

    public AuthenticatedUser {
        if (userId <= 0) {
            throw new IllegalArgumentException("내부 사용자 ID는 양수여야 합니다.");
        }
        Objects.requireNonNull(loginProvider);
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
