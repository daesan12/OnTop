package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.exception.AuthLogoutException;
import com.ssafy.ontop.auth.service.AuthLogoutService;
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
public class AuthLogoutController {

    private final AuthLogoutService service;

    public AuthLogoutController(AuthLogoutService service) {
        this.service = service;
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > 0 || request.getInputStream().read() != -1) {
            throw new AuthLogoutException(AuthLogoutException.Error.INVALID_REQUEST);
        }
        String clearCookie = service.logout(request);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .header(HttpHeaders.SET_COOKIE, clearCookie).build();
    }
}
