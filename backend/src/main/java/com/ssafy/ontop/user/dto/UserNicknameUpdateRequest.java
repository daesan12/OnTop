package com.ssafy.ontop.user.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.user.exception.UserNicknameUpdateException;
import com.ssafy.ontop.user.validation.NicknameValidator;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
public record UserNicknameUpdateRequest(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
                minLength = 2, maxLength = 8, pattern = "^(?![Gg][Mm])[가-힣A-Za-z0-9]{2,8}$",
                example = "온탑고수") String nickname) {

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
