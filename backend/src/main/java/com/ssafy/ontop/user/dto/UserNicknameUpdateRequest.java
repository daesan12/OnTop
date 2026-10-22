package com.ssafy.ontop.user.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.user.exception.UserNicknameUpdateException;
import com.ssafy.ontop.user.validation.NicknameValidator;

public record UserNicknameUpdateRequest(String nickname) {

    public UserNicknameUpdateRequest {
        NicknameValidator.validate(nickname);
    }

    public static UserNicknameUpdateRequest from(JsonNode body) {
        if (body == null || !body.isObject() || body.size() != 1 || !body.path("nickname").isTextual()) {
            throw new UserNicknameUpdateException(UserNicknameUpdateException.Error.INVALID_REQUEST);
        }
        return new UserNicknameUpdateRequest(body.path("nickname").asText());
    }
}
