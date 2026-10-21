package com.ssafy.ontop.table.websocket;

import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketUserResolver;
import com.ssafy.ontop.auth.websocket.WebSocketTicketService;
import com.ssafy.ontop.auth.websocket.WebSocketTicketException;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

@Component
@Profile("local")
public class TableHandshakeInterceptor implements HandshakeInterceptor {

    public static final String VERIFIED_USER = TableHandshakeInterceptor.class.getName() + ".user";

    private final boolean authenticated;
    private final Optional<WebSocketUserResolver> resolver;
    private final Optional<WebSocketTicketService> tickets;

    public TableHandshakeInterceptor(boolean authenticated, Optional<WebSocketUserResolver> resolver) {
        this(authenticated, resolver, Optional.empty());
    }

    @Autowired
    public TableHandshakeInterceptor(@Value("${ontop.websocket.authenticated:false}") boolean authenticated,
            Optional<WebSocketUserResolver> resolver, Optional<WebSocketTicketService> tickets) {
        this.authenticated = authenticated;
        this.resolver = resolver;
        this.tickets = tickets;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler handler, Map<String, Object> attributes) {
        attributes.remove(VERIFIED_USER);
        if (!authenticated) {
            return true;
        }
        var query = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams();
        if (query.containsKey("ticket")) {
            var values = query.get("ticket");
            var origins = request.getHeaders().get("Origin");
            if (query.size() != 1 || values.size() != 1 || origins != null && origins.size() != 1) {
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }
            if (tickets.isEmpty()) {
                response.setStatusCode(HttpStatus.SERVICE_UNAVAILABLE);
                return false;
            }
            try {
                var user = tickets.get().consume(values.getFirst(), origins == null ? null : origins.getFirst());
                attributes.put(VERIFIED_USER, user);
                return true;
            } catch (WebSocketTicketException exception) {
                response.setStatusCode(exception.status());
                return false;
            }
        }
        if (resolver.isEmpty()) {
            response.setStatusCode(tickets.isPresent() ? HttpStatus.UNAUTHORIZED : HttpStatus.SERVICE_UNAVAILABLE);
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
