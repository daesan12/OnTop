package com.ssafy.ontop.auth.websocket;

import java.util.Objects;

// 인증 담당이 로그인 검증과 외부 계정→내부 계정 매핑을 마친 뒤 반환하는 값이다.
public record VerifiedWebSocketUser(long userId, Provider provider) {

    public VerifiedWebSocketUser {
        if (userId <= 0) {
            throw new IllegalArgumentException("내부 사용자 ID는 양수여야 합니다.");
        }
        Objects.requireNonNull(provider);
    }

    public enum Provider {
        NAVER, SSAFY
    }
}
