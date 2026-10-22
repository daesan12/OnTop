package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class WebSocketTicketService {

    private final ObjectProvider<WebSocketAccountLookup> accounts;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Grant> grants = new HashMap<>();

    public WebSocketTicketService(ObjectProvider<WebSocketAccountLookup> accounts,
            @Qualifier("oauthClock") Clock clock) {
        this.accounts = accounts;
        this.clock = clock;
    }

    // HTTP 입력의 userId나 원문 토큰이 아닌 보호 체인의 Authentication만 받는다.
    public Ticket issue(Authentication authentication, String origin) {
        if (authentication == null || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof AuthenticatedUser user)
                || !(authentication.getDetails() instanceof AccessAuthenticationService.AuthenticatedAccess access)
                || !user.equals(access.user()) || access.expiresAt() == null
                || authentication.getAuthorities().stream()
                        .noneMatch(role -> role.getAuthority().equals("ROLE_MEMBER"))) {
            throw unauthorized();
        }
        VerifiedWebSocketUser verifiedUser = VerifiedWebSocketUser.from(user);
        synchronized (grants) {
            Instant now = clock.instant();
            grants.values().removeIf(grant -> !grant.expiresAt().isAfter(now));
            long lifetime = Math.min(30, access.expiresAt().getEpochSecond() - now.getEpochSecond());
            if (lifetime <= 0) { throw unauthorized(); }
            if (grants.size() >= 10000 || grants.values().stream()
                    .filter(grant -> grant.userId() == verifiedUser.userId()).count() >= 4) {
                throw new WebSocketTicketException(HttpStatus.TOO_MANY_REQUESTS, "WS_TICKET_LIMIT");
            }
            byte[] bytes = new byte[32];
            random.nextBytes(bytes);
            String value = "wst_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            Instant expires = now.plusSeconds(lifetime);
            if (expires.isAfter(access.expiresAt())) { expires = access.expiresAt(); }
            grants.put(hash(value), new Grant(verifiedUser.userId(), verifiedUser.sessionId(), origin, expires));
            return new Ticket(value, lifetime);
        }
    }

    public VerifiedWebSocketUser consume(String value, String origin) {
        if (value == null || !value.matches("wst_[A-Za-z0-9_-]{43}")) { throw unauthorized(); }
        Grant grant;
        synchronized (grants) { grant = grants.remove(hash(value)); }
        if (grant == null || !grant.expiresAt().isAfter(clock.instant())
                || !Objects.equals(grant.origin(), origin)) { throw unauthorized(); }
        return active(grant.userId(), grant.sessionId());
    }

    private VerifiedWebSocketUser active(long userId, String sessionId) {
        WebSocketAccountLookup lookup = accounts.getIfAvailable();
        if (lookup == null) {
            throw new WebSocketTicketException(HttpStatus.SERVICE_UNAVAILABLE, "WS_ACCOUNT_UNAVAILABLE");
        }
        try {
            Optional<VerifiedWebSocketUser> user = lookup.findActive(userId, sessionId);
            return user.filter(value -> value.userId() == userId && value.sessionId().equals(sessionId))
                    .orElseThrow(WebSocketTicketService::unauthorized);
        } catch (WebSocketTicketException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new WebSocketTicketException(HttpStatus.SERVICE_UNAVAILABLE, "WS_ACCOUNT_UNAVAILABLE");
        }
    }

    private String hash(String value) {
        try {
            return Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    private static WebSocketTicketException unauthorized() {
        return new WebSocketTicketException(HttpStatus.UNAUTHORIZED, "INVALID_WS_TICKET");
    }

    private record Grant(long userId, String sessionId, String origin, Instant expiresAt) { }

    public record Ticket(String ticket, long expiresIn) {
        @Override public String toString() { return "Ticket[redacted]"; }
    }
}
