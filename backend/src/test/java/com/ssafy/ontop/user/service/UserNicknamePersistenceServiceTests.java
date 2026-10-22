package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserNicknamePersistenceServiceTests {

    private UserRepository users;
    private UserNicknamePersistenceService service;
    private User user;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        service = new UserNicknamePersistenceService(users);
        user = new User(LoginProvider.SSAFY, "synthetic-social", "OnTop", CharacterGender.FEMALE);
        ReflectionTestUtils.setField(user, "id", 42L);
        when(users.findForAuthenticationById(42L)).thenReturn(Optional.of(user));
    }

    @ParameterizedTest
    @ValueSource(strings = {"온탑고수", "ontop"})
    void 검증된_회원의_닉네임만_바꾸고_flush한다(String nickname) {
        var result = service.update(42, nickname);
        assertThat(result.userId()).isEqualTo(42);
        assertThat(result.nickname()).isEqualTo(nickname);
        assertThat(result.characterGender()).isEqualTo(CharacterGender.FEMALE);
        assertThat(user.getLoginProvider()).isEqualTo(LoginProvider.SSAFY);
        assertThat(user.getProviderUserId()).isEqualTo("synthetic-social");
        assertThat(user.getDeletedAt()).isNull();
        verify(users).existsByNicknameAndIdNot(nickname, 42L);
        verify(users).flush();
    }

    @Test
    void 동일_문자열은_추가_갱신없이_성공한다() {
        assertThat(service.update(42, "OnTop").nickname()).isEqualTo("OnTop");
        verify(users, never()).flush();
    }

    @Test
    void 다른회원의_닉네임은_변경전에_409이다() {
        when(users.existsByNicknameAndIdNot("다른회원", 42L)).thenReturn(true);
        assertThatThrownBy(() -> service.update(42, "다른회원")).isInstanceOfSatisfying(UserOnboardingException.class,
                error -> assertThat(error.error()).isEqualTo(UserOnboardingException.Error.NICKNAME_TAKEN));
        assertThat(user.getNickname()).isEqualTo("OnTop");
        verify(users, never()).flush();
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void 잠금_시점에_회원이_없거나_탈퇴했다면_401이다(boolean absent) {
        ReflectionTestUtils.setField(user, "deletedAt", Instant.now());
        when(users.findForAuthenticationById(42L)).thenReturn(absent ? Optional.empty() : Optional.of(user));
        assertThatThrownBy(() -> service.update(42, "온탑고수")).isInstanceOfSatisfying(
                RestAuthenticationException.class,
                error -> assertThat(error.error()).isEqualTo(RestAuthenticationException.Error.MEMBER_CHANGED));
        verify(users, never()).flush();
    }
}
