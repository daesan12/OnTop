package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.exception.AuthRefreshException;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AuthRefreshPersistenceServiceTests {

    private static final Instant START = Instant.parse("2026-10-21T00:00:00Z");
    private static final String HASH = "a".repeat(64);
    private RefreshTokenRepository tokens;
    private UserRepository users;
    private AuthExchangePersistenceService credentials;
    private Clock clock;
    private AuthRefreshPersistenceService service;
    private AuthenticationRevocations revocations;
    private RefreshToken previous;
    private RefreshTokenRepository.TokenReference reference;
    private User user;

    @BeforeEach
    void setUp() {
        tokens = mock(RefreshTokenRepository.class);
        users = mock(UserRepository.class);
        credentials = mock(AuthExchangePersistenceService.class);
        clock = mock(Clock.class);
        when(clock.instant()).thenReturn(START.plusSeconds(60));
        user = new User(LoginProvider.SSAFY, "fixture-private", "재발급검증", CharacterGender.MALE);
        ReflectionTestUtils.setField(user, "id", 42L);
        previous = new RefreshToken(user, UUID.randomUUID().toString(), HASH, START, START.plusSeconds(604800));
        reference = mock(RefreshTokenRepository.TokenReference.class);
        when(reference.getUserId()).thenReturn(42L);
        when(tokens.findReferenceByTokenHash(HASH)).thenReturn(Optional.of(reference));
        when(users.findForAuthenticationById(42L)).thenReturn(Optional.of(user));
        when(tokens.findForUpdateByHash(HASH)).thenReturn(Optional.of(previous));
        when(credentials.issueForSession(user, previous.getSessionId()))
                .thenReturn(new AuthExchangePersistenceService.Credentials("fixture-access", "fixture-refresh"));
        revocations = mock(AuthenticationRevocations.class);
        service = new AuthRefreshPersistenceService(tokens, users, credentials, clock, revocations);
    }

    @Test
    void 회원을_먼저_잠근_후_이전_토큰을_회전하고_같은_세션으로_발급한다() {
        var result = service.rotate(HASH, START.plusSeconds(60));
        assertThat(result.rejection()).isNull();
        assertThat(previous.getRevokedAt()).isEqualTo(START.plusSeconds(60));
        assertThat(previous.getRotatedAt()).isEqualTo(previous.getRevokedAt());
        var order = inOrder(tokens, users, credentials);
        order.verify(tokens).findReferenceByTokenHash(HASH);
        order.verify(users).findForAuthenticationById(42L);
        order.verify(tokens).findForUpdateByHash(HASH);
        order.verify(credentials).issueForSession(user, previous.getSessionId());
        assertThat(result.toString()).doesNotContain("fixture-access", "fixture-refresh");
        verifyNoInteractions(revocations);
    }

    @ParameterizedTest
    @ValueSource(longs = {0, 4, 5, 6, 600})
    void 회전시각_기준_5초까지는_거절만하고_그_이후_재사용은_세션을_폐기한다(long delay) {
        Instant rotated = START.plusSeconds(10);
        previous.rotate(rotated);
        when(reference.getRotatedAt()).thenReturn(rotated);

        var result = service.rotate(HASH, rotated.plusSeconds(delay));

        assertThat(result.rejection()).isEqualTo(delay <= 5 ? AuthRefreshException.Error.ALREADY_ROTATED
                : AuthRefreshException.Error.REUSE_DETECTED);
        verifyNoInteractions(credentials);
        if (delay > 5) {
            verify(tokens).revokeSession(42L, previous.getSessionId(), START.plusSeconds(60));
            verify(revocations).sessionRevoked(42L, previous.getSessionId(),
                    AuthenticationRevocations.Reason.REFRESH_REUSE_DETECTED);
        } else {
            verify(tokens, never()).revokeSession(any(), any(), any());
            verifyNoInteractions(revocations);
        }
    }

    @Test
    void 잠금_전에는_미회전이었던_요청은_긴_잠금_대기후에도_동시요청으로_거절만한다() {
        previous.rotate(START.plusSeconds(10));
        // reference는 회전 커밋 전 스냅샷이다. 잠금 조회는 이후 커밋된 회전 이력을 본다.
        when(reference.getRotatedAt()).thenReturn(null);
        var result = service.rotate(HASH, START.plusSeconds(60));
        assertThat(result.rejection()).isEqualTo(AuthRefreshException.Error.ALREADY_ROTATED);
        verify(tokens, never()).revokeSession(any(), any(), any());
        verifyNoInteractions(credentials, revocations);
    }

    @ParameterizedTest
    @ValueSource(strings = {"expired", "revoked", "future"})
    void 만료와_일반폐기와_미래발급_토큰은_인증하지_않는다(String kind) {
        if (kind.equals("expired")) {
            when(clock.instant()).thenReturn(START.plusSeconds(604800));
        } else if (kind.equals("revoked")) {
            previous.revoke(START.plusSeconds(10));
        } else {
            when(clock.instant()).thenReturn(START.minusSeconds(1));
        }
        assertThat(service.rotate(HASH, clock.instant()).rejection())
                .isEqualTo(AuthRefreshException.Error.INVALID_TOKEN);
        verifyNoInteractions(credentials);
        verify(tokens, never()).revokeSession(any(), any(), any());
        verifyNoInteractions(revocations);
    }

    @Test
    void 탈퇴_회원은_해당_세션을_폐기하고_발급하지_않는다() {
        ReflectionTestUtils.setField(user, "deletedAt", START);
        assertThat(service.rotate(HASH, START).rejection()).isEqualTo(AuthRefreshException.Error.MEMBER_CHANGED);
        verify(tokens).revokeSession(42L, previous.getSessionId(), START.plusSeconds(60));
        verify(revocations).sessionRevoked(42L, previous.getSessionId());
        verifyNoInteractions(credentials);
    }

    @Test
    void 알수없는_해시나_회원이_없으면_발급하지_않는다() {
        when(tokens.findReferenceByTokenHash(HASH)).thenReturn(Optional.empty());
        assertThat(service.rotate(HASH, START).rejection()).isEqualTo(AuthRefreshException.Error.INVALID_TOKEN);
        verifyNoInteractions(users, credentials);
        when(tokens.findReferenceByTokenHash(HASH)).thenReturn(Optional.of(reference));
        when(users.findForAuthenticationById(42L)).thenReturn(Optional.empty());
        assertThat(service.rotate(HASH, START).rejection()).isEqualTo(AuthRefreshException.Error.INVALID_TOKEN);
        verifyNoInteractions(credentials);
    }
}
