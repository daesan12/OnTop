package com.ssafy.ontop.auth.dto;

import com.ssafy.ontop.auth.service.AccessJwtService;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(requiredProperties = {"accessToken", "tokenType", "expiresIn"})
public record AuthRefreshResponse(String accessToken, String tokenType, long expiresIn) {

    public AuthRefreshResponse(String accessToken) {
        this(accessToken, "Bearer", AccessJwtService.LIFETIME_SECONDS);
    }

    @Override
    public String toString() {
        return "AuthRefreshResponse[redacted]";
    }
}
