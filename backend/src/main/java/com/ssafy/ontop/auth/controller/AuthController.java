package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.service.AuthAuthorizeService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthAuthorizeService authorizeService;

    public AuthController(AuthAuthorizeService authorizeService) {
        this.authorizeService = authorizeService;
    }

    @GetMapping("/{provider}/authorize")
    public ResponseEntity<Void> authorize(@PathVariable String provider, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(authorizeService.authorize(provider, request))
                .cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer")
                .build();
    }
}
