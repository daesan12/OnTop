package com.ssafy.ontop.world.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.world.service.ChannelQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.security.Principal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@Tag(name = "Channel")
public class ChannelQueryController {

    private static final Logger log = LoggerFactory.getLogger(ChannelQueryController.class);

    private final ChannelQueryService service;

    public ChannelQueryController(ChannelQueryService service) {
        this.service = service;
    }

    @Operation(summary = "채널 목록 조회", description = "실제 채널/현재 인원 조회입니다. 입장/예약하지 않습니다. Access JWT와 활성 회원 검증이 필요합니다.",
            security = {@SecurityRequirement(name = "AccessJwt")})
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = com.ssafy.ontop.world.dto.ChannelListResponse.class))),
        @ApiResponse(responseCode = "401", description = "UNAUTHENTICATED 또는 REST 인증 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "FORBIDDEN 또는 REST 인가 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "SERVICE_UNAVAILABLE 또는 REST 회원 조회 장애",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @GetMapping("/api/v1/channels")
    public ResponseEntity<?> listChannels(Principal principal) {
        // 인증 담당이 서버 요청에 설정한 Principal만 사용한다. 헤더·userId·Principal 이름을 파싱하지 않는다.
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).cacheControl(CacheControl.noStore())
                    .body(new ErrorResponse("UNAUTHENTICATED", "로그인이 필요합니다.", null));
        }
        try {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.listChannels());
        } catch (ChannelQueryService.UnavailableException exception) {
            log.warn("채널 목록 조회 실패", exception);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).cacheControl(CacheControl.noStore())
                    .body(new ErrorResponse("SERVICE_UNAVAILABLE", "채널 목록을 확인할 수 없습니다.", null));
        }
    }

    private record ErrorResponse(String code, String message, Object details) {
    }
}
