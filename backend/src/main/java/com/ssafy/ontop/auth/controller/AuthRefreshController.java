package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.dto.AuthRefreshResponse;
import com.ssafy.ontop.auth.exception.AuthRefreshException;
import com.ssafy.ontop.auth.service.AuthRefreshService;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthRefreshController {

    private final AuthRefreshService service;

    public AuthRefreshController(AuthRefreshService service) {
        this.service = service;
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthRefreshResponse> refresh(HttpServletRequest request) throws IOException {
        if (request.getInputStream().read() != -1) {
            throw new AuthRefreshException(AuthRefreshException.Error.INVALID_REQUEST);
        }
        AuthRefreshService.Result result = service.refresh(request);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .header(HttpHeaders.SET_COOKIE, result.refreshCookie()).body(result.body());
    }
}
