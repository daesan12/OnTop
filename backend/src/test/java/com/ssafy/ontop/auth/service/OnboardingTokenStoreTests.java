package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OnboardingTokenStoreTests {

    private static final Instant START = Instant.parse("2026-10-21T00:00:00Z");
    private final OAuthIdentity identity = new OAuthIdentity(OAuthProvider.SSAFY, "fixture-verified");
    private Clock clock;
    private OnboardingTokenStore store;
    private String token;

    @BeforeEach
    void setUp() {
        clock = mock(Clock.class);
        when(clock.instant()).thenReturn(START);
        store = new OnboardingTokenStore(clock, new SecureRandom(), 1);
        token = store.issue(identity);
    }

    @Test
    void 선점은_소셜_식별자를_유지하고_다른_선점을_막는다() {
        var claim = store.claim(token);
        assertThat(claim.identity()).isEqualTo(identity);
        assertInvalid();
        assertThat(claim.toString()).doesNotContain(token, identity.providerUserId());
        store.releaseNicknameConflict(claim);
        assertThat(store.verify(token)).isEqualTo(identity);
    }

    @Test
    void 여러번_선점을_해제해도_최초_만료시각은_바뀌지_않는다() {
        for (long seconds : new long[] {0, 300, 599}) {
            when(clock.instant()).thenReturn(START.plusSeconds(seconds));
            store.releaseNicknameConflict(store.claim(token));
        }
        when(clock.instant()).thenReturn(START.plusSeconds(600));
        assertInvalid();
    }

    @Test
    void 오래된_선점은_해제후의_새_선점을_완료하거나_무효화하지_못한다() {
        var first = store.claim(token);
        store.releaseNicknameConflict(first);
        var second = store.claim(token);
        store.releaseNicknameConflict(first);
        store.complete(first);
        store.invalidate(first);
        assertInvalid();
        store.releaseNicknameConflict(second);
        assertThat(store.verify(token)).isEqualTo(identity);
    }

    @Test
    void 성공_확정후에는_과거_선점_해제로_재사용할_수_없다() {
        var claim = store.claim(token);
        store.complete(claim);
        store.releaseNicknameConflict(claim);
        assertInvalid();
    }

    @Test
    void 실패로_무효화한_토큰도_재활성화할_수_없다() {
        var claim = store.claim(token);
        store.invalidate(claim);
        store.releaseNicknameConflict(claim);
        assertInvalid();
    }

    @Test
    void 처리중_만료한_선점은_해제해도_살아나지_않고_용량을_반환한다() {
        var claim = store.claim(token);
        when(clock.instant()).thenReturn(START.plusSeconds(600));
        store.removeExpired();
        String next = store.issue(identity);
        store.releaseNicknameConflict(claim);
        store.complete(claim);
        assertInvalid();
        assertThat(store.verify(next)).isEqualTo(identity);
    }

    @Test
    void 동시_선점은_하나만_성공한다() throws Exception {
        var calls = IntStream.range(0, 8).mapToObj(index -> (Callable<Boolean>) () -> {
            try {
                store.claim(token);
                return true;
            } catch (AuthExchangeException denied) {
                return false;
            }
        }).toList();
        try (var executor = Executors.newFixedThreadPool(8)) {
            int successful = 0;
            for (var result : executor.invokeAll(calls)) {
                successful += result.get() ? 1 : 0;
            }
            assertThat(successful).isEqualTo(1);
        }
    }

    private void assertInvalid() {
        assertThatThrownBy(() -> store.claim(token)).isInstanceOfSatisfying(AuthExchangeException.class,
                exception -> assertThat(exception.error()).isEqualTo(AuthExchangeException.Error.INVALID_ONBOARDING));
    }
}
