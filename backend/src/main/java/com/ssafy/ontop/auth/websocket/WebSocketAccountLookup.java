package com.ssafy.ontop.auth.websocket;

import java.util.Optional;

@FunctionalInterface
public interface WebSocketAccountLookup {
    Optional<VerifiedWebSocketUser> findActive(long userId, String sessionId);
}
