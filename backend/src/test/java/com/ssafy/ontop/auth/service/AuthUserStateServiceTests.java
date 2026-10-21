package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthUserStateServiceTests {

    @Test
    void 미래_탈퇴시각은_회원_조회_후_DB_오류로_처리하고_변경하지_않는다() {
        Instant now = Instant.parse("2026-10-21T00:00:00Z");
        User user = new User(LoginProvider.SSAFY, "verified-id", "시각검증", CharacterGender.MALE);
        ReflectionTestUtils.setField(user, "id", 1L);
        ReflectionTestUtils.setField(user, "deletedAt", now.plusSeconds(1));
        UserRepository users = mock(UserRepository.class);
        when(users.findForLogin(LoginProvider.SSAFY, "verified-id")).thenReturn(Optional.of(user));
        AuthUserStateService service = new AuthUserStateService(users, Clock.fixed(now, ZoneOffset.UTC));

        assertThatThrownBy(() -> service.resolve(new OAuthIdentity(OAuthProvider.SSAFY, "verified-id")))
                .isInstanceOfSatisfying(AuthCallbackException.class, exception ->
                        assertThat(exception.error()).isEqualTo(AuthCallbackException.Error.DATABASE_UNAVAILABLE));

        assertThat(user.getDeletedAt()).isEqualTo(now.plusSeconds(1));
    }

    @ParameterizedTest
    @ValueSource(longs = {-1, 0, 1})
    void 정확히_7일까지_복구하며_1밀리초_초과부터_보류한다(long extraMillis) {
        Instant now = Instant.parse("2026-10-21T00:00:00Z");
        User user = new User(LoginProvider.SSAFY, "verified-id", "경계검증", CharacterGender.MALE);
        ReflectionTestUtils.setField(user, "id", 1L);
        Instant deletedAt = now.minus(Duration.ofDays(7)).minusMillis(extraMillis);
        ReflectionTestUtils.setField(user, "deletedAt", deletedAt);
        UserRepository users = mock(UserRepository.class);
        when(users.findForLogin(LoginProvider.SSAFY, "verified-id")).thenReturn(Optional.of(user));
        AuthUserStateService service = new AuthUserStateService(users, Clock.fixed(now, ZoneOffset.UTC));
        OAuthIdentity identity = new OAuthIdentity(OAuthProvider.SSAFY, "verified-id");

        if (extraMillis <= 0) {
            assertThat(service.resolve(identity).status()).isEqualTo(LoginOutcome.Status.RESTORED_MEMBER);
            assertThat(user.getDeletedAt()).isNull();
        } else {
            assertThatThrownBy(() -> service.resolve(identity)).isInstanceOfSatisfying(AuthCallbackException.class,
                    exception -> assertThat(exception.error()).isEqualTo(AuthCallbackException.Error.REJOIN_PENDING));
            assertThat(user.getDeletedAt()).isEqualTo(deletedAt);
        }
    }
}
