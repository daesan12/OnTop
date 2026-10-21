package com.ssafy.ontop.auth.dto;

public record AuthCallbackResponse(String exchangeCode, long expiresIn) {
    @Override
    public String toString() {
        return "AuthCallbackResponse[redacted]";
    }
}
