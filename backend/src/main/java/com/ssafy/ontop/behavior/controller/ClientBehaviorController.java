package com.ssafy.ontop.behavior.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.behavior.service.ClientBehaviorIntake;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** 공원 클라이언트의 성능·체험 투어 로그를 묶어서 받는다. 허용 목록은 ClientBehaviorIntake. */
@RestController
@Tag(name = "BEHAVIOR")
@SecurityRequirement(name = "AccessJwt")
public class ClientBehaviorController {

    private final ClientBehaviorIntake intake;

    public ClientBehaviorController(ClientBehaviorIntake intake) {
        this.intake = intake;
    }

    @PostMapping("/api/v1/behavior-events")
    @Operation(summary = "클라이언트 행동 로그 묶음 전송",
            description = "PERF_REPORT·ONBOARDING_STEP만 받는다. 허용하지 않은 이벤트·속성·값은 그 이벤트만 버리고 건수로 알려 준다.")
    @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @Content(mediaType = "application/json",
            examples = @ExampleObject(value = """
                    {"events":[{"type":"ONBOARDING_STEP","ageMs":1200,
                    "props":{"flow":"welcome_tour","action":"step_done","step":"walk","replay":false,"doneCount":1}}]}
                    """)))
    @ApiResponse(responseCode = "202", description = "받은 건수와 버린 건수",
            content = @Content(mediaType = "application/json",
                    schema = @Schema(implementation = ClientBehaviorIntake.Result.class)))
    @ApiResponse(responseCode = "400", description = "INVALID_REQUEST: events가 1~20개 배열이 아님",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @ApiResponse(responseCode = "401", description = "인증된 활성 회원 필요")
    public ResponseEntity<?> collect(@AuthenticationPrincipal AuthenticatedUser user, @RequestBody JsonNode body) {
        if (user == null) {
            return ResponseEntity.status(401).cacheControl(CacheControl.noStore())
                    .body(new ErrorResponse("UNAUTHENTICATED", "로그인이 필요합니다."));
        }
        JsonNode events = body == null ? null : body.get("events");
        if (body == null || !body.isObject() || body.size() != 1 || events == null || !events.isArray() || events.isEmpty()
                || events.size() > ClientBehaviorIntake.MAX_BATCH) {
            return invalid();
        }
        var result = intake.accept(user.userId(), user.sessionId(), events);
        return ResponseEntity.status(202).cacheControl(CacheControl.noStore()).body(result);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ErrorResponse> invalid() {
        return ResponseEntity.status(400).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse("INVALID_REQUEST", "events는 1~20개 배열이어야 합니다."));
    }

    @Schema(name = "BehaviorErrorResponse")
    public record ErrorResponse(String code, String message) {
    }
}
