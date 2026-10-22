package com.ssafy.ontop.user.controller;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.user.service.UserWithdrawalService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UserWithdrawalController {

    private final UserWithdrawalService service;

    public UserWithdrawalController(UserWithdrawalService service) {
        this.service = service;
    }

    @DeleteMapping("/me")
    public ResponseEntity<Void> withdraw(@AuthenticationPrincipal AuthenticatedUser user) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        service.withdraw(user.userId());
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").build();
    }
}
