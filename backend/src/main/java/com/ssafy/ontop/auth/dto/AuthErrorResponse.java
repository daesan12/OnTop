package com.ssafy.ontop.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(requiredProperties = {"code", "message"})
public record AuthErrorResponse(String code, String message) {
}
