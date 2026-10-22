package com.ssafy.ontop.user.controller;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.user.service.UserProfileService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UserProfileController {

    private final UserProfileService service;

    public UserProfileController(UserProfileService service) {
        this.service = service;
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> me(@AuthenticationPrincipal AuthenticatedUser user) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(service.findProfile(user.userId()));
    }
}
