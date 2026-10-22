package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnProperty(name = "ontop.websocket.authenticated", havingValue = "true", matchIfMissing = true)
public class WebSocketTicketController {

    private final WebSocketTicketService tickets;
    private final AuthExchangeOriginPolicy origins;

    public WebSocketTicketController(WebSocketTicketService tickets, AuthExchangeOriginPolicy origins) {
        this.tickets = tickets;
        this.origins = origins;
    }

    @PostMapping("/api/v1/auth/websocket-ticket")
    public ResponseEntity<WebSocketTicketService.Ticket> issue(HttpServletRequest request,
            Authentication authentication) {
        String origin = origins.allowedOrigin(request);
        var ticket = tickets.issue(authentication, origin);
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
