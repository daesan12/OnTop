package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.service.MemberConnectionTermination;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class UserWithdrawalPersistenceServiceTests {

    private static final Instant NOW = Instant.parse("2026-10-24T00:00:00.123456Z");
    private UserRepository users;
    private RefreshTokenRepository tokens;
    private MemberConnectionTermination termination;
    private UserWithdrawalPersistenceService service;
    private User user;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        tokens = mock(RefreshTokenRepository.class);
        termination = mock(MemberConnectionTermination.class);
        service = new UserWithdrawalPersistenceService(users, tokens, termination, Clock.fixed(NOW, ZoneOffset.UTC));
        user = new User(LoginProvider.SSAFY, "synthetic-social", "온탑회원", CharacterGender.FEMALE);
        ReflectionTestUtils.setField(user, "id", 42L);
        when(users.findForAuthenticationById(42L)).thenReturn(Optional.of(user));
    }

    @Test
    void 회원잠금_탈퇴시각_전체계열폐기_회원종료알림의_순서를_유지한다() {
        service.withdraw(42);
        var order = inOrder(users, tokens, termination);
        order.verify(users).findForAuthenticationById(42L);
        order.verify(tokens).revokeAllForUser(42L, Instant.parse("2026-10-24T00:00:00.123Z"));
        order.verify(termination).memberDeactivated(42);
        assertThat(user.getDeletedAt()).isEqualTo(Instant.parse("2026-10-24T00:00:00.123Z"));
        assertThat(user.getNickname()).isEqualTo("온탑회원");
        assertThat(user.getProviderUserId()).isEqualTo("synthetic-social");
        assertThat(user.getCharacterGender()).isEqualTo(CharacterGender.FEMALE);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void 회원이_없거나_이미_탈퇴했다면_401이며_폐기_알림을_발행하지_않는다(boolean absent) {
        user.deactivate(NOW.minusSeconds(60));
        when(users.findForAuthenticationById(42L)).thenReturn(absent ? Optional.empty() : Optional.of(user));
        assertThatThrownBy(() -> service.withdraw(42)).isInstanceOf(RestAuthenticationException.class);
        verifyNoInteractions(tokens, termination);
    }

    @Test
    void 전체폐기가_실패하면_회원종료_알림을_발행하지_않는다() {
        doThrow(new DataAccessResourceFailureException("private-db"))
                .when(tokens).revokeAllForUser(eq(42L), any());
        assertThatThrownBy(() -> service.withdraw(42)).isInstanceOf(DataAccessResourceFailureException.class);
        verifyNoInteractions(termination);
    }

    @Test
    void 도메인_중복호출로_최초_탈퇴시각을_연장하지_않는다() {
        user.deactivate(NOW);
        user.deactivate(NOW.plusSeconds(60));
        assertThat(user.getDeletedAt()).isEqualTo(Instant.parse("2026-10-24T00:00:00.123Z"));
    }
}
