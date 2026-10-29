package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import java.util.Objects;
import java.util.UUID;

// 인증 담당이 로그인 검증과 외부 계정→내부 계정 매핑을 마친 뒤 반환하는 값이다.
public record VerifiedWebSocketUser(long userId, Provider provider, String sessionId) {

    public VerifiedWebSocketUser {
        if (userId <= 0) {
            throw new IllegalArgumentException("내부 사용자 ID는 양수여야 합니다.");
        }
        Objects.requireNonNull(provider);
        if (sessionId == null || !UUID.fromString(sessionId).toString().equals(sessionId)) {
            throw new IllegalArgumentException("로그인 세션이 유효하지 않습니다.");
        }
    }

    public enum Provider {
        NAVER, SSAFY
    }

    public static VerifiedWebSocketUser from(AuthenticatedUser user) {
        return new VerifiedWebSocketUser(user.userId(), switch (user.loginProvider()) {
            case SSAFY -> Provider.SSAFY;
            case NAVER -> Provider.NAVER;
        }, user.sessionId());
    }

    @Override
    public String toString() {
        return "VerifiedWebSocketUser[redacted]";
    }
}
