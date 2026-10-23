package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.user.exception.UserWithdrawalException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class UserWithdrawalServiceTests {

    private UserWithdrawalPersistenceService persistence;
    private UserWithdrawalService service;

    @BeforeEach
    void setUp() {
        persistence = mock(UserWithdrawalPersistenceService.class);
        var beans = new StaticListableBeanFactory();
        beans.addBean("persistence", persistence);
        service = new UserWithdrawalService(beans.getBeanProvider(UserWithdrawalPersistenceService.class));
    }

    @Test
    void 탈퇴_트랜잭션을_호출한다() {
        service.withdraw(42);
        verify(persistence).withdraw(42);
    }

    @Test
    void DB와_커밋_장애를_민감정보없는_503_예외로_변환한다() {
        doThrow(new DataAccessResourceFailureException("private-db"),
                new TransactionSystemException("private-commit")).when(persistence).withdraw(42);
        for (int attempt = 0; attempt < 2; attempt++) {
            assertThatThrownBy(() -> service.withdraw(42)).isInstanceOf(UserWithdrawalException.class)
                    .hasMessage("회원 탈퇴를 완료할 수 없습니다.");
        }
    }

    @Test
    void 비활성_회원의_401_정책을_유지한다() {
        doThrow(new RestAuthenticationException(RestAuthenticationException.Error.MEMBER_CHANGED))
                .when(persistence).withdraw(42);
        assertThatThrownBy(() -> service.withdraw(42)).isInstanceOf(RestAuthenticationException.class);
    }

    @Test
    void DB없는_기본_프로필도_구성할수_있고_탈퇴는_503이다() {
        service = new UserWithdrawalService(
                new StaticListableBeanFactory().getBeanProvider(UserWithdrawalPersistenceService.class));
        assertThatThrownBy(() -> service.withdraw(42)).isInstanceOf(UserWithdrawalException.class);
    }
}
