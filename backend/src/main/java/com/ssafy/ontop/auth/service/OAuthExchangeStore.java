package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class OAuthExchangeStore {

    public static final long LIFETIME_SECONDS = 60;
    private final Map<String, PendingExchange> entries = new HashMap<>();
    private final Clock clock;
    private final SecureRandom random;
    private final int capacity;

    @Autowired
    public OAuthExchangeStore(@Qualifier("oauthClock") Clock clock) {
        this(clock, new SecureRandom(), 10000);
    }

    OAuthExchangeStore(Clock clock, SecureRandom random, int capacity) {
        this.clock = clock;
        this.random = random;
        this.capacity = capacity;
    }

    public synchronized String issue(HttpServletRequest request, LoginOutcome outcome) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            throw new AuthCallbackException(AuthCallbackException.Error.INVALID_STATE);
        }
        removeExpired();
        if (entries.size() >= capacity) {
            throw new AuthCallbackException(AuthCallbackException.Error.CAPACITY_EXCEEDED);
        }
        String code;
        String digest;
        do {
            code = OpaqueTokens.generate(random);
            digest = OpaqueTokens.digest(code);
        } while (entries.containsKey(digest));
        entries.put(digest, new PendingExchange(outcome, OpaqueTokens.digest(session.getId()),
                clock.instant().plus(Duration.ofSeconds(LIFETIME_SECONDS))));
        return code;
    }

    // AUTH-03의 서버 내부 계약이다. 공개 교환 API는 아직 없으며 원래 세션에서만 소비한다.
    public synchronized Optional<LoginOutcome> consume(HttpServletRequest request, String code) {
        removeExpired();
        HttpSession session = request.getSession(false);
        if (session == null || !OpaqueTokens.isWellFormed(code)) {
            return Optional.empty();
        }
        String digest = OpaqueTokens.digest(code);
        PendingExchange pending = entries.get(digest);
        if (pending == null || !pending.sessionDigest().equals(OpaqueTokens.digest(session.getId()))) {
            return Optional.empty();
        }
        entries.remove(digest);
        return Optional.of(pending.outcome());
    }

    @Scheduled(fixedDelay = 30000)
    public synchronized void removeExpired() {
        Instant now = clock.instant();
        entries.values().removeIf(value -> !value.expiresAt().isAfter(now));
    }

    @PreDestroy
    public synchronized void clearOnShutdown() {
        entries.clear();
    }

    private record PendingExchange(LoginOutcome outcome, String sessionDigest, Instant expiresAt) {
    }
}
