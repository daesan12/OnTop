package com.ssafy.ontop.auth.service;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class AuthenticationRevocations implements MemberConnectionTermination {
    private final ApplicationEventPublisher events;

    public AuthenticationRevocations(ApplicationEventPublisher events) {
        this.events = events;
    }

    public void sessionRevoked(long userId, String sessionId) {
        sessionRevoked(userId, sessionId, Reason.SESSION_REVOKED);
    }

    public void sessionRevoked(long userId, String sessionId, Reason reason) {
        if (sessionId == null) {
            throw new IllegalArgumentException("단일 로그인 계열의 폐기에는 세션 식별자가 필요합니다.");
        }
        publish(new Revoked(userId, sessionId, reason));
    }

    @Override
    public void memberDeactivated(long userId) {
        publish(new Revoked(userId, null, Reason.MEMBER_DEACTIVATED));
    }

    private void publish(Revoked event) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("인증 폐기 알림은 상태 변경 트랜잭션 안에서 발행해야 합니다.");
        }
        events.publishEvent(event);
    }

    /** 폐기 이유. 연결 종료 처리는 sessionId만 보며, 행동 로그가 로그아웃과 탈퇴를 구분하는 데 쓴다. */
    public enum Reason {
        LOGOUT,
        /** Refresh 재사용 탐지·탈퇴 회원 토큰 등 보안상 폐기 */
        SESSION_REVOKED,
        MEMBER_DEACTIVATED
    }

    public record Revoked(long userId, String sessionId, Reason reason) {
        /** 기존 사용처 호환용. sessionId가 없으면 회원 전체 폐기다. */
        public Revoked(long userId, String sessionId) {
            this(userId, sessionId, sessionId == null ? Reason.MEMBER_DEACTIVATED : Reason.SESSION_REVOKED);
        }

        @Override
        public String toString() {
            return "AuthenticationRevoked[redacted]";
        }
    }
}
