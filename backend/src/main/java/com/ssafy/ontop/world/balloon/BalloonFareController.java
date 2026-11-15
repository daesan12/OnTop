package com.ssafy.ontop.world.balloon;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.operation.config.NewActivity;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class BalloonFareController {
    private static final Pattern REQUEST_KEY = Pattern.compile("[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}");
    private static final Pattern USER_ID = Pattern.compile("[1-9][0-9]{0,18}");
    private final BalloonFareService service;
    private final BalloonFlights flights;
    private final WorldChannelRegistry channels;

    public BalloonFareController(BalloonFareService service, BalloonFlights flights, WorldChannelRegistry channels) {
        this.service = service;
        this.flights = flights;
        this.channels = channels;
    }

    @PostMapping("/api/v1/world/balloon/tickets")
    @NewActivity
    @Operation(operationId = "buyBalloonTicket", summary = "열기구 탑승료 결제",
            description = "승강장에서 현재 회원의 사용 가능 잔액 100냥을 차감합니다. 같은 requestId로 재확인할 수 있습니다.",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<?> buy(@AuthenticationPrincipal AuthenticatedUser user, @RequestBody TicketRequest request) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        if (request.requestId() == null || !REQUEST_KEY.matcher(request.requestId()).matches()) {
            return error(400, "BALLOON_INVALID_REQUEST", "탑승 요청을 다시 확인해 주세요.");
        }
        String rider = Long.toString(user.userId());
        String leader = request.leaderId();
        UUID ticket = UUID.fromString(request.requestId());
        if (leader != null) {
            if (!USER_ID.matcher(leader).matches()) {
                return error(400, "BALLOON_INVALID_REQUEST", "탑승 요청을 다시 확인해 주세요.");
            }
            if (!flights.atStation(channels.positionOf(rider))) {
                return error(409, "BALLOON_STATION_REQUIRED", "하늘언덕 승강장으로 이동해 주세요.");
            }
            if (!flights.holdSeat(channels.channelOf(rider), leader, rider, ticket, Instant.now(), System.nanoTime())) {
                return error(409, "BALLOON_SEAT_UNAVAILABLE", "빈자리가 없거나 이미 출발했어요.");
            }
        }
        try {
            var receipt = service.buy(user.userId(), ticket);
            flights.authorize(rider, receipt.requestId(), receipt.paidAt(), Instant.now());
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(receipt);
        } catch (RuntimeException failure) {
            if (leader != null) flights.releaseSeat(leader, rider, ticket);
            throw failure;
        }
    }

    @ExceptionHandler(BalloonFareService.Rejected.class)
    ResponseEntity<AuthErrorResponse> rejected(BalloonFareService.Rejected failure) {
        return error(409, failure.code(), failure.getMessage());
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<AuthErrorResponse> unavailable(RuntimeException failure) {
        return error(503, "BALLOON_PAYMENT_UNAVAILABLE", "결제 확인이 늦어지고 있어요. 같은 요청으로 다시 시도해 주세요.");
    }

    private static ResponseEntity<AuthErrorResponse> error(int status, String code, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .body(new AuthErrorResponse(code, message));
    }

    public record TicketRequest(String requestId, String leaderId) { }
}
