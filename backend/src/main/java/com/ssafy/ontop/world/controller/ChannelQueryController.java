package com.ssafy.ontop.world.controller;

import com.ssafy.ontop.world.service.ChannelQueryService;
import java.security.Principal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("local")
public class ChannelQueryController {

    private static final Logger log = LoggerFactory.getLogger(ChannelQueryController.class);

    private final ChannelQueryService service;

    public ChannelQueryController(ChannelQueryService service) {
        this.service = service;
    }

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
