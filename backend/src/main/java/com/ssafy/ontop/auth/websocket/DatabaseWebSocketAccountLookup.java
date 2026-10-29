package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class DatabaseWebSocketAccountLookup implements WebSocketAccountLookup {

    private final AccessAuthenticationService authentication;

    public DatabaseWebSocketAccountLookup(AccessAuthenticationService authentication) {
        this.authentication = authentication;
    }

    @Override
    public Optional<VerifiedWebSocketUser> findActive(long userId, String sessionId) {
        try {
            return Optional.of(VerifiedWebSocketUser.from(authentication.requireActive(userId, sessionId)));
        } catch (RestAuthenticationException exception) {
            if (exception.error() == RestAuthenticationException.Error.MEMBER_CHANGED) {
                return Optional.empty();
            }
            throw new WebSocketTicketException(HttpStatus.SERVICE_UNAVAILABLE,
                    "WS_ACCOUNT_UNAVAILABLE");
        }
    }
}
