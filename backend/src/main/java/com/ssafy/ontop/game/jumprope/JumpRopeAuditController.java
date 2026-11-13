package com.ssafy.ontop.game.jumprope;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.config.RuntimeProfiles;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.time.Clock;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 게임 매크로 분석의 줄넘기 기록 조회. 조회 권한은 보안 설정의 ADMIN_READ가 확인한다. */
@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
public class JumpRopeAuditController {
    private final ObjectProvider<JumpRopeAudit> audits;
    private final Clock clock;

    JumpRopeAuditController(ObjectProvider<JumpRopeAudit> audits, ObjectProvider<Clock> clocks) {
        this.audits = audits;
        this.clock = clocks.getIfUnique(Clock::systemUTC);
    }

    @GetMapping("/api/v1/admin/macro-analysis/jump-rope")
    @Operation(operationId = "getJumpRopeMacroReport", summary = "줄넘기 매크로 의심 회원과 중복 제출 기록 조회",
            tags = "ADMIN", security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "의심 회원과 같은 기록의 재제출 묶음. 기록 저장이 꺼져 있으면 enabled=false와 빈 목록"),
        @ApiResponse(responseCode = "401", description = "로그인 필요",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "관리자 조회 권한 필요",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "기록 테이블을 읽을 수 없음",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    public ResponseEntity<JumpRopeAudit.Report> report() {
        JumpRopeAudit audit = audits.getIfAvailable();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(audit == null ? JumpRopeAudit.Report.disabled(clock.instant()) : audit.report(clock.instant()));
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<AuthErrorResponse> unavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).cacheControl(CacheControl.noStore())
                .body(new AuthErrorResponse("JUMP_ROPE_AUDIT_UNAVAILABLE", "줄넘기 기록을 잠시 확인할 수 없습니다."));
    }
}
