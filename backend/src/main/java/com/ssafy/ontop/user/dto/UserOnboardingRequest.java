package com.ssafy.ontop.user.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.exception.UserOnboardingException;
import com.ssafy.ontop.user.validation.NicknameValidator;

public record UserOnboardingRequest(String nickname, CharacterGender characterGender) {

    public UserOnboardingRequest {
        NicknameValidator.validate(nickname);
        if (characterGender == null) {
            throw new UserOnboardingException(UserOnboardingException.Error.INVALID_GENDER);
        }
    }

    public static UserOnboardingRequest from(JsonNode body) {
        if (body == null || !body.isObject() || body.size() != 2
                || !body.path("nickname").isTextual() || !body.path("characterGender").isTextual()) {
            throw new UserOnboardingException(UserOnboardingException.Error.INVALID_REQUEST);
        }
        CharacterGender gender;
        try {
            gender = CharacterGender.valueOf(body.path("characterGender").asText());
        } catch (IllegalArgumentException exception) {
            throw new UserOnboardingException(UserOnboardingException.Error.INVALID_GENDER);
        }
        return new UserOnboardingRequest(body.path("nickname").asText(), gender);
    }

    @Override
    public String toString() {
        return "UserOnboardingRequest[redacted]";
    }
}
