package com.ssafy.ontop.auth.service;

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
import org.springframework.mock.web.MockHttpSession;

import static com.ssafy.ontop.auth.domain.OAuthProvider.NAVER;
import static com.ssafy.ontop.auth.domain.OAuthProvider.SSAFY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OAuthStateStoreTests {

    private static final Instant START = Instant.parse("2026-10-21T00:00:00Z");

    private Clock clock;
    private OAuthStateStore store;
    private MockHttpServletRequest request;

    @BeforeEach
    void setUp() {
        clock = mock(Clock.class);
        when(clock.instant()).thenReturn(START);
        store = new OAuthStateStore(clock, new SecureRandom());
        request = new MockHttpServletRequest();
    }

    @Test
    void 반복_발급한_state는_256비트이고_서로_다르다() {
        HashSet<String> states = new HashSet<>();

        for (int index = 0; index < 100; index++) {
            String state = store.issue(request, NAVER);
            assertThat(state).matches("[A-Za-z0-9_-]{43}");
            states.add(state);
        }

        assertThat(states).hasSize(100);
    }

    @Test
    void 같은_세션의_여러_탭은_각각_한_번씩_소비할_수_있다() {
        String first = store.issue(request, NAVER);
        MockHttpServletRequest anotherTab = new MockHttpServletRequest();
        anotherTab.setSession((MockHttpSession) request.getSession(false));
        String second = store.issue(anotherTab, NAVER);

        assertThat(store.consume(anotherTab, NAVER, first)).isTrue();
        assertThat(store.consume(request, NAVER, second)).isTrue();
        assertThat(store.consume(request, NAVER, first)).isFalse();
        assertThat(store.consume(anotherTab, NAVER, second)).isFalse();
    }

    @Test
    void 다른_세션은_state를_소비할_수_없다() {
        String state = store.issue(request, NAVER);
        MockHttpServletRequest attacker = new MockHttpServletRequest();

        assertThat(store.consume(attacker, NAVER, state)).isFalse();
        assertThat(attacker.getSession(false)).isNull();
        assertThat(store.consume(request, NAVER, state)).isTrue();
    }

    @Test
    void 발급_5분_직전에는_유효하다() {
        String state = store.issue(request, NAVER);
        when(clock.instant()).thenReturn(START.plusSeconds(299));

        assertThat(store.consume(request, NAVER, state)).isTrue();
    }

    @Test
    void 발급_5분부터는_만료되어_소비할_수_없다() {
        String state = store.issue(request, NAVER);
        when(clock.instant()).thenReturn(START.plusSeconds(300));

        assertThat(store.consume(request, NAVER, state)).isFalse();
        assertThat(store.consume(request, NAVER, state)).isFalse();
    }

    @Test
    void 열_개를_초과하면_가장_오래된_시도만_무효화한다() {
        List<String> states = new ArrayList<>();
        for (int index = 0; index < 11; index++) {
            states.add(store.issue(request, NAVER));
        }

        assertThat(store.consume(request, NAVER, states.getFirst())).isFalse();
        states.stream().skip(1).forEach(state -> assertThat(store.consume(request, NAVER, state)).isTrue());
    }

    @Test
    void 만료된_시도는_새_발급_전에_제거한다() {
        String expired = store.issue(request, NAVER);
        when(clock.instant()).thenReturn(START.plusSeconds(300));
        String current = store.issue(request, NAVER);

        assertThat(store.consume(request, NAVER, expired)).isFalse();
        assertThat(store.consume(request, NAVER, current)).isTrue();
    }

    @Test
    void 병렬_콜백에서도_동일_state는_한_번만_소비된다() throws Exception {
        String state = store.issue(request, NAVER);
        List<Callable<Boolean>> attempts = new ArrayList<>();
        for (int index = 0; index < 8; index++) {
            attempts.add(() -> store.consume(request, NAVER, state));
        }

        try (var executor = Executors.newFixedThreadPool(8)) {
            long successes = 0;
            for (var result : executor.invokeAll(attempts)) {
                if (result.get()) {
                    successes++;
                }
            }
            assertThat(successes).isEqualTo(1);
        }
    }

    @Test
    void 세션_소멸과_형식_오류는_안전하게_거절한다() {
        String state = store.issue(request, NAVER);
        request.getSession(false).invalidate();

        assertThat(store.consume(request, NAVER, state)).isFalse();
        assertThat(store.consume(request, NAVER, null)).isFalse();
        assertThat(store.consume(request, NAVER, "forged-state")).isFalse();
        assertThat(request.getSession(false)).isNull();
    }

    @Test
    void 다른_provider에서는_소비하지_않고_원래_시도는_보존한다() {
        String state = store.issue(request, SSAFY);

        assertThat(store.consume(request, NAVER, state)).isFalse();
        assertThat(store.consume(request, SSAFY, state)).isTrue();
        assertThat(store.consume(request, SSAFY, state)).isFalse();
    }
}
