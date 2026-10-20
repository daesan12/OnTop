package com.ssafy.ontop.auth.service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import org.springframework.stereotype.Component;

@Component
public class NaverStateStore {

    private static final String SESSION_ATTRIBUTE = NaverStateStore.class.getName() + ".pending";
    private static final Duration LIFETIME = Duration.ofMinutes(5);
    private static final int MAX_PENDING_STATES = 10;
    private static final int RANDOM_BYTES = 32;

    private final Clock clock;
    private final SecureRandom random;

    public NaverStateStore() {
        this(Clock.systemUTC(), new SecureRandom());
    }

    NaverStateStore(Clock clock, SecureRandom random) {
        this.clock = clock;
        this.random = random;
    }

    public String issue(HttpServletRequest request) {
        HttpSession session = request.getSession(true);
        synchronized (session) {
            PendingStates pending = (PendingStates) session.getAttribute(SESSION_ATTRIBUTE);
            if (pending == null) {
                pending = new PendingStates();
                session.setAttribute(SESSION_ATTRIBUTE, pending);
            }
            Instant now = clock.instant();
            removeExpired(pending, now);
            if (pending.expirations.size() >= MAX_PENDING_STATES) {
                // 새 탭을 막는 대신 가장 오래된 시도만 무효화한다.
                pending.expirations.pollFirstEntry();
            }

            String state;
            do {
                byte[] bytes = new byte[RANDOM_BYTES];
                random.nextBytes(bytes);
                state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            } while (pending.expirations.containsKey(state));
            pending.expirations.put(state, now.plus(LIFETIME));
            return state;
        }
    }

    // AUTH-02에서 토큰 교환 전에 호출할 저장소 연산이다. 콜백 엔드포인트는 아직 없다.
    // 세션에 묶인 state만 원자적으로 제거하며, 만료·재사용·다른 브라우저의 state는 거절한다.
    public boolean consume(HttpServletRequest request, String state) {
        if (state == null || !state.matches("[A-Za-z0-9_-]{43}")) {
            return false;
        }
        HttpSession session = request.getSession(false);
        if (session == null) {
            return false;
        }
        synchronized (session) {
            PendingStates pending = (PendingStates) session.getAttribute(SESSION_ATTRIBUTE);
            if (pending == null) {
                return false;
            }
            removeExpired(pending, clock.instant());
            return pending.expirations.remove(state) != null;
        }
    }

    private void removeExpired(PendingStates pending, Instant now) {
        pending.expirations.values().removeIf(expiration -> !expiration.isAfter(now));
    }

    private static final class PendingStates {

        private final LinkedHashMap<String, Instant> expirations = new LinkedHashMap<>();
    }
}
