package com.ssafy.ontop.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(requiredProperties = {"exchangeCode", "expiresIn"})
public record AuthCallbackResponse(String exchangeCode, long expiresIn) {
    @Override
    public String toString() {
        return "AuthCallbackResponse[redacted]";
    }
}
