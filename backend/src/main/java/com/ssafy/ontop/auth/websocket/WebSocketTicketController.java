package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Collections;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("local")
@ConditionalOnProperty(name = "ontop.websocket.authenticated", havingValue = "true")
public class WebSocketTicketController {

    private final WebSocketTicketService tickets;
    private final AuthExchangeOriginPolicy origins;

    public WebSocketTicketController(WebSocketTicketService tickets, AuthExchangeOriginPolicy origins) {
        this.tickets = tickets;
        this.origins = origins;
    }

    @PostMapping("/api/v1/auth/websocket-ticket")
    public ResponseEntity<WebSocketTicketService.Ticket> issue(HttpServletRequest request) {
        String origin = origins.allowedOrigin(request);
        var authorization = Collections.list(request.getHeaders("Authorization"));
        if (authorization.size() != 1 || !authorization.getFirst().startsWith("Bearer ")) {
            throw new AuthExchangeException(AuthExchangeException.Error.INVALID_ACCESS);
        }
        var ticket = tickets.issue(authorization.getFirst().substring(7), origin);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(ticket);
    }

    @ExceptionHandler(WebSocketTicketException.class)
    public ResponseEntity<AuthErrorResponse> ticketError(WebSocketTicketException error) {
        return ResponseEntity.status(error.status()).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer")
                .body(new AuthErrorResponse(error.code(), error.getMessage()));
    }

    @ExceptionHandler(AuthExchangeException.class)
    public ResponseEntity<AuthErrorResponse> authError(AuthExchangeException error) {
        return ResponseEntity.status(error.error().status()).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer")
                .body(new AuthErrorResponse(error.error().code(), error.getMessage()));
    }
}
