package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.exception.AuthLogoutException;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AuthLogoutPersistenceServiceTests {

    private static final Instant NOW = Instant.parse("2026-10-21T00:00:00Z");
    private static final String HASH = "a".repeat(64);
    private RefreshTokenRepository tokens;
    private UserRepository users;
    private AuthLogoutPersistenceService service;
    private AuthenticationRevocations revocations;
    private RefreshToken token;
    private User user;

    @BeforeEach
    void setUp() {
        tokens = mock(RefreshTokenRepository.class);
        users = mock(UserRepository.class);
        user = new User(LoginProvider.SSAFY, "fixture-private", "로그아웃검증", CharacterGender.MALE);
        ReflectionTestUtils.setField(user, "id", 42L);
        token = new RefreshToken(user, UUID.randomUUID().toString(), HASH, NOW.minusSeconds(60), NOW.plusSeconds(60));
        var reference = mock(RefreshTokenRepository.TokenReference.class);
        when(reference.getUserId()).thenReturn(42L);
        when(tokens.findReferenceByTokenHash(HASH)).thenReturn(Optional.of(reference));
        when(users.findForAuthenticationById(42L)).thenReturn(Optional.of(user));
        when(tokens.findForUpdateByHash(HASH)).thenReturn(Optional.of(token));
        revocations = mock(AuthenticationRevocations.class);
        service = new AuthLogoutPersistenceService(tokens, users, Clock.fixed(NOW, ZoneOffset.UTC), revocations);
    }

    @Test
    void 회원_Refresh_순서로_잠그고_식별한_세션만_폐기한다() {
        service.logout(HASH);
        var order = inOrder(tokens, users, revocations);
        order.verify(tokens).findReferenceByTokenHash(HASH);
        order.verify(users).findForAuthenticationById(42L);
        order.verify(tokens).findForUpdateByHash(HASH);
        order.verify(tokens).revokeSession(42L, token.getSessionId(), NOW);
        order.verify(revocations).sessionRevoked(42L, token.getSessionId(), AuthenticationRevocations.Reason.LOGOUT);
    }

    @ParameterizedTest
    @ValueSource(strings = {"expired", "revoked", "rotated", "withdrawn"})
    void 만료와_폐기와_회전과_탈퇴_상태도_같은_계열_폐기만_수행한다(String state) {
        if (state.equals("expired")) {
            ReflectionTestUtils.setField(token, "expiresAt", NOW.minusSeconds(1));
        } else if (state.equals("revoked")) {
            token.revoke(NOW.minusSeconds(1));
        } else if (state.equals("rotated")) {
            token.rotate(NOW.minusSeconds(1));
        } else {
            ReflectionTestUtils.setField(user, "deletedAt", NOW.minusSeconds(1));
        }
        service.logout(HASH);
        verify(tokens).revokeSession(42L, token.getSessionId(), NOW);
        verify(revocations).sessionRevoked(42L, token.getSessionId(), AuthenticationRevocations.Reason.LOGOUT);
    }

    @Test
    void 알수없는_해시는_회원_잠금이나_폐기를_하지_않는다() {
        when(tokens.findReferenceByTokenHash(HASH)).thenReturn(Optional.empty());
        service.logout(HASH);
        verifyNoInteractions(users, revocations);
        verify(tokens, never()).findForUpdateByHash(any());
        verify(tokens, never()).revokeSession(any(), any(), any());
    }

    @Test
    void 잠금_조회시_이미_제거된_행은_멱등적으로_끝낸다() {
        when(tokens.findForUpdateByHash(HASH)).thenReturn(Optional.empty());
        service.logout(HASH);
        verify(tokens, never()).revokeSession(any(), any(), any());
        verifyNoInteractions(revocations);
    }

    @Test
    void 회원이_없거나_잠금_조회_결과가_다른_회원이면_성공을_가장하지_않는다() {
        when(users.findForAuthenticationById(42L)).thenReturn(Optional.empty());
        assertStorageFailure();
        when(users.findForAuthenticationById(42L)).thenReturn(Optional.of(user));
        User other = new User(LoginProvider.NAVER, "fixture-other", "다른검증", CharacterGender.FEMALE);
        ReflectionTestUtils.setField(other, "id", 43L);
        ReflectionTestUtils.setField(token, "user", other);
        assertStorageFailure();
        verify(tokens, never()).revokeSession(any(), any(), any());
        verifyNoInteractions(revocations);
    }

    private void assertStorageFailure() {
        assertThatThrownBy(() -> service.logout(HASH)).isInstanceOfSatisfying(AuthLogoutException.class,
                exception -> assertThat(exception.error()).isEqualTo(AuthLogoutException.Error.STORAGE));
    }
}
