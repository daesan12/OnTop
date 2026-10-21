package com.ssafy.ontop.user.dto;

import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.user.domain.CharacterGender;

public record UserOnboardingResponse(long userId, String nickname, CharacterGender characterGender,
        String accessToken, String tokenType, long expiresIn) {

    public UserOnboardingResponse(long userId, String nickname, CharacterGender characterGender, String accessToken) {
        this(userId, nickname, characterGender, accessToken, "Bearer", AccessJwtService.LIFETIME_SECONDS);
    }

    @Override
    public String toString() {
        return "UserOnboardingResponse[redacted]";
    }
}
