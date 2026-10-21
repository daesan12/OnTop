package com.ssafy.ontop.auth.domain;

public record LoginOutcome(OAuthProvider provider, Status status, Long userId, String providerUserId) {

    public enum Status {
        NEW_MEMBER, EXISTING_MEMBER, RESTORED_MEMBER
    }

    public LoginOutcome {
        if (provider == null || status == null
                || (status == Status.NEW_MEMBER && (userId != null || providerUserId == null))
                || (status != Status.NEW_MEMBER && (userId == null || userId <= 0 || providerUserId != null))) {
            throw new IllegalArgumentException("교환 코드 회원 상태가 올바르지 않습니다.");
        }
    }

    @Override
    public String toString() {
        return "LoginOutcome[redacted]";
    }
}
