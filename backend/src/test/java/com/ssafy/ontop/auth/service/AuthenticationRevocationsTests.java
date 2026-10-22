package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class AuthenticationRevocationsTests {
    @Test
    void 단일세션_폐기의_null은_회원전체_종료로_확대하지_않는다() {
        var events = mock(ApplicationEventPublisher.class);
        assertThatThrownBy(() -> new AuthenticationRevocations(events).sessionRevoked(101, null))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(events);
    }

    @Test
    void 트랜잭션없는_호출은_폐기_성공이나_연결종료를_가장하지_않는다() {
        var events = mock(ApplicationEventPublisher.class);
        var publisher = new AuthenticationRevocations(events);
        assertThatThrownBy(() -> publisher.memberDeactivated(101)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> publisher.sessionRevoked(101, TestLoginSessions.ID))
                .isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(events);
    }

    @Test
    void 변경트랜잭션의_알림에는_토큰없이_회원과_로그인계열만_연결한다() {
        var events = mock(ApplicationEventPublisher.class);
        var publisher = new AuthenticationRevocations(events);
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            publisher.memberDeactivated(101);
            publisher.sessionRevoked(101, TestLoginSessions.ID);
        } finally {
            TransactionSynchronizationManager.setActualTransactionActive(false);
        }
        verify(events).publishEvent(new AuthenticationRevocations.Revoked(101, null));
        verify(events).publishEvent(new AuthenticationRevocations.Revoked(101, TestLoginSessions.ID));
        assertThat(new AuthenticationRevocations.Revoked(101, TestLoginSessions.ID).toString())
                .isEqualTo("AuthenticationRevoked[redacted]");
    }
}
