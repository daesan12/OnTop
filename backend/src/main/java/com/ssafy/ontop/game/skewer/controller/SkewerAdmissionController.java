package com.ssafy.ontop.game.skewer.controller;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.skewer.dto.SkewerAdmissionResponse;
import com.ssafy.ontop.game.skewer.service.SkewerAdmissionException;
import com.ssafy.ontop.game.skewer.service.SkewerAdmissionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Collections;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@RequestMapping("/api/v1/minigames/skewer/admissions")
@Tag(name = "MINIGAME")
@SecurityRequirement(name = "AccessJwt")
public class SkewerAdmissionController {
    private final ObjectProvider<SkewerAdmissionService> services;

    public SkewerAdmissionController(ObjectProvider<SkewerAdmissionService> services) {
        this.services = services;
    }

    @PostMapping
    @Operation(operationId = "startSkewerAdmission", summary = "온탑 꼬치왕 한 판 이용권 구매", description = "서버 고정 이용료 10냥. "
            + "Idempotency-Key를 재사용하면 같은 영수증을 반환하며 다시 차감하지 않습니다. "
            + "판돈·점수 보상·환불은 없으며, 사용자와 가격을 요청 본문에서 받지 않습니다.")
    @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
            schema = @Schema(type = "string", minLength = 1, maxLength = 64, pattern = "^[A-Za-z0-9_-]{1,64}$"))
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "이용권 발급 또는 같은 영수증 재확인",
                content = @Content(schema = @Schema(implementation = SkewerAdmissionResponse.class))),
        @ApiResponse(responseCode = "400", description = "잘못된 중복 방지 키 또는 요청 본문"),
        @ApiResponse(responseCode = "401", description = "인증된 활성 회원 필요"),
        @ApiResponse(responseCode = "403", description = "허용되지 않은 출처 또는 권한"),
        @ApiResponse(responseCode = "409", description = "INSUFFICIENT_COINS / WALLET_NOT_READY"),
        @ApiResponse(responseCode = "429", description = "SKEWER_TOO_MANY_STARTS"),
        @ApiResponse(responseCode = "503", description = "SKEWER_UNAVAILABLE")
    })
    public ResponseEntity<SkewerAdmissionResponse> start(@AuthenticationPrincipal AuthenticatedUser user,
            HttpServletRequest request) throws IOException {
        if (user == null) {
            throw new SkewerAdmissionException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1 || !keys.getFirst().matches("[A-Za-z0-9_-]{1,64}")
                || request.getContentLengthLong() > 0 || request.getInputStream().read() != -1) {
            throw new SkewerAdmissionException(400, "SKEWER_INVALID_REQUEST", "중복 방지 키를 확인해 주세요.");
        }
        var service = services.getIfAvailable();
        if (service == null) {
            throw new SkewerAdmissionException(503, "SKEWER_UNAVAILABLE", "이용권 서버 연결을 확인해 주세요.");
        }
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
                .body(service.start(user.userId(), keys.getFirst()));
    }

    @ExceptionHandler(SkewerAdmissionException.class)
    ResponseEntity<SkewerErrorResponse> business(SkewerAdmissionException error) {
        return ResponseEntity.status(error.status()).cacheControl(CacheControl.noStore())
                .body(new SkewerErrorResponse(error.code(), error.getMessage()));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<SkewerErrorResponse> unavailable(RuntimeException error) {
        return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).body(new SkewerErrorResponse(
                "SKEWER_UNAVAILABLE", "이용권 확인 중 문제가 생겼어요. 같은 요청으로 다시 시도해 주세요."));
    }

    public record SkewerErrorResponse(String code, String message) {
    }
}
