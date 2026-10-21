package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.service.AccessJwtService;
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
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
@Profile("local")
public class WebSocketTicketService {

    private final AccessJwtService jwt;
    private final ObjectProvider<WebSocketAccountLookup> accounts;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Grant> grants = new HashMap<>();

    public WebSocketTicketService(AccessJwtService jwt, ObjectProvider<WebSocketAccountLookup> accounts,
            @Qualifier("oauthClock") Clock clock) {
        this.jwt = jwt;
        this.accounts = accounts;
        this.clock = clock;
    }

    public Ticket issue(String accessToken, String origin) {
        var access = jwt.verifyAccess(accessToken);
        VerifiedWebSocketUser user = active(access.userId());
        synchronized (grants) {
            Instant now = clock.instant();
            grants.values().removeIf(grant -> !grant.expiresAt().isAfter(now));
            long lifetime = Math.min(30, access.expiresAt().getEpochSecond() - now.getEpochSecond());
            if (lifetime <= 0) { throw unauthorized(); }
            if (grants.size() >= 10000 || grants.values().stream()
                    .filter(grant -> grant.userId() == user.userId()).count() >= 4) {
                throw new WebSocketTicketException(HttpStatus.TOO_MANY_REQUESTS, "WS_TICKET_LIMIT");
            }
            byte[] bytes = new byte[32];
            random.nextBytes(bytes);
            String value = "wst_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            Instant expires = now.plusSeconds(lifetime);
            if (expires.isAfter(access.expiresAt())) { expires = access.expiresAt(); }
            grants.put(hash(value), new Grant(user.userId(), origin, expires));
            return new Ticket(value, lifetime);
        }
    }

    public VerifiedWebSocketUser consume(String value, String origin) {
        if (value == null || !value.matches("wst_[A-Za-z0-9_-]{43}")) { throw unauthorized(); }
        Grant grant;
        synchronized (grants) { grant = grants.remove(hash(value)); }
        if (grant == null || !grant.expiresAt().isAfter(clock.instant())
                || !Objects.equals(grant.origin(), origin)) { throw unauthorized(); }
        return active(grant.userId());
    }

    private VerifiedWebSocketUser active(long userId) {
        WebSocketAccountLookup lookup = accounts.getIfAvailable();
        if (lookup == null) {
            throw new WebSocketTicketException(HttpStatus.SERVICE_UNAVAILABLE, "WS_ACCOUNT_UNAVAILABLE");
        }
        try {
            Optional<VerifiedWebSocketUser> user = lookup.findActive(userId);
            return user.filter(value -> value.userId() == userId).orElseThrow(WebSocketTicketService::unauthorized);
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

    private record Grant(long userId, String origin, Instant expiresAt) { }

    public record Ticket(String ticket, long expiresIn) {
        @Override public String toString() { return "Ticket[redacted]"; }
    }
}
