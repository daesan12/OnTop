package com.ssafy.ontop.user.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.user.dto.UserNicknameUpdateRequest;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.user.service.UserNicknameUpdateService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UserNicknameUpdateController {

    private final UserNicknameUpdateService service;

    public UserNicknameUpdateController(UserNicknameUpdateService service) {
        this.service = service;
    }

    @PatchMapping("/me")
    public ResponseEntity<UserProfileResponse> update(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody JsonNode body) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .body(service.update(user.userId(), UserNicknameUpdateRequest.from(body)));
    }
}
