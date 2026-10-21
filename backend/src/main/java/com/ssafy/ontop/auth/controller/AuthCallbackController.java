package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.dto.AuthCallbackResponse;
import com.ssafy.ontop.auth.service.AuthCallbackService;
import com.ssafy.ontop.auth.service.OAuthExchangeStore;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthCallbackController {

    private final AuthCallbackService callbacks;

    public AuthCallbackController(AuthCallbackService callbacks) {
        this.callbacks = callbacks;
    }

    @GetMapping("/{provider}/callback")
    public ResponseEntity<AuthCallbackResponse> callback(@PathVariable String provider,
            HttpServletRequest request, @RequestParam MultiValueMap<String, String> params) {
        AuthCallbackService.Completion completion = callbacks.callback(provider, request, params);
        if (completion.redirect() != null) {
            return ResponseEntity.status(HttpStatus.FOUND).location(completion.redirect())
                    .cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer").build();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .body(new AuthCallbackResponse(completion.exchangeCode(), OAuthExchangeStore.LIFETIME_SECONDS));
    }
}
