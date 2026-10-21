package com.ssafy.ontop.user.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.user.dto.UserOnboardingRequest;
import com.ssafy.ontop.user.dto.UserOnboardingResponse;
import com.ssafy.ontop.user.service.UserOnboardingService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UserOnboardingController {

    private final UserOnboardingService service;

    public UserOnboardingController(UserOnboardingService service) {
        this.service = service;
    }

    @PostMapping("/onboarding")
    public ResponseEntity<UserOnboardingResponse> onboard(@RequestBody JsonNode body, HttpServletRequest request) {
        UserOnboardingService.Result result = service.onboard(request, UserOnboardingRequest.from(body));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").header(HttpHeaders.SET_COOKIE, result.refreshCookie())
                .body(result.body());
    }
}
