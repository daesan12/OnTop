package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import jakarta.annotation.PreDestroy;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class OnboardingTokenStore {

    public static final long LIFETIME_SECONDS = 600;
    private final Map<String, Pending> entries = new HashMap<>();
    private final Clock clock;
    private final SecureRandom random;
    private final int capacity;

    @Autowired
    public OnboardingTokenStore(@Qualifier("oauthClock") Clock clock) {
        this(clock, new SecureRandom(), 10000);
    }

    OnboardingTokenStore(Clock clock, SecureRandom random, int capacity) {
        this.clock = clock;
        this.random = random;
        this.capacity = capacity;
    }

    public synchronized String issue(OAuthIdentity identity) {
        removeExpired();
        if (entries.size() >= capacity) {
            throw new AuthExchangeException(AuthExchangeException.Error.CAPACITY);
        }
        String raw;
        String hash;
        do {
            raw = "ob_" + OpaqueTokens.generate(random);
            hash = OpaqueTokens.digest(raw);
        } while (entries.containsKey(hash));
        entries.put(hash, new Pending(identity, clock.instant().plusSeconds(LIFETIME_SECONDS)));
        return raw;
    }

    // USER-05 전용 검증 경계다. 일반 Access JWT 검증자와 연결하지 않는다.
    public synchronized OAuthIdentity verify(String token) {
        return pending(token).identity();
    }

    // USER-05는 입력 검증 후 일회 소비하고 DB UNIQUE를 재검증해야 한다. 실패 후 복원하지 않는다.
    public synchronized OAuthIdentity consume(String token) {
        Pending pending = pending(token);
        entries.remove(OpaqueTokens.digest(token));
        return pending.identity();
    }

    private Pending pending(String token) {
        removeExpired();
        if (token == null || !token.matches("ob_[A-Za-z0-9_-]{43}")) {
            throw invalid();
        }
        Pending pending = entries.get(OpaqueTokens.digest(token));
        if (pending == null) {
            throw invalid();
        }
        return pending;
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

    private AuthExchangeException invalid() {
        return new AuthExchangeException(AuthExchangeException.Error.INVALID_ONBOARDING);
    }

    private record Pending(OAuthIdentity identity, Instant expiresAt) {
    }
}
