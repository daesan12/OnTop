package com.ssafy.ontop.user.service;

import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.dto.UserNicknameUpdateRequest;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.user.exception.UserNicknameUpdateException;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserNicknameUpdateServiceTests {

    private UserNicknamePersistenceService persistence;
    private UserNicknameUpdateService service;
    private final UserNicknameUpdateRequest input = new UserNicknameUpdateRequest("온탑고수");

    @BeforeEach
    void setUp() {
        persistence = mock(UserNicknamePersistenceService.class);
        var beans = new StaticListableBeanFactory();
        beans.addBean("persistence", persistence);
        service = new UserNicknameUpdateService(beans.getBeanProvider(UserNicknamePersistenceService.class));
    }

    @Test
    void 커밋된_프로필을_그대로_반환한다() {
        var expected = new UserProfileResponse(42, input.nickname(), CharacterGender.FEMALE);
        when(persistence.update(42, input.nickname())).thenReturn(expected);
        assertThat(service.update(42, input)).isEqualTo(expected);
    }

    @Test
    void UNIQUE_예외후_다른회원_중복이_확인되면_409이다() {
        when(persistence.update(42, input.nickname())).thenThrow(new DataIntegrityViolationException("private-sql"));
        when(persistence.nicknameTaken(42, input.nickname())).thenReturn(true);
        assertThatThrownBy(() -> service.update(42, input)).isInstanceOfSatisfying(UserOnboardingException.class,
                error -> assertThat(error.error()).isEqualTo(UserOnboardingException.Error.NICKNAME_TAKEN));
    }

    @Test
    void 다른_무결성_예외를_닉네임_중복이라고_오인하지_않는다() {
        when(persistence.update(42, input.nickname())).thenThrow(new DataIntegrityViolationException("private-sql"));
        unavailable();
    }

    @Test
    void 중복_재조회_DB_장애도_503이다() {
        when(persistence.update(42, input.nickname())).thenThrow(new DataIntegrityViolationException("private-sql"));
        when(persistence.nicknameTaken(42, input.nickname()))
                .thenThrow(new DataAccessResourceFailureException("private-db"));
        unavailable();
    }

    @Test
    void DB와_커밋_장애는_성공으로_응답하지_않는다() {
        when(persistence.update(42, input.nickname()))
                .thenThrow(new DataAccessResourceFailureException("private-db"))
                .thenThrow(new TransactionSystemException("private-commit"));
        unavailable();
        unavailable();
    }

    @Test
    void DB없는_기본_프로필은_유지하고_수정은_503이다() {
        service = new UserNicknameUpdateService(
                new StaticListableBeanFactory().getBeanProvider(UserNicknamePersistenceService.class));
        unavailable();
    }

    private void unavailable() {
        assertThatThrownBy(() -> service.update(42, input)).isInstanceOfSatisfying(UserNicknameUpdateException.class,
                error -> {
                    assertThat(error.error()).isEqualTo(UserNicknameUpdateException.Error.STORAGE);
                    assertThat(error.getMessage()).doesNotContain("private-");
                });
    }
}
