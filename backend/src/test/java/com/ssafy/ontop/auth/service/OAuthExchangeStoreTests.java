package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OAuthExchangeStoreTests {

    private static final Instant START = Instant.parse("2026-10-21T00:00:00Z");
    private final LoginOutcome outcome = new LoginOutcome(OAuthProvider.SSAFY, LoginOutcome.Status.NEW_MEMBER,
            null, "verified-provider-user");
    private Clock clock;
    private OAuthExchangeStore store;
    private MockHttpServletRequest request;

    @BeforeEach
    void setUp() {
        clock = mock(Clock.class);
        when(clock.instant()).thenReturn(START);
        store = new OAuthExchangeStore(clock, new SecureRandom(), 100);
        request = new MockHttpServletRequest();
        request.getSession(true);
    }

    @Test
    void 교환_코드는_256비트_난수이며_다른_값으로_발급한다() {
        HashSet<String> codes = new HashSet<>();

        for (int index = 0; index < 50; index++) {
            String code = store.issue(request, outcome);
            assertThat(code).matches("[A-Za-z0-9_-]{43}");
            codes.add(code);
        }

        assertThat(codes).hasSize(50);
    }

    @Test
    void 다른_세션은_소비할_수_없으며_원래_세션은_한_번만_소비한다() {
        String code = store.issue(request, outcome);
        MockHttpServletRequest attacker = new MockHttpServletRequest();
        attacker.getSession(true);

        assertThat(store.consume(attacker, code)).isEmpty();
        assertThat(store.consume(request, code)).contains(outcome);
        assertThat(store.consume(request, code)).isEmpty();
        assertThat(store.consume(request, "forged")).isEmpty();
    }

    @Test
    void 발급_60초_직전까지_유효하며_60초부터_만료된다() {
        String valid = store.issue(request, outcome);
        String expired = store.issue(request, outcome);
        when(clock.instant()).thenReturn(START.plusMillis(59999));
        assertThat(store.consume(request, valid)).contains(outcome);

        when(clock.instant()).thenReturn(START.plusSeconds(60));

        assertThat(store.consume(request, expired)).isEmpty();
    }

    @Test
    void 용량_초과는_거절하고_만료_정리_후_다시_발급한다() {
        store = new OAuthExchangeStore(clock, new SecureRandom(), 1);
        store.issue(request, outcome);

        assertThatThrownBy(() -> store.issue(request, outcome)).isInstanceOf(AuthCallbackException.class);
        when(clock.instant()).thenReturn(START.plusSeconds(60));
        store.removeExpired();

        assertThat(store.consume(request, store.issue(request, outcome))).contains(outcome);
    }

    @Test
    void 동시_소비에서도_정확히_한_요청만_성공한다() throws Exception {
        String code = store.issue(request, outcome);
        List<Callable<Boolean>> attempts = new ArrayList<>();
        for (int index = 0; index < 16; index++) {
            attempts.add(() -> store.consume(request, code).isPresent());
        }

        try (var executor = Executors.newFixedThreadPool(8)) {
            int successes = 0;
            for (var result : executor.invokeAll(attempts)) {
                if (result.get()) {
                    successes++;
                }
            }
            assertThat(successes).isEqualTo(1);
        }
    }

    @Test
    void 세션이_없으면_발급하지_않고_서버_종료시_모든_코드를_폐기한다() {
        String code = store.issue(request, outcome);

        assertThatThrownBy(() -> store.issue(new MockHttpServletRequest(), outcome))
                .isInstanceOf(AuthCallbackException.class);
        store.clearOnShutdown();

        assertThat(store.consume(request, code)).isEmpty();
        assertThat(outcome.toString()).doesNotContain("verified-provider-user");
    }
}
