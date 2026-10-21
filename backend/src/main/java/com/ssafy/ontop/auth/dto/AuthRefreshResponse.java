package com.ssafy.ontop.auth.dto;

import com.ssafy.ontop.auth.service.AccessJwtService;

public record AuthRefreshResponse(String accessToken, String tokenType, long expiresIn) {

    public AuthRefreshResponse(String accessToken) {
        this(accessToken, "Bearer", AccessJwtService.LIFETIME_SECONDS);
    }

    @Override
    public String toString() {
        return "AuthRefreshResponse[redacted]";
    }
}
