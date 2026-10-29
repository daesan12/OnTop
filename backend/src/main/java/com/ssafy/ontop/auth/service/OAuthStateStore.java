package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.OAuthProvider;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

@Component
public class OAuthStateStore {

    private static final String SESSION_ATTRIBUTE = OAuthStateStore.class.getName() + ".pending";
    private static final Duration LIFETIME = Duration.ofMinutes(5);
    private static final int MAX_PENDING_STATES = 10;
    private final Clock clock;
    private final SecureRandom random;

    public OAuthStateStore() {
        this(Clock.systemUTC());
    }

    @Autowired
    public OAuthStateStore(@Qualifier("oauthClock") Clock clock) {
        this(clock, new SecureRandom());
    }

    OAuthStateStore(Clock clock, SecureRandom random) {
        this.clock = clock;
        this.random = random;
    }

    public String issue(HttpServletRequest request, OAuthProvider provider) {
        HttpSession session = request.getSession(true);
        synchronized (session) {
            PendingStates pending = (PendingStates) session.getAttribute(SESSION_ATTRIBUTE);
            if (pending == null) {
                pending = new PendingStates();
                session.setAttribute(SESSION_ATTRIBUTE, pending);
            }
            Instant now = clock.instant();
            removeExpired(pending, now);
            if (pending.states.size() >= MAX_PENDING_STATES) {
                pending.states.pollFirstEntry();
            }
            String state;
            String digest;
            do {
                state = OpaqueTokens.generate(random);
                digest = OpaqueTokens.digest(state);
            } while (pending.states.containsKey(digest));
            pending.states.put(digest, new PendingState(provider, now.plus(LIFETIME)));
            return state;
        }
    }

    public boolean consume(HttpServletRequest request, OAuthProvider provider, String state) {
        if (!OpaqueTokens.isWellFormed(state)) {
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
            String digest = OpaqueTokens.digest(state);
            PendingState attempt = pending.states.get(digest);
            if (attempt == null || attempt.provider() != provider) {
                return false;
            }
            pending.states.remove(digest);
            return true;
        }
    }

    private void removeExpired(PendingStates pending, Instant now) {
        pending.states.values().removeIf(state -> !state.expiresAt().isAfter(now));
    }

    private record PendingState(OAuthProvider provider, Instant expiresAt) {
    }

    private static final class PendingStates {
        private final LinkedHashMap<String, PendingState> states = new LinkedHashMap<>();
    }
}
