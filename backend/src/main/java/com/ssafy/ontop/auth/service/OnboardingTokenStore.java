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

    // 트랜잭션이 없는 내부 소비용이다. USER-05는 claim/complete/releaseNicknameConflict를 사용한다.
    public synchronized OAuthIdentity consume(String token) {
        Claim claim = claim(token);
        complete(claim);
        return claim.identity();
    }

    public synchronized Claim claim(String token) {
        Pending pending = pending(token);
        Claim claim = new Claim(OpaqueTokens.digest(token), pending);
        pending.claim = claim;
        return claim;
    }

    // 성공한 DB 커밋 이후 확정한다. 처리 도중 만료/정리된 선점도 다시 활성화하지 않는다.
    public synchronized void complete(Claim claim) {
        invalidate(claim);
    }

    // 확인된 닉네임 충돌 + 확인된 롤백에만 호출한다. 발급/만료 시각을 바꾸지 않는다.
    public synchronized void releaseNicknameConflict(Claim claim) {
        if (owns(claim)) {
            if (claim.pending.expiresAt.isAfter(clock.instant())) {
                claim.pending.claim = null;
            } else {
                entries.remove(claim.hash);
            }
        }
    }

    // 실패 또는 커밋 결과 불명은 재활성화하지 않는다. 과거 선점으로 새 선점을 해제할 수 없다.
    public synchronized void invalidate(Claim claim) {
        if (owns(claim)) {
            entries.remove(claim.hash);
        }
    }

    private boolean owns(Claim claim) {
        return entries.get(claim.hash) == claim.pending && claim.pending.claim == claim;
    }

    private Pending pending(String token) {
        removeExpired();
        if (token == null || !token.matches("ob_[A-Za-z0-9_-]{43}")) {
            throw invalid();
        }
        Pending pending = entries.get(OpaqueTokens.digest(token));
        if (pending == null || pending.claim != null) {
            throw invalid();
        }
        return pending;
    }

    @Scheduled(fixedDelay = 30000)
    public synchronized void removeExpired() {
        Instant now = clock.instant();
        entries.values().removeIf(value -> !value.expiresAt.isAfter(now));
    }

    @PreDestroy
    public synchronized void clearOnShutdown() {
        entries.clear();
    }

    private AuthExchangeException invalid() {
        return new AuthExchangeException(AuthExchangeException.Error.INVALID_ONBOARDING);
    }

    public static final class Claim {
        private final String hash;
        private final Pending pending;

        private Claim(String hash, Pending pending) {
            this.hash = hash;
            this.pending = pending;
        }

        public OAuthIdentity identity() {
            return pending.identity;
        }

        @Override
        public String toString() {
            return "OnboardingClaim[redacted]";
        }
    }

    private static final class Pending {
        private final OAuthIdentity identity;
        private final Instant expiresAt;
        private Claim claim;

        private Pending(OAuthIdentity identity, Instant expiresAt) {
            this.identity = identity;
            this.expiresAt = expiresAt;
        }

        private OAuthIdentity identity() {
            return identity;
        }
    }
}
