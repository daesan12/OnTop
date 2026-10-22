package com.ssafy.ontop.user.service;

import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class NicknameAvailabilityServiceTests {

    private Clock clock;
    private OnboardingTokenStore onboarding;
    private AccessAuthenticationService access;
    private UserRepository users;
    private NicknameAvailabilityService service;
    private String token;

    @BeforeEach
    void setUp() {
        clock = mock(Clock.class);
        when(clock.instant()).thenReturn(Instant.parse("2026-10-22T00:00:00Z"));
        onboarding = new OnboardingTokenStore(clock);
        token = onboarding.issue(new OAuthIdentity(OAuthProvider.SSAFY, "synthetic-identity"));
        access = mock(AccessAuthenticationService.class);
        users = mock(UserRepository.class);
        var beans = new StaticListableBeanFactory();
        beans.addBean("users", users);
        service = new NicknameAvailabilityService(onboarding, access, beans.getBeanProvider(UserRepository.class));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void 온보딩_조회는_소비하지_않고_기존_중복쿼리를_사용한다(boolean taken) {
        when(users.existsByNickname("온탑고수")).thenReturn(taken);
        assertThat(service.check(request(token), "온탑고수").available()).isEqualTo(!taken);
        assertThat(service.check(request(token), "온탑고수").available()).isEqualTo(!taken);
        assertThat(onboarding.verify(token).provider()).isEqualTo(OAuthProvider.SSAFY);
        verifyNoInteractions(access);
    }

    @Test
    void 기존_회원은_검증된_ID만_중복_대상에서_제외한다() {
        when(access.authenticate("synthetic-access")).thenReturn(
                new AuthenticatedUser(42, LoginProvider.SSAFY, TestLoginSessions.ID));
        assertThat(service.check(request("synthetic-access"), "OnTop").available()).isTrue();
        verify(users).existsByNicknameAndIdNot("OnTop", 42L);
    }

    @Test
    void 반복_조회해도_최초_600초_만료를_연장하지_않는다() {
        when(clock.instant()).thenReturn(Instant.parse("2026-10-22T00:09:59Z"));
        service.check(request(token), "온탑고수");
        when(clock.instant()).thenReturn(Instant.parse("2026-10-22T00:10:00Z"));
        assertThatThrownBy(() -> service.check(request(token), "온탑고수"))
                .isInstanceOf(AuthExchangeException.class);
    }

    @Test
    void 선점중인_온보딩_토큰은_조회에도_사용하지_못한다() {
        onboarding.claim(token);
        assertThatThrownBy(() -> service.check(request(token), "온탑고수"))
                .isInstanceOf(AuthExchangeException.class);
        verifyNoInteractions(users);
    }

    @Test
    void DB_연결_및_트랜잭션_장애를_503으로_처리한다() {
        when(users.existsByNickname("온탑고수"))
                .thenThrow(new DataAccessResourceFailureException("private-detail"))
                .thenThrow(new TransactionSystemException("private-detail"));
        for (int attempt = 0; attempt < 2; attempt++) {
            assertThatThrownBy(() -> service.check(request(token), "온탑고수"))
                    .isInstanceOfSatisfying(RestAuthenticationException.class,
                            error -> assertThat(error.error()).isEqualTo(RestAuthenticationException.Error.STORAGE));
        }
        assertThat(onboarding.verify(token)).isNotNull();
    }

    @Test
    void DB없는_기본_프로필에서는_503이다() {
        service = new NicknameAvailabilityService(onboarding, access,
                new StaticListableBeanFactory().getBeanProvider(UserRepository.class));
        assertThatThrownBy(() -> service.check(request(token), "온탑고수"))
                .isInstanceOfSatisfying(RestAuthenticationException.class,
                        error -> assertThat(error.error()).isEqualTo(RestAuthenticationException.Error.STORAGE));
    }

    private MockHttpServletRequest request(String bearer) {
        var request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + bearer);
        return request;
    }
}
