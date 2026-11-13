package com.ssafy.ontop.game.jumprope;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.config.RuntimeProfiles;
import io.swagger.v3.oas.annotations.Operation;
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
