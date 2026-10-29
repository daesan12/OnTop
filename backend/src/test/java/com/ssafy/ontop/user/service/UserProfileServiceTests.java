package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class UserProfileServiceTests {

    private UserRepository users;
    private UserProfileService service;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        var beans = new StaticListableBeanFactory();
        beans.addBean("users", users);
        service = new UserProfileService(beans.getBeanProvider(UserRepository.class));
    }

    @Test
    void 활성_회원의_프로필만_조회하고_저장하지_않는다() {
        User user = member();
        when(users.findById(42L)).thenReturn(Optional.of(user));

        assertThat(service.findProfile(42L)).isEqualTo(new UserProfileResponse(42, "미지", CharacterGender.FEMALE));
        verify(users).findById(42L);
        verifyNoMoreInteractions(users);
    }

    @Test
    void 없는_회원은_인증_상태_변경으로_거절한다() {
        when(users.findById(42L)).thenReturn(Optional.empty());
        fails(RestAuthenticationException.Error.MEMBER_CHANGED);
    }

    @Test
    void 인증_이후_탈퇴한_회원도_거절한다() {
        User user = member();
        ReflectionTestUtils.setField(user, "deletedAt", Instant.now());
        when(users.findById(42L)).thenReturn(Optional.of(user));
        fails(RestAuthenticationException.Error.MEMBER_CHANGED);
    }

    @Test
    void DB가_없는_기본_프로필도_구성할_수_있고_조회는_503이다() {
        service = new UserProfileService(new StaticListableBeanFactory().getBeanProvider(UserRepository.class));
        fails(RestAuthenticationException.Error.STORAGE);
    }

    @Test
    void DB_오류_원문을_노출하지_않는다() {
        when(users.findById(42L)).thenThrow(new DataAccessResourceFailureException("private-db-detail"));
        fails(RestAuthenticationException.Error.STORAGE);
    }

    @Test
    void 읽기_트랜잭션_장애도_503으로_처리한다() {
        when(users.findById(42L)).thenThrow(new TransactionSystemException("private-transaction-detail"));
        fails(RestAuthenticationException.Error.STORAGE);
    }

    private void fails(RestAuthenticationException.Error expected) {
        assertThatThrownBy(() -> service.findProfile(42L)).isInstanceOfSatisfying(
                RestAuthenticationException.class, failure -> {
                    assertThat(failure.error()).isEqualTo(expected);
                    assertThat(failure.getMessage()).doesNotContain("private-");
                });
    }

    private User member() {
        User user = new User(LoginProvider.SSAFY, "private-social-fixture", "미지", CharacterGender.FEMALE);
        ReflectionTestUtils.setField(user, "id", 42L);
        return user;
    }
}
