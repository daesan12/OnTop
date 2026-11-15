package com.ssafy.ontop.world.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.world.jumpmap.JumpmapService;
import com.ssafy.ontop.world.jumpmap.JumpmapStore;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Clock;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 게임 매크로 분석의 점프맵 반복 패턴(녹화 재생 의심) 기록 조회. 조회 권한은 보안 설정의 ADMIN_READ가 확인한다.
 * 기록은 서버 관측만으로 만들며 이용자에게는 어떤 형태로도 알리지 않는다.
 */
@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@RequestMapping("/api/v1/admin/macro-analysis")
@Tag(name = "ADMIN")
public class JumpmapMacroAdminController {
    static final int LIMIT = 200;
    private final JumpmapService service;
    private final Clock clock;

    public JumpmapMacroAdminController(JumpmapService service, ObjectProvider<Clock> clocks) {
        this.service = service;
        this.clock = clocks.getIfUnique(Clock::systemUTC);
    }

    public record MacroSuspectsResponse(boolean enabled, int limit, List<JumpmapStore.MacroSuspect> items,
            String generatedAt) {}

    @GetMapping("/jumpmap")
    @Operation(summary = "점프맵 반복 패턴 적발 회원 목록",
            description = "한 번 이상 기록된 회원을 적발 판이 많은 순으로 최대 200명 반환한다. 서버 재시작 전의 판끼리만 비교한다.",
            security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "적발 회원 목록. 점프맵이 꺼져 있으면 enabled=false와 빈 목록"),
        @ApiResponse(responseCode = "401", description = "로그인 필요",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "관리자 조회 권한 필요",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "기록 테이블을 읽을 수 없음",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    public ResponseEntity<MacroSuspectsResponse> suspects() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new MacroSuspectsResponse(
                service.active(), LIMIT, service.macroSuspects(LIMIT), clock.instant().toString()));
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<AuthErrorResponse> unavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).cacheControl(CacheControl.noStore())
                .body(new AuthErrorResponse("JUMPMAP_MACRO_UNAVAILABLE", "적발 기록을 잠시 확인할 수 없습니다."));
    }
}
