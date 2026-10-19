package com.ssafy.ontop.table.websocket;

import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketUserResolver;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

@Component
@Profile("local")
public class TableHandshakeInterceptor implements HandshakeInterceptor {

    public static final String VERIFIED_USER = TableHandshakeInterceptor.class.getName() + ".user";

    private final boolean authenticated;
    private final Optional<WebSocketUserResolver> resolver;

    public TableHandshakeInterceptor(@Value("${ontop.websocket.authenticated:false}") boolean authenticated,
            Optional<WebSocketUserResolver> resolver) {
        this.authenticated = authenticated;
        this.resolver = resolver;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler handler, Map<String, Object> attributes) {
        attributes.remove(VERIFIED_USER);
        if (!authenticated) {
            return true;
        }
        if (resolver.isEmpty()) {
            response.setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
            return false;
        }
        if (request.getPrincipal() == null) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
        try {
            Optional<VerifiedWebSocketUser> user = resolver.get().resolve(request.getPrincipal());
            if (user.isEmpty()) {
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }
            attributes.put(VERIFIED_USER, user.get());
            return true;
        } catch (RuntimeException exception) {
            response.setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler handler, Exception exception) {
    }
}
