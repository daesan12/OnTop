package com.ssafy.ontop.user.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(requiredProperties = {"nickname", "available"})
public record NicknameAvailabilityResponse(String nickname, boolean available) {
}
