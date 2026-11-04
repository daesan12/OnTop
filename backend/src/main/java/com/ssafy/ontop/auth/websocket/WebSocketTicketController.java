package com.ssafy.ontop.auth.websocket;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AuthExchangeOriginPolicy;
import com.ssafy.ontop.operation.domain.ServiceOperationState;
import com.ssafy.ontop.operation.service.ServiceOperationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnProperty(name = "ontop.websocket.authenticated", havingValue = "true", matchIfMissing = true)
@Tag(name = "Auth")
public class WebSocketTicketController {

    private final WebSocketTicketService tickets;
    private final AuthExchangeOriginPolicy origins;
    private final ServiceOperationService operations;

    public WebSocketTicketController(WebSocketTicketService tickets, AuthExchangeOriginPolicy origins) {
        this(tickets, origins, ServiceOperationService.alwaysOpen());
    }

    @Autowired
    public WebSocketTicketController(WebSocketTicketService tickets, AuthExchangeOriginPolicy origins,
            ServiceOperationService operations) {
        this.tickets = tickets;
        this.origins = origins;
        this.operations = operations;
    }

    @Operation(summary = "WebSocket 일회용 접속권", description = "Access JWT로 인증한 활성 회원 및 sid와 허용된 Origin에 결합합니다. 최대 30초(Access 만료 상한), 일회용입니다. /ws/tables?ticket= 연결 시 같은 Origin·회원·sid를 재확인합니다. 새 연결/재접속마다 발급하세요. 브라우저는 WebSocket Authorization 헤더를 직접 설정할 수 없습니다.",
            security = {@SecurityRequirement(name = "AccessJwt")})
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = com.ssafy.ontop.auth.websocket.WebSocketTicketService.Ticket.class))),
        @ApiResponse(responseCode = "401", description = "AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN / AUTH_MEMBER_STATE_CHANGED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_TOKEN_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "AUTH_MEMBER_LOOKUP_UNAVAILABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @ApiResponse(responseCode = "429", description = "WS_TICKET_LIMIT: 회원별 4개 또는 저장소 최대 접속권 수 초과",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    @PostMapping("/api/v1/auth/websocket-ticket")
    public ResponseEntity<WebSocketTicketService.Ticket> issue(HttpServletRequest request,
            Authentication authentication) {
        ServiceOperationState state = operations.current();
        if (!state.allowsNewActivity()) {
            throw new WebSocketTicketException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    "SERVICE_" + state.mode().name());
        }
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
