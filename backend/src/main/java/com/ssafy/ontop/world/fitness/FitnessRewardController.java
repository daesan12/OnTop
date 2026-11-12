package com.ssafy.ontop.world.fitness;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.config.RuntimeProfiles;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@RequestMapping("/api/v1/world/fitness/rewards")
@Tag(name = "FITNESS", description = "운동기구 보상 상태 조회")
public class FitnessRewardController {
    private final FitnessRewardService service;

    public FitnessRewardController(FitnessRewardService service) {
        this.service = service;
    }

    @GetMapping("/status")
    @Operation(operationId = "getFitnessRewardStatus", summary = "본인 운동기구 일일 수입 조회", description = "실제 60초마다 5냥, 한국 시간 하루 최대 500냥으로 "
            + "미니게임 1000냥과 별도입니다. todayEarned는 확정된 원장 합계이며 nextRewardAt은 지급 예정 경계입니다. "
            + "지급 지연 중에는 과거 시각일 수 있으며, 한도 도달·미이용 시 null입니다. 하차 시 미완료 시간은 초기화됩니다. "
            + "조회는 지급이나 지갑 생성을 수행하지 않습니다.", security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "본인 운동 수입 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = FitnessRewardStatusResponse.class))),
        @ApiResponse(responseCode = "401", description = "활성 회원 인증 필요",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "FITNESS_UNAVAILABLE: 수입 조회 지연",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    public ResponseEntity<FitnessRewardStatusResponse> rewardStatus(
            @Parameter(hidden = true) @AuthenticationPrincipal AuthenticatedUser user) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.status(user.userId()));
    }

    @ExceptionHandler({DataAccessException.class, IllegalStateException.class})
    ResponseEntity<AuthErrorResponse> unavailable(RuntimeException exception) {
        return ResponseEntity.status(503).cacheControl(CacheControl.noStore())
                .body(new AuthErrorResponse("FITNESS_UNAVAILABLE", "운동 수입을 잠시 확인할 수 없어요."));
    }
}
