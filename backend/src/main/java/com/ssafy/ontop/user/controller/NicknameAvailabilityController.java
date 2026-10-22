package com.ssafy.ontop.user.controller;

import com.ssafy.ontop.user.dto.NicknameAvailabilityResponse;
import com.ssafy.ontop.user.service.NicknameAvailabilityService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class NicknameAvailabilityController {

    private final NicknameAvailabilityService service;

    public NicknameAvailabilityController(NicknameAvailabilityService service) {
        this.service = service;
    }

    @GetMapping("/nickname-availability")
    public ResponseEntity<NicknameAvailabilityResponse> check(
            @RequestParam(required = false) String nickname, HttpServletRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(service.check(request, nickname));
    }
}
